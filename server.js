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
const DEFAULT_SEGMENT_SECONDS = 180;                 // 默认一段 3 分钟
const DEFAULT_SEGMENT_TIME = DEFAULT_SEGMENT_SECONDS * 1000;
const RECENT_N = 5;                                  // 取最近 5 次样本
const MAX_SEGMENT_MS = 30 * 60 * 1000;               // 超过 30 分钟的异常样本丢弃

// ============ 车辆编号映射 ============
// UID → 短车辆编号（键改成三张卡实际读到的 UID，可刷卡看串口或查 arrival_records）
const BUS_ID_MAP = {
  '701D3A5C': 'BUS01',
  '7004795C': 'BUS02',
  '70A0915C': 'BUS03',
  '60B60F5C': 'BUS04',
};

// ============ 拥堵阈值 ============
const CONGESTION = {
  SMOOTH_MIN: 30,   // ≥ 30 km/h 畅通
  SLOW_MIN:   15,   // ≥ 15 km/h 缓行，< 15 拥堵
};

function getCongestionCode(speedKmh) {
  if (speedKmh >= CONGESTION.SMOOTH_MIN) return 0;
  if (speedKmh >= CONGESTION.SLOW_MIN)   return 1;
  return 2;
}

const CONGESTION_MAP = [
  { level: 'smooth', label: '畅通', color: '#22c55e' },
  { level: 'slow',   label: '缓行', color: '#f59e0b' },
  { level: 'jam',    label: '拥堵', color: '#ef4444' },
];

function getCongestionLevel(speedKmh) {
  return CONGESTION_MAP[getCongestionCode(speedKmh)];
}

// ============ 段工具 ============
async function getSegmentDistance(fromId, toId) {
  const [rows] = await pool.query(
    `SELECT distance_m FROM segment_distance
     WHERE from_station = ? AND to_station = ?`,
    [fromId, toId]
  );
  if (rows.length > 0) return rows[0].distance_m;

  const [reversed] = await pool.query(
    `SELECT distance_m FROM segment_distance
     WHERE from_station = ? AND to_station = ?`,
    [toId, fromId]
  );
  return reversed.length > 0 ? reversed[0].distance_m : 2000;
}

async function getRecentSegmentTime(fromId, toId) {
  const [rows] = await pool.query(
    `SELECT duration_ms FROM segment_history
     WHERE from_station = ? AND to_station = ?
       AND duration_ms > 0 AND duration_ms < ?
     ORDER BY created_at DESC LIMIT ?`,
    [fromId, toId, MAX_SEGMENT_MS, RECENT_N]
  );
  if (rows.length === 0) {
    return { ms: DEFAULT_SEGMENT_TIME, hasData: false };
  }
  const sum = rows.reduce((acc, r) => acc + r.duration_ms, 0);
  return { ms: sum / rows.length, hasData: true };
}

async function getSegmentInfo(fromId, toId) {
  const distance = await getSegmentDistance(fromId, toId);
  const { ms: avgMs, hasData } = await getRecentSegmentTime(fromId, toId);
  const avgSec = avgMs / 1000;
  const speedKmh = avgSec > 0 ? (distance / avgSec) * 3.6 : 0;

  return {
    from: fromId, to: toId,
    distance_m: distance,
    avg_time_ms: Math.round(avgMs),
    avg_time_min: Math.round(avgMs / 60000 * 10) / 10,
    speed_kmh: Math.round(speedKmh * 10) / 10,
    congestion: getCongestionLevel(speedKmh),
    has_data: hasData,
    borrowed: false,
    note: null,
  };
}

async function getSegmentInfoFallback(fromId, toId, refFromId, refToId, note) {
  const info = await getSegmentInfo(fromId, toId);
  if (info.has_data) return info;

  const ref = await getSegmentInfo(refFromId, refToId);
  if (!ref.has_data) return info;

  return {
    ...info,
    distance_m: ref.distance_m,
    avg_time_ms: ref.avg_time_ms,
    avg_time_min: ref.avg_time_min,
    speed_kmh: ref.speed_kmh,
    congestion: { ...ref.congestion },
    borrowed: true,
    note,
  };
}

async function getSegmentSecondsFallback(fromId, toId, refFromId, refToId) {
  const own = await getRecentSegmentTime(fromId, toId);
  if (own.hasData) return Math.round(own.ms / 1000);

  const ref = await getRecentSegmentTime(refFromId, refToId);
  return Math.round((ref.hasData ? ref.ms : own.ms) / 1000);
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

async function getBusToStationSeconds(busStationIndex, targetIndex, stations) {
  if (busStationIndex === targetIndex) return { seconds: 0, pathDirection: 'same' };

  let forwardSeconds = Infinity;
  if (busStationIndex < targetIndex) {
    forwardSeconds = 0;
    for (let i = busStationIndex; i < targetIndex; i++) {
      forwardSeconds += await getSegmentSecondsFallback(
        stations[i].id, stations[i + 1].id,
        stations[i + 1].id, stations[i].id
      );
    }
  }

  let backwardSeconds = Infinity;
  if (busStationIndex > targetIndex) {
    backwardSeconds = 0;
    for (let i = busStationIndex; i > targetIndex; i--) {
      backwardSeconds += await getSegmentSecondsFallback(
        stations[i].id, stations[i - 1].id,
        stations[i - 1].id, stations[i].id
      );
    }
  }

  return forwardSeconds <= backwardSeconds
    ? { seconds: forwardSeconds, pathDirection: 'forward' }
    : { seconds: backwardSeconds, pathDirection: 'backward' };
}

// 根据最近一条"不同站"的到站记录推断方向（仅用于刷卡上报时更新 direction 字段）
async function detectDirection(busId, currentSortIndex) {
  const [rows] = await pool.query(
    `SELECT s.sort_index
     FROM arrival_records a JOIN stations s ON a.station_id = s.id
     WHERE a.bus_id = ? AND s.sort_index <> ?
     ORDER BY a.arrival_time DESC LIMIT 1`,
    [busId, currentSortIndex]
  );
  if (rows.length === 0) return 'forward';

  const prevIdx = rows[0].sort_index;
  if (currentSortIndex > prevIdx) return 'forward';
  if (currentSortIndex < prevIdx) return 'backward';
  return 'forward';
}

// ============================================================
//                     接口：ESP32 上报
// ============================================================
app.post('/api/report', async (req, res) => {
  let { busId, stationId } = req.body;
  if (!busId || !stationId) return res.status(400).json({ code: 400, msg: '参数错误' });
  busId = BUS_ID_MAP[busId] || busId;   // UID 转短车辆编号（未登记的卡原样上报）

  try {
    const now = new Date();
    const [stationRows] = await pool.query('SELECT * FROM stations WHERE id = ?', [stationId]);
    if (stationRows.length === 0) return res.status(400).json({ code: 400, msg: '站点不存在' });
    const station = stationRows[0];

    const [prevRows] = await pool.query('SELECT * FROM bus_status WHERE bus_id = ?', [busId]);
    const prev = prevRows[0];

    if (prev && prev.station_id !== stationId) {
      const [prevStationRows] = await pool.query('SELECT * FROM stations WHERE id = ?', [prev.station_id]);
      if (prevStationRows.length > 0) {
        const prevStation = prevStationRows[0];
        if (station.sort_index !== prevStation.sort_index) {
          const duration = now - new Date(prev.arrival_time);
          await pool.query(
            `INSERT INTO segment_history (from_station, to_station, duration_ms) VALUES (?, ?, ?)`,
            [prev.station_id, stationId, duration]
          );
        }
      }
    }

    if (!prev || prev.station_id !== stationId) {
      await pool.query(
        `INSERT INTO arrival_records (bus_id, station_id, arrival_time) VALUES (?, ?, ?)`,
        [busId, stationId, now]
      );
    }

    // 换站才重新推断方向；同站重刷保持原方向
    const direction = (!prev || prev.station_id !== stationId)
      ? await detectDirection(busId, station.sort_index)
      : (prev.direction || 'forward');

    await pool.query(
      `INSERT INTO bus_status (bus_id, station_id, arrival_time, line, direction)
       VALUES (?, ?, ?, '1路', ?)
       ON DUPLICATE KEY UPDATE
         arrival_time = IF(station_id = VALUES(station_id), arrival_time, VALUES(arrival_time)),
         station_id   = VALUES(station_id),
         direction    = VALUES(direction)`,
      [busId, stationId, now, direction]
    );

    const [stationsAll] = await pool.query('SELECT * FROM stations ORDER BY sort_index');
    const lastIdx = stationsAll.length - 1;
    let tip = null;
    if (station.sort_index === lastIdx) tip = '已到终点站，可折返';
    else if (station.sort_index === 0)  tip = '已到起点站，可折返';

    console.log(`[上报] 车辆 ${busId} 到达 ${station.name}${tip ? '（' + tip + '）' : ''}`);
    res.json({ code: 200, msg: 'ok', tip });
  } catch (err) {
    console.error('上报失败:', err);
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

// ============================================================
//       接口：手动调度
// ============================================================
// 调度 = 把一辆车直接调到指定站，作为下一班的发车起点。
// 调度不是真实行驶，因此：
//   1) 不写 arrival_records（不伪造到站历史）
//   2) 不写 segment_history（不污染路段耗时与拥堵统计）
//   3) 方向显式写入 direction 字段：
//      - 调到起点站 -> forward（下一班去程）
//      - 调到终点站 -> backward（下一班回程）
//      - 调到中间站 -> 可用 body.direction 指定，默认保持原方向
// body: { toStation, direction? }
app.post('/api/dispatch/:busId', async (req, res) => {
  const { busId } = req.params;
  const { toStation, direction: reqDirection } = req.body || {};
  if (!toStation) return res.status(400).json({ code: 400, msg: '缺少 toStation 参数' });

  try {
    const [st] = await pool.query('SELECT * FROM stations WHERE id = ?', [toStation]);
    if (st.length === 0) return res.status(400).json({ code: 400, msg: '目标站不存在' });
    const targetStation = st[0];

    const [prevRows] = await pool.query('SELECT * FROM bus_status WHERE bus_id = ?', [busId]);
    const prev = prevRows[0];
    if (!prev) return res.status(404).json({ code: 404, msg: '车辆不存在，请先刷卡上报' });
    if (prev.station_id === toStation) {
      return res.status(400).json({ code: 400, msg: `车辆 ${busId} 已在 ${targetStation.name}` });
    }

    const [idxRows] = await pool.query(
      'SELECT MIN(sort_index) AS minIdx, MAX(sort_index) AS maxIdx FROM stations'
    );
    const { minIdx, maxIdx } = idxRows[0];

    let direction;
    if (reqDirection === 'forward' || reqDirection === 'backward') {
      direction = reqDirection;                       // 显式指定优先
    } else if (targetStation.sort_index === minIdx) {
      direction = 'forward';                          // 调回起点 -> 去程待发
    } else if (targetStation.sort_index === maxIdx) {
      direction = 'backward';                         // 调到终点 -> 回程待发
    } else {
      direction = prev.direction || 'forward';        // 中间站保持原方向
    }

    // 只更新位置、发车时间、方向，不动任何历史表
    await pool.query(
      `UPDATE bus_status
       SET station_id = ?, arrival_time = NOW(), direction = ?
       WHERE bus_id = ?`,
      [toStation, direction, busId]
    );

    console.log(`🚌 [调度] 车辆 ${busId} 已成功调度至 ${targetStation.name}（${direction === 'forward' ? '去程' : '回程'}）`);
    res.json({
      code: 200,
      msg: '调度成功',
      data: { bus_id: busId, to_station: toStation, direction },
    });
  } catch (err) {
    console.error('调度失败:', err);
    res.status(500).json({ code: 500, msg: '调度失败', error: err.message });
  }
});

// ============================================================
//                接口：查询车辆与站点
// ============================================================
app.get('/api/buses', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.bus_id, b.station_id, s.name AS station_name,
             s.sort_index AS station_index, b.line, b.arrival_time, b.direction
      FROM bus_status b JOIN stations s ON b.station_id = s.id ORDER BY b.bus_id
    `);
    rows.forEach(r => { r.direction = r.direction || 'forward'; });
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '查询失败', error: err.message });
  }
});

app.get('/api/stations', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stations ORDER BY sort_index');
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '查询失败', error: err.message });
  }
});

// ============================================================
//                接口：用户注册（新增）
// ============================================================
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ code: 400, msg: '用户名和密码不能为空' });
  try {
    const [rows] = await pool.query('SELECT username FROM users WHERE username = ?', [username]);
    if (rows.length > 0) return res.status(400).json({ code: 400, msg: '用户名已存在' });
    await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
    res.json({ code: 200, msg: '注册成功' });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

// ============================================================
//                接口：用户登录
// ============================================================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ code: 400, msg: '用户名和密码不能为空' });
  try {
    const [rows] = await pool.query(
      'SELECT username FROM users WHERE username = ? AND password = ?',
      [username, password]
    );
    if (rows.length === 0) return res.status(401).json({ code: 401, msg: '用户名或密码错误' });
    res.json({ code: 200, data: { username: rows[0].username } });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

// ============================================================
//                接口：路段路况
// ============================================================
app.get('/api/segments', async (req, res) => {
  try {
    const [stations] = await pool.query('SELECT * FROM stations ORDER BY sort_index');
    const forward = [];
    const backward = [];

    for (let i = 0; i < stations.length - 1; i++) {
      const s1 = stations[i];
      const s2 = stations[i + 1];

      forward.push(await getSegmentInfo(s1.id, s2.id));

      backward.push(await getSegmentInfoFallback(
        s2.id, s1.id,
        s1.id, s2.id,
        '暂无反向实测，参考正向数据'
      ));
    }

    res.json({ code: 200, data: forward, backward });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '查询失败', error: err.message });
  }
});

// ============================================================
//                接口：ETA 分方向
// ============================================================
app.get('/api/eta/:busId', async (req, res) => {
  const { busId } = req.params;
  try {
    const [statusRows] = await pool.query(
      `SELECT b.*, s.sort_index FROM bus_status b
       JOIN stations s ON b.station_id = s.id WHERE b.bus_id = ?`,
      [busId]
    );
    if (statusRows.length === 0) return res.status(404).json({ code: 404, msg: '车辆不存在' });

    const current = statusRows[0];
    const [stations] = await pool.query('SELECT * FROM stations ORDER BY sort_index');

    // 方向直接读字段（上报/调度时已写入）
    const direction = current.direction || 'forward';
    const note = direction === 'forward'
      ? '暂无正向实测，参考反向数据'
      : '暂无反向实测，参考正向数据';

    const now = Date.now();
    const etas = [];
    let cumulative = 0;
    const pad = n => String(n).padStart(2, '0');

    if (direction === 'forward') {
      for (let i = current.sort_index; i < stations.length - 1; i++) {
        const from = stations[i];
        const to = stations[i + 1];
        const info = await getSegmentInfoFallback(from.id, to.id, to.id, from.id, note);
        cumulative += info.avg_time_ms;

        const arriveAt = new Date(now + cumulative);
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
            borrowed: info.borrowed,
            note: info.note,
          },
        });
      }
    } else {
      for (let i = current.sort_index; i > 0; i--) {
        const from = stations[i];
        const to = stations[i - 1];
        const info = await getSegmentInfoFallback(from.id, to.id, to.id, from.id, note);
        cumulative += info.avg_time_ms;

        const arriveAt = new Date(now + cumulative);
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
            borrowed: info.borrowed,
            note: info.note,
          },
        });
      }
    }

    res.json({ code: 200, data: etas, direction });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '计算失败', error: err.message });
  }
});

// ============================================================
//                接口：起终点估算
// ============================================================
app.get('/api/estimate', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ code: 400, msg: '缺少 from 或 to 参数' });
  if (from === to) return res.status(400).json({ code: 400, msg: '起点和终点不能相同' });

  try {
    const [stations] = await pool.query('SELECT * FROM stations ORDER BY sort_index');
    const stationMap = {};
    stations.forEach(s => { stationMap[s.id] = s; });

    const fromStation = stationMap[from];
    const toStation = stationMap[to];
    if (!fromStation || !toStation) return res.status(400).json({ code: 400, msg: '站点不存在' });

    const direction = toStation.sort_index > fromStation.sort_index ? 'forward' : 'backward';
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
      const seconds = await getSegmentSecondsFallback(seg.from, seg.to, seg.to, seg.from);
      const speedKmh = await getSegmentSpeed(seg.from, seg.to, seconds);
      const congested = getCongestionCode(speedKmh);
      segments.push({ from: seg.from, to: seg.to, seconds, congested });
      totalSeconds += seconds;
    }

    let nextBusId = null;
    let nextDepartureSeconds = Infinity;
    const [allBuses] = await pool.query(
      `SELECT b.bus_id, b.station_id, s.sort_index AS station_index
       FROM bus_status b JOIN stations s ON b.station_id = s.id`
    );

    for (const bus of allBuses) {
      const { seconds } = await getBusToStationSeconds(
        bus.station_index, fromStation.sort_index, stations
      );
      if (seconds < nextDepartureSeconds) {
        nextDepartureSeconds = seconds;
        nextBusId = bus.bus_id;
      }
    }

    let nextDeparture = null;
    if (nextBusId && nextDepartureSeconds !== Infinity) {
      const arrival = new Date(Date.now() + nextDepartureSeconds * 1000);
      const pad = n => String(n).padStart(2, '0');
      nextDeparture = `${pad(arrival.getHours())}:${pad(arrival.getMinutes())}`;
    }

    const waitSeconds = nextDepartureSeconds !== Infinity ? nextDepartureSeconds : 0;
    const finalTotalSeconds = waitSeconds + totalSeconds;

    res.json({
      code: 200,
      data: {
        direction,
        next_bus_id: nextBusId,
        next_departure: nextDeparture,
        estimated_seconds: finalTotalSeconds,
        estimated_text: formatDuration(finalTotalSeconds),
        segments,
      },
    });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

// ============================================================
//                接口：历史记录与清空
// ============================================================
app.get('/api/history/:busId', async (req, res) => {
  const { busId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT a.*, s.name AS station_name
       FROM arrival_records a JOIN stations s ON a.station_id = s.id
       WHERE a.bus_id = ? ORDER BY a.arrival_time DESC LIMIT 50`,
      [busId]
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '查询失败', error: err.message });
  }
});

app.delete('/api/history/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM segment_history');
    console.log('🧹 [系统] 历史耗时已清空（车辆位置与方向保留）');
    res.json({ code: 200, msg: '历史耗时清空成功' });
  } catch (err) {
    console.error('清空数据失败:', err);
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

app.delete('/api/reset/all', async (req, res) => {
  try {
    await pool.query('DELETE FROM arrival_records');
    await pool.query('DELETE FROM segment_history');
    await pool.query('DELETE FROM bus_status');
    console.log('🔄 [系统] 车辆状态和历史数据已全部重置');
    res.json({ code: 200, msg: '彻底重置成功' });
  } catch (err) {
    console.error('重置失败:', err);
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

// ============================================================
//                接口：数据统计中心（3个接口）
// ============================================================

// 1. 近 24 小时运行热度
app.get('/api/stats/heatmap', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT HOUR(arrival_time) AS hour, COUNT(id) AS count
      FROM arrival_records
      WHERE arrival_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY HOUR(arrival_time)
    `);

    const currentHour = new Date().getHours();
    const result = [];
    for (let i = 23; i >= 0; i--) {
      const h = (currentHour - i + 24) % 24;
      const found = rows.find(r => r.hour === h);
      result.push({ hour: `${h}:00`, count: found ? found.count : 0 });
    }
    res.json({ code: 200, data: result });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '统计失败', error: err.message });
  }
});

// 2. 实时路况占比（与 /api/segments 同口径：当前路段状态，正反向都计数）
app.get('/api/stats/congestion', async (req, res) => {
  try {
    const [stations] = await pool.query('SELECT * FROM stations ORDER BY sort_index');

    let smooth = 0, slow = 0, jam = 0;
    for (let i = 0; i < stations.length - 1; i++) {
      const s1 = stations[i];
      const s2 = stations[i + 1];

      const f = await getSegmentInfo(s1.id, s2.id);
      const b = await getSegmentInfoFallback(s2.id, s1.id, s1.id, s2.id, null);

      for (const seg of [f, b]) {
        const level = seg.congestion.level;
        if (level === 'smooth') smooth++;
        else if (level === 'slow') slow++;
        else jam++;
      }
    }

    res.json({
      code: 200,
      data: [
        { name: '畅通', value: smooth },
        { name: '缓行', value: slow },
        { name: '拥堵', value: jam }
      ]
    });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '统计失败', error: err.message });
  }
});

// 3. 路段平均耗时排名（Top 5）——剔除异常样本
app.get('/api/stats/duration', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT from_station, to_station, AVG(duration_ms) AS avg_ms
      FROM segment_history
      WHERE duration_ms > 0 AND duration_ms < ?
      GROUP BY from_station, to_station
      ORDER BY avg_ms DESC
      LIMIT 5
    `, [MAX_SEGMENT_MS]);

    const [stations] = await pool.query('SELECT id, name FROM stations');
    const stationMap = {};
    stations.forEach(s => { stationMap[s.id] = s.name; });

    const data = rows.map(r => ({
      name: `${stationMap[r.from_station] || r.from_station} → ${stationMap[r.to_station] || r.to_station}`,
      value: Math.round(r.avg_ms / 6000) / 10
    }));

    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, msg: '统计失败', error: err.message });
  }
});

// 全局错误拦截
app.use((err, req, res, next) => {
  console.error('🚨 系统发生错误:', err.message);
  res.status(500).json({ code: 500, msg: '服务器内部错误，请稍后再试' });
});

app.listen(3000, () => {
  console.log('🚀 后端已启动: http://localhost:3000');
});
