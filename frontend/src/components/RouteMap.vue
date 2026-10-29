<template>
  <main class="map-area">
    <div class="map-header">
      <div class="title-wrap">
        <div class="title-row">
          <span class="title-icon">📍</span>
          <h1 class="map-title">1 路公交 · 实时运行线路图</h1>
        </div>
        <p class="map-subtitle">
          共 {{ stations.length }} 个站点 · 每 3 秒自动刷新
        </p>
      </div>
      <div class="legend">
        <div class="legend-item">
          <span class="legend-dot" style="background: #22c55e;"></span>
          <span>畅通</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #f59e0b;"></span>
          <span>缓行</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background: #ef4444;"></span>
          <span>拥堵</span>
        </div>
      </div>
    </div>

    <div class="route-wrap">
      <div class="route">
        <!-- 底灰线 -->
        <div class="route-line-base"></div>

        <!-- 每段路用拥堵颜色渲染 -->
        <div
          v-for="(seg, i) in segments"
          :key="`${seg.from}-${seg.to}`"
          class="route-segment"
          :style="{
            left: stationPos(i) + '%',
            width: segmentWidth(i) + '%',
            background: seg.congestion.color,
          }"
          :title="`${stationName(seg.from)} → ${stationName(seg.to)}\n距离 ${seg.distance_m} 米\n平均速度 ${seg.speed_kmh} km/h\n状态：${seg.congestion.label}`"
        >
          <div class="segment-tooltip">
            <div class="tt-title">{{ stationName(seg.from) }} → {{ stationName(seg.to) }}</div>
            <div class="tt-row">
              <span>距离</span>
              <b>{{ seg.distance_m }} 米</b>
            </div>
            <div class="tt-row">
              <span>平均速度</span>
              <b>{{ seg.speed_kmh }} km/h</b>
            </div>
            <div class="tt-row">
              <span>平均耗时</span>
              <b>{{ seg.avg_time_min }} 分</b>
            </div>
            <div class="tt-row">
              <span>状态</span>
              <b :style="{ color: seg.congestion.color }">
                {{ seg.congestion.label }}
              </b>
            </div>
          </div>
        </div>

        <!-- 站点 -->
        <div
          v-for="(s, i) in stations"
          :key="s.id"
          class="station"
          :style="{ left: stationPos(i) + '%' }"
        >
          <div class="station-badge">{{ i + 1 }}</div>
          <div class="station-dot">
            <div class="station-inner"></div>
            <div class="station-ring"></div>
          </div>
          <div class="station-info">
            <div class="station-name">{{ s.name }}</div>
            <div class="station-id">{{ s.id }}</div>
          </div>

          <div
            v-if="getStationBusCount(i) > 0"
            class="station-count"
          >
            {{ getStationBusCount(i) }} 辆
          </div>
        </div>

        <!-- 车辆 -->
        <div
          v-for="bus in buses"
          :key="bus.bus_id"
          class="bus-icon"
          :class="{ arrived: bus.station_index >= maxIndex }"
          :style="{
            left: busPos(bus) + '%',
            top: `calc(30% + ${getBusOffset(bus)}px)`
          }"
        >
          <div class="bus-body">
            <span class="bus-emoji">🚌</span>
            <span class="bus-label">{{ bus.bus_id }}</span>
          </div>

          <div
            class="eta-badge"
            v-if="bus.etas && bus.etas.length > 0"
          >
            {{ bus.etas[0].arriveTime }} 到达 · {{ bus.etas[0].etaMinutes }}分
          </div>

          <div
            class="eta-badge arrived"
            v-else-if="bus.station_index >= maxIndex"
          >
            已到终点
          </div>
        </div>
      </div>
    </div>

    <div class="map-footer">
      <div class="footer-item">
        <div class="footer-icon" style="background: #dbeafe; color: #2563eb;">🚌</div>
        <div>
          <div class="footer-label">当前在线车辆</div>
          <div class="footer-value">{{ buses.length }} 辆</div>
        </div>
      </div>
      <div class="footer-item">
        <div class="footer-icon" style="background: #dcfce7; color: #16a34a;">🟢</div>
        <div>
          <div class="footer-label">运行中</div>
          <div class="footer-value">{{ runningCount }} 辆</div>
        </div>
      </div>
      <div class="footer-item">
        <div class="footer-icon" style="background: #fef3c7; color: #f59e0b;">⚡</div>
        <div>
          <div class="footer-label">全程平均速度</div>
          <div class="footer-value">{{ avgSpeed }} km/h</div>
        </div>
      </div>
      <div class="footer-item">
        <div
          class="footer-icon"
          :style="connected
            ? 'background: #dcfce7; color: #16a34a;'
            : 'background: #fee2e2; color: #dc2626;'"
        >
          ●
        </div>
        <div>
          <div class="footer-label">系统状态</div>
          <div class="footer-value" :class="connected ? 'ok' : 'bad'">
            {{ connected ? '正常' : '异常' }}
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  buses: { type: Array, default: () => [] },
  stations: { type: Array, default: () => [] },
  segments: { type: Array, default: () => [] },
  maxIndex: { type: Number, default: 0 },
  connected: { type: Boolean, default: false },
})

const runningCount = computed(() =>
  props.buses.filter(b => b.station_index < props.maxIndex).length
)

const avgSpeed = computed(() => {
  if (props.segments.length === 0) return 0
  const sum = props.segments.reduce((a, s) => a + s.speed_kmh, 0)
  return (sum / props.segments.length).toFixed(1)
})

function stationPos(index) {
  if (props.stations.length <= 1) return 50
  return (index / (props.stations.length - 1)) * 100
}

function segmentWidth(i) {
  if (props.stations.length <= 1) return 0
  return (1 / (props.stations.length - 1)) * 100
}

function busPos(bus) {
  return stationPos(bus.station_index ?? 0)
}

function getBusOffset(bus) {
  const idx = bus.station_index ?? 0
  const same = props.buses.filter(b => (b.station_index ?? 0) === idx)
  const order = same.findIndex(b => b.bus_id === bus.bus_id)
  return order * 70
}

function getStationBusCount(stationIndex) {
  return props.buses.filter(b => (b.station_index ?? 0) === stationIndex).length
}

function stationName(id) {
  const s = props.stations.find(x => x.id === id)
  return s ? s.name : id
}
</script>

<style scoped>
.map-area {
  flex: 1;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  padding: 30px 40px 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 标题栏 */
.map-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
  flex-shrink: 0;
}
.title-wrap { display: flex; flex-direction: column; gap: 4px; }
.title-row { display: flex; align-items: center; gap: 10px; }
.title-icon { font-size: 22px; }
.map-title { font-size: 22px; font-weight: 700; color: #0f172a; }
.map-subtitle { font-size: 13px; color: #94a3b8; padding-left: 32px; }

.legend {
  display: flex;
  gap: 18px;
  padding: 10px 18px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  border: 1px solid #eef2f7;
}
.legend-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: #475569; font-weight: 500;
}
.legend-dot {
  width: 12px; height: 12px; border-radius: 3px; display: inline-block;
}

/* 线路图容器 */
.route-wrap {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 20px 20px;
  overflow-y: auto;
  overflow-x: hidden;
}

.route {
  position: relative;
  width: 90%;
  max-width: 1100px;
  height: 460px;
  flex-shrink: 0;
}

/* 底灰线 */
.route-line-base {
  position: absolute;
  top: 30%;
  left: 0;
  right: 0;
  height: 14px;
  background: #e2e8f0;
  transform: translateY(-50%);
  border-radius: 7px;
  z-index: 0;
}

/* 每个路段 */
.route-segment {
  position: absolute;
  top: 30%;
  height: 14px;
  transform: translateY(-50%);
  border-radius: 7px;
  z-index: 1;
  cursor: pointer;
  transition: filter 0.25s, transform 0.25s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.route-segment:hover {
  filter: brightness(1.15);
  z-index: 4;
}

/* 悬停 tooltip */
.segment-tooltip {
  display: none;
  position: absolute;
  bottom: calc(100% + 14px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 180px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.95);
  color: #fff;
  font-size: 11px;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25);
  z-index: 20;
  white-space: nowrap;
  backdrop-filter: blur(8px);
}
.segment-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: rgba(15, 23, 42, 0.95);
}

.route-segment:hover .segment-tooltip {
  display: block;
}

.tt-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}
.tt-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0;
  color: #cbd5e1;
}
.tt-row b {
  color: #fff;
}

/* 站点 */
.station {
  position: absolute;
  top: 30%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 5;
  pointer-events: none;
}

.station-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #fff;
  border: 5px solid #1e3a8a;
  box-shadow:
    0 4px 14px rgba(30, 58, 138, 0.4),
    0 0 0 4px rgba(30, 58, 138, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.station-inner {
  width: 12px; height: 12px; background: #1e3a8a; border-radius: 50%;
}
.station-ring {
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  border: 2px solid rgba(30, 58, 138, 0.2);
  animation: ringPulse 3s ease-in-out infinite;
}
@keyframes ringPulse {
  0%, 100% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 0; }
}

.station-badge {
  position: absolute;
  top: -20px;
  background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
}

.station-info {
  margin-top: 14px;
  text-align: center;
  background: #fff;
  padding: 6px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  border: 1px solid #eef2f7;
  min-width: 84px;
}
.station-name { font-size: 13px; color: #0f172a; font-weight: 700; white-space: nowrap; }
.station-id {
  font-size: 10px;
  color: #94a3b8;
  font-family: 'Courier New', monospace;
  margin-top: 2px;
}

.station-count {
  position: absolute;
  bottom: -44px;
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 10px;
  white-space: nowrap;
  box-shadow: 0 3px 8px rgba(245, 158, 11, 0.45);
  border: 1.5px solid #fff;
}

/* 车辆 */
.bus-icon {
  position: absolute;
  top: 30%;
  z-index: 6;
  transform: translate(-50%, -50%);
  transition: all 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}

.bus-body {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
  color: #fff;
  padding: 9px 15px;
  border-radius: 24px;
  font-size: 13px;
  font-weight: 700;
  box-shadow:
    0 6px 20px rgba(245, 158, 11, 0.5),
    0 0 0 4px rgba(245, 158, 11, 0.12);
  white-space: nowrap;
  cursor: pointer;
  transition: transform 0.25s;
  border: 2px solid #fff;
  animation: busGlow 2.4s ease-in-out infinite;
}
@keyframes busGlow {
  0%, 100% { box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5), 0 0 0 4px rgba(245, 158, 11, 0.12); }
  50% { box-shadow: 0 8px 26px rgba(245, 158, 11, 0.7), 0 0 0 8px rgba(245, 158, 11, 0.08); }
}
.bus-body:hover { transform: scale(1.1); }
.bus-emoji { font-size: 15px; }
.bus-label { font-family: 'Courier New', monospace; }

.bus-icon.arrived .bus-body {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
  box-shadow: 0 4px 14px rgba(100, 116, 139, 0.4);
  animation: none;
}

/* ETA 气泡 */
.eta-badge {
  position: absolute;
  top: -42px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: #fff;
  font-size: 11px;
  padding: 5px 12px;
  border-radius: 14px;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(34, 197, 94, 0.5);
  font-weight: 700;
  border: 2px solid #fff;
  animation: float 2.4s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, -4px); }
}
.eta-badge::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #16a34a;
}
.eta-badge.arrived {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
  animation: none;
}
.eta-badge.arrived::after { border-top-color: #64748b; }

/* 底部信息 */
.map-footer {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
  border: 1px solid #eef2f7;
  margin-top: 20px;
  flex-shrink: 0;
}
.footer-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #fafbfc;
  border: 1px solid #f1f5f9;
  transition: all 0.25s;
}
.footer-item:hover {
  background: #fff;
  border-color: #bfdbfe;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);
  transform: translateY(-2px);
}
.footer-icon {
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0; font-weight: 700;
}
.footer-label {
  font-size: 10px; color: #94a3b8;
  text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600;
}
.footer-value {
  font-size: 16px; color: #0f172a; font-weight: 700; margin-top: 2px;
}
.footer-value.ok { color: #16a34a; }
.footer-value.bad { color: #dc2626; }
</style>