const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ MySQL 连接池 ============
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '12303010227',       // ← 改成你的 MySQL 密码
  database: 'bus_system',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL 连接成功');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL 连接失败:', err.message);
  }
})();

// ============ 常量 ============
const DEFAULT_SEGMENT_TIME = 3 * 60 * 1000;
const DEFAULT_SEGMENT_SECONDS = 720;
const RECENT_N = 5;

// ============ 拥堵 ============
function getCongestionLevel(speedKmh) {
  if (speedKmh >= 25) return { level: 'smooth', label: '畅通', color: '#22c55e' };
  if (speedKmh >= 10) return { level: 'slow',   label: '缓行', color: '#f59e0b' };
  return                     { level: 'jam',    label: '拥堵', color: '#ef4444' };
}

function getCongestionCode(speedKmh) {
  if (speedKmh >= 40) return 0;
  if (speedKmh >= 30) return 1;
  return 2;
}

// ============ 工具 ============
async function getAvgSegmentTime(fromId, toId) {
  const [rows] = await pool.query(
    `SELECT duration_ms FROM segment_history
     WHERE from_station = ? AND to_station = ?
       AND duration_ms > 0 AND duration_ms < 1800000
     ORDER BY created_at DESC LIMIT ?`,
    [fromId, toId, RECENT_N]
  );
  if (rows.length === 0) return DEFAULT_SEGMENT_TIME;
  return rows.reduce((acc, r) => acc + r.duration_ms, 0) / rows.length;
}

async function getSegmentDistance(fromId, toId) {
  const [rows] = await pool.query(
    `SELECT distance_m FROM segment_distance
     WHERE from_station = ? AND to_station = ?`,
    [fromId, toId]
  );
  return rows.length > 0 ? rows[0].distance_m : 2000;
}

async function getSegmentInfo(fromId, toId) {
  const distance = await getSegmentDistance(fromId, toId);
  const avgMs = await getAvgSegmentTime(fromId, toId);
  const avgSec = avgMs / 1000;
  const speedKmh = (distance / avgSec) * 3.6;
  const congestion = getCongestionLevel(speedKmh);
  return {
    from: fromId, to: toId,
    distance_m: distance,
    avg_time_ms: Math.round(avgMs),
    avg_time_min: Math.round(avgMs / 60000 * 10) / 10,
    speed_kmh: Math.round(speedKmh * 10) / 10,
    congestion,
  };
}

async function getSegmentSeconds(fromId, toId) {
  const [rows] = await pool.query(
    `SELECT duration_ms FROM segment_history
     WHERE from_station = ? AND to_station = ?
       AND duration_ms > 0 AND duration_ms < 3600000
     ORDER BY created_at DESC LIMIT ?`,
    [fromId, toId, RECENT_N]
  );
  if (rows.length === 0) return DEFAULT_SEGMENT_SECONDS;
  return Math.round(rows.reduce((a, r) => a + r.duration_ms, 0) / rows.length / 1000);
}

async function getSegmentSpeed(fromId, toId, seconds) {
  const distance = await getSegmentDistance(fromId, toId);
  if (seconds <= 0) return 0;
  return (distance / seconds) * 3.6;
}

function formatDuration(sec) {
  if (sec < 60) return `约${sec}秒`;
  const min = Math.round(sec / 60);
  if (min < 60) return `约${min}分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `约${h}小时${m}分钟` : `约${h}小时`;
}

// 计算某车到某站的最短耗时（双向取最小）
async function getBusToStationSeconds(busStationIndex, targetIndex, stations) {
  if (busStationIndex === targetIndex) {
    return { seconds: 0, pathDirection: 'same' };
  }

  let forwardSeconds = 0;
  if (busStationIndex < targetIndex) {
    for (let i = busStationIndex; i < targetIndex; i++) {
      forwardSeconds += await getSegmentSeconds(stations[i].id, stations[i + 1].id);
    }
  } else {
    forwardSeconds = Infinity;
  }

  let backwardSeconds = 0;
  if (busStationIndex > targetIndex) {
    for (let i = busStationIndex; i > targetIndex; i--) {
      backwardSeconds += await getSegmentSeconds(stations[i].id, stations[i - 1].id);
    }
  } else {
    backwardSeconds = Infinity;
  }

  return forwardSeconds <= backwardSeconds
    ? { seconds: forwardSeconds, pathDirection: 'forward' }
    : { seconds: backwardSeconds, pathDirection: 'backward' };
}

// ============================================================
//                     接口 1：ESP32 上报
// ============================================================
app.post('/api/report', async (req, res) => {
  const { busId, stationId } = req.body;
  if (!busId || !stationId) {
    return res.status(400).json({ code: 400, msg: '参数错误' });
  }

  try {
    const now = new Date();
    const [stationRows] = await pool.query(
      'SELECT * FROM stations WHERE id = ?', [stationId]
    );
    if (stationRows.length === 0) {
      return res.status(400).json({ code: 400, msg: '站点不存在' });
    }
    const station = stationRows[0];

    const [prevRows] = await pool.query(
      'SELECT * FROM bus_status WHERE bus_id = ?', [busId]
    );
    const prev = prevRows[0];

    if (prev && prev.station_id !== stationId) {
      const [prevStationRows] = await pool.query(
        'SELECT * FROM stations WHERE id = ?', [prev.station_id]
      );
      if (prevStationRows.length > 0) {
        const prevStation = prevStationRows[0];
        if (station.sort_index !== prevStation.sort_index) {
          const duration = now - new Date(prev.arrival_time);
          await pool.query(
            `INSERT INTO segment_history (from_station, to_station, duration_ms)
             VALUES (?, ?, ?)`,
            [prev.station_id, stationId, duration]
          );
          console.log(`[历史] ${prev.station_id}->${stationId} 耗时 ${Math.round(duration / 1000)} 秒`);
        }
      }
    }

    await pool.query(
      `INSERT INTO arrival_records (bus_id, station_id, arrival_time)
       VALUES (?, ?, ?)`,
      [busId, stationId, now]
    );

    await pool.query(
      `INSERT INTO bus_status (bus_id, station_id, arrival_time, line)
       VALUES (?, ?, ?, '1路')
       ON DUPLICATE KEY UPDATE
         station_id = VALUES(station_id),
         arrival_time = VALUES(arrival_time)`,
      [busId, stationId, now]
    );

    console.log(`[上报] 车辆 ${busId} 到达 ${station.name}`);
    res.json({ code: 200, msg: 'ok' });
  } catch (err) {
    console.error('上报失败:', err);
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

// ============================================================
//                接口 2：查询所有车辆
// ============================================================
app.get('/api/buses', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.bus_id, b.station_id, s.name AS station_name,
             s.sort_index AS station_index, b.line, b.arrival_time
      FROM bus_status b
      JOIN stations s ON b.station_id = s.id
      ORDER BY b.bus_id
    `);
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '查询失败', error: err.message });
  }
});

// ============================================================
//                接口 3：查询站点
// ============================================================
app.get('/api/stations', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stations ORDER BY sort_index');
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '查询失败', error: err.message });
  }
});

// ============================================================
//                接口 4：用户登录 ⭐ 新增
// ============================================================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ code: 400, msg: '用户名和密码不能为空' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT username FROM users WHERE username = ? AND password = ?',
      [username, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ code: 401, msg: '用户名或密码错误' });
    }

    console.log(`[登录] 用户 ${rows[0].username} 登录成功`);
    res.json({
      code: 200,
      data: { username: rows[0].username },
    });
  } catch (err) {
    console.error('[登录] 失败:', err);
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

// ============================================================
//        接口 5：查询所有路段
// ============================================================
app.get('/api/segments', async (req, res) => {
  try {
    const [stations] = await pool.query('SELECT * FROM stations ORDER BY sort_index');
    const segments = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const info = await getSegmentInfo(stations[i].id, stations[i + 1].id);
      segments.push(info);
    }
    res.json({ code: 200, data: segments });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '查询失败', error: err.message });
  }
});

// ============================================================
//        接口 6：某车的 ETA
// ============================================================
app.get('/api/eta/:busId', async (req, res) => {
  const { busId } = req.params;
  try {
    const [statusRows] = await pool.query(
      `SELECT b.*, s.sort_index FROM bus_status b
       JOIN stations s ON b.station_id = s.id
       WHERE b.bus_id = ?`, [busId]
    );
    if (statusRows.length === 0) {
      return res.status(404).json({ code: 404, msg: '车辆不存在' });
    }
    const current = statusRows[0];
    const [stations] = await pool.query('SELECT * FROM stations ORDER BY sort_index');

    const now = Date.now();
    const etas = [];
    let cumulative = 0;

    for (let i = current.sort_index; i < stations.length - 1; i++) {
      const from = stations[i];
      const to = stations[i + 1];
      const info = await getSegmentInfo(from.id, to.id);
      cumulative += info.avg_time_ms;

      const arriveAt = new Date(now + cumulative);
      const pad = n => String(n).padStart(2, '0');

      etas.push({
        stationId: to.id,
        stationName: to.name,
        etaMinutes: Math.round(cumulative / 60000),
        etaSeconds: Math.round(cumulative / 1000),
        arriveTime: `${pad(arriveAt.getHours())}:${pad(arriveAt.getMinutes())}`,
        segment: {
          distance_m: info.distance_m,
          speed_kmh: info.speed_kmh,
          congestion: info.congestion,
        },
      });
    }

    res.json({ code: 200, data: etas });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '计算失败', error: err.message });
  }
});

// ============================================================
//        接口 7：按起点终点查询 ETA
// ============================================================
app.get('/api/estimate', async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ code: 400, msg: '缺少 from 或 to 参数' });
  }
  if (from === to) {
    return res.status(400).json({ code: 400, msg: '起点和终点不能相同' });
  }

  try {
    const [stations] = await pool.query('SELECT * FROM stations ORDER BY sort_index');
    const stationMap = {};
    stations.forEach(s => { stationMap[s.id] = s; });

    const fromStation = stationMap[from];
    const toStation = stationMap[to];
    if (!fromStation || !toStation) {
      return res.status(400).json({ code: 400, msg: '站点不存在' });
    }

    const direction = toStation.sort_index > fromStation.sort_index ? 'forward' : 'backward';
    console.log(`[ETA] ${from} → ${to}  方向：${direction}`);

    const segmentIds = [];
    if (direction === 'forward') {
      for (let i = fromStation.sort_index; i < toStation.sort_index; i++) {
        segmentIds.push({ from: stations[i].id, to: stations[i + 1].id });
      }
    } else {
      for (let i = fromStation.sort_index; i > toStation.sort_index; i--) {
        segmentIds.push({ from: stations[i].id, to: stations[i - 1].id });
      }
    }

    const segments = [];
    let totalSeconds = 0;

    for (const seg of segmentIds) {
      const seconds = await getSegmentSeconds(seg.from, seg.to);
      const speedKmh = await getSegmentSpeed(seg.from, seg.to, seconds);
      const congested = getCongestionCode(speedKmh);
      segments.push({ from: seg.from, to: seg.to, seconds, congested });
      totalSeconds += seconds;
    }

    // 找最早能到起点站的车
    let nextBusId = null;
    let nextDepartureSeconds = Infinity;

    const [allBuses] = await pool.query(`
      SELECT b.bus_id, b.station_id, s.sort_index AS station_index
      FROM bus_status b
      JOIN stations s ON b.station_id = s.id
    `);

    for (const bus of allBuses) {
      const { seconds: busToStartSeconds } = await getBusToStationSeconds(
        bus.station_index, fromStation.sort_index, stations
      );
      if (busToStartSeconds < nextDepartureSeconds) {
        nextDepartureSeconds = busToStartSeconds;
        nextBusId = bus.bus_id;
      }
    }

    let nextDeparture = null;
    if (nextBusId && nextDepartureSeconds !== Infinity) {
      const arrival = new Date(Date.now() + nextDepartureSeconds * 1000);
      const pad = n => String(n).padStart(2, '0');
      nextDeparture = `${pad(arrival.getHours())}:${pad(arrival.getMinutes())}`;
    }

    const finalTotalSeconds = (nextDepartureSeconds !== Infinity ? nextDepartureSeconds : 0)
                              + totalSeconds;

    const estimatedText = formatDuration(finalTotalSeconds);

    res.json({
      code: 200,
      data: {
        next_bus_id: nextBusId,
        next_departure: nextDeparture,
        estimated_seconds: finalTotalSeconds,
        estimated_text: estimatedText,
        segments,
      }
    });
  } catch (err) {
    console.error('[estimate] 失败:', err);
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

// ============================================================
//                接口 8：历史记录
// ============================================================
app.get('/api/history/:busId', async (req, res) => {
  const { busId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT a.*, s.name AS station_name
       FROM arrival_records a
       JOIN stations s ON a.station_id = s.id
       WHERE a.bus_id = ?
       ORDER BY a.arrival_time DESC
       LIMIT 50`, [busId]
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '查询失败', error: err.message });
  }
});

// ============ 启动 ============
app.listen(3000, () => {
  console.log('🚀 后端已启动: http://localhost:3000');
});