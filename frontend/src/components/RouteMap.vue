<template>
  <div class="route-panel">
    <div class="panel-header">
      <div class="header-left">
        <div class="header-icon">🗺️</div>
        <div>
          <div class="header-title">线路运行图</div>
          <div class="header-sub">Route Map · {{ stations.length }} 个站点</div>
        </div>
      </div>
      <div class="header-right">
        <div class="legend">
          <div class="legend-item"><span class="legend-dot" style="background:#22c55e"></span>畅通</div>
          <div class="legend-item"><span class="legend-dot" style="background:#f59e0b"></span>缓行</div>
          <div class="legend-item"><span class="legend-dot" style="background:#ef4444"></span>拥堵</div>
        </div>
        <div class="conn-badge" :class="connected ? 'on' : 'off'">
          {{ connected ? '实时连接' : '连接断开' }}
        </div>
      </div>
    </div>

    <div class="route-wrap">
      <div class="route" v-if="stations.length > 0">
        <!-- 正向线 -->
        <div class="line-label forward-label">去程 →</div>
        <div class="line-base forward"></div>
        <div
          v-for="(seg, i) in forwardSegments"
          :key="'f-' + i"
          class="route-segment forward"
          :class="seg.congestion.level"
          :style="{ left: segmentLeft(i), width: segmentWidth() }"
        >
          <div class="tooltip">
            <div class="tt-title">{{ stationName(seg.from) }} → {{ stationName(seg.to) }}</div>
            <div class="tt-row"><span>距离</span><b>{{ seg.distance_m }} m</b></div>
            <div class="tt-row"><span>耗时</span><b>{{ seg.avg_time_min }} 分</b></div>
            <div class="tt-row"><span>速度</span><b>{{ seg.speed_kmh }} km/h</b></div>
            <div class="tt-row"><span>状态</span><b>{{ seg.congestion.label }}</b></div>
            <div class="tt-row" v-if="seg.note"><span>提示</span><b>{{ seg.note }}</b></div>
          </div>
        </div>

        <!-- 反向线 -->
        <div class="line-label backward-label">← 回程</div>
        <div class="line-base backward"></div>
        <div
          v-for="(seg, i) in backwardSegments"
          :key="'b-' + i"
          class="route-segment backward-seg"
          :class="seg.congestion.level"
          :style="{ left: segmentLeft(i), width: segmentWidth() }"
        >
          <div class="tooltip reverse">
            <div class="tt-title">{{ stationName(seg.from) }} → {{ stationName(seg.to) }}</div>
            <div class="tt-row"><span>距离</span><b>{{ seg.distance_m }} m</b></div>
            <div class="tt-row"><span>耗时</span><b>{{ seg.avg_time_min }} 分</b></div>
            <div class="tt-row"><span>速度</span><b>{{ seg.speed_kmh }} km/h</b></div>
            <div class="tt-row"><span>状态</span><b>{{ seg.congestion.label }}</b></div>
            <div class="tt-row" v-if="seg.note"><span>提示</span><b>{{ seg.note }}</b></div>
          </div>
        </div>

        <!-- 站点 -->
        <div
          v-for="(station, i) in stations"
          :key="station.id"
          class="station"
          :style="{ left: stationPos(i) + '%' }"
        >
          <div class="station-node"></div>
          <div class="station-name">{{ station.name }}</div>
          <div class="station-index">{{ i + 1 }}</div>
        </div>

        <!-- 车辆 -->
        <div
          v-for="bus in buses"
          :key="bus.bus_id"
          class="bus-marker"
          :class="bus.direction === 'backward' ? 'backward' : 'forward'"
          :style="{
            left: busPos(bus) + '%',
            top: `calc(${bus.direction === 'backward' ? '55%' : '28%'} + ${getBusOffset(bus)}px)`,
          }"
        >
          <div
            class="bus-bubble"
            :class="bus.direction === 'backward' ? 'bubble-backward' : 'bubble-forward'"
          >
            🚌
          </div>
          <div class="bus-tag">{{ bus.bus_id }}</div>
          <div
            class="eta-badge"
            v-if="bus.etas && bus.etas.length > 0 && bus.station_index < maxIndex"
          >
            下一站 {{ bus.etas[0].etaMinutes }}min
          </div>
        </div>
      </div>

      <div v-else class="route-empty">
        <div class="empty-icon">🚏</div>
        <div>暂无站点数据</div>
      </div>
    </div>

    <div class="footer-stats" v-if="stations.length > 0">
      <div class="fs-item">
        <span class="fs-label">正向均速</span>
        <span class="fs-value">{{ avgSpeed('forward') }} km/h</span>
      </div>
      <div class="fs-item">
        <span class="fs-label">反向均速</span>
        <span class="fs-value">{{ avgSpeed('backward') }} km/h</span>
      </div>
      <div class="fs-item">
        <span class="fs-label">在线车辆</span>
        <span class="fs-value">{{ buses.length }} 辆</span>
      </div>
      <div class="fs-item">
        <span class="fs-label">方向统计</span>
        <span class="fs-value">{{ directionHint }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  buses: { type: Array, default: () => [] },
  stations: { type: Array, default: () => [] },
  segments: { type: [Object, Array], default: () => ({ forward: [], backward: [] }) },
  maxIndex: { type: Number, default: 0 },
  connected: { type: Boolean, default: false },
})

const forwardSegments = computed(() => {
  if (Array.isArray(props.segments)) return props.segments
  return props.segments?.forward || []
})

const backwardSegments = computed(() => {
  if (Array.isArray(props.segments)) return props.segments
  return props.segments?.backward || []
})

const directionHint = computed(() => {
  if (props.buses.length === 0) return '暂无车辆'
  const back = props.buses.filter(b => b.direction === 'backward').length
  const forward = props.buses.length - back
  return `去程 ${forward} · 回程 ${back}`
})

function stationPos(i) {
  const n = props.stations.length
  if (n <= 1) return 50
  return (i / (n - 1)) * 100
}

function segmentLeft(i) {
  const n = props.stations.length
  if (n <= 1) return '0%'
  return `${(i / (n - 1)) * 100}%`
}

function segmentWidth() {
  const n = props.stations.length
  if (n <= 1) return '100%'
  return `${100 / (n - 1)}%`
}

function stationName(id) {
  const s = props.stations.find(st => st.id === id)
  return s ? s.name : id
}

function busPos(bus) {
  return stationPos(bus.station_index ?? 0)
}

// 同一站、同一方向的车辆向下错开，避免图标重叠
function getBusOffset(bus) {
  const idx = bus.station_index ?? 0
  const dir = bus.direction === 'backward' ? 'backward' : 'forward'
  const same = props.buses.filter(
    b => (b.station_index ?? 0) === idx &&
         (b.direction === 'backward' ? 'backward' : 'forward') === dir
  )
  const order = same.findIndex(b => b.bus_id === bus.bus_id)
  return order <= 0 ? 0 : order * 35
}

function avgSpeed(dir) {
  const list = dir === 'forward' ? forwardSegments.value : backwardSegments.value
  if (list.length === 0) return '--'
  const sum = list.reduce((acc, s) => acc + s.speed_kmh, 0)
  return (sum / list.length).toFixed(1)
}
</script>

<style scoped>
.route-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 28px 16px;
  border-bottom: 1px solid #f1f5f9;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.header-icon {
  width: 40px; height: 40px; border-radius: 12px;
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.header-title { font-size: 18px; font-weight: 700; color: #0f172a; }
.header-sub { font-size: 11px; color: #94a3b8; letter-spacing: 0.5px; margin-top: 2px; }
.header-right { display: flex; align-items: center; gap: 20px; }
.legend { display: flex; gap: 14px; }
.legend-item {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: #64748b; font-weight: 500;
}
.legend-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.conn-badge {
  padding: 5px 12px; border-radius: 20px;
  font-size: 11px; font-weight: 600;
}
.conn-badge.on { background: #dcfce7; color: #15803d; }
.conn-badge.off { background: #fee2e2; color: #b91c1c; }
.route-wrap { flex: 1; position: relative; overflow-y: auto; overflow-x: hidden; }
/* 左右留出站点标签的溢出空间，首末站名称/车辆气泡不再被裁切 */
.route {
  position: relative;
  width: calc(100% - 128px);
  margin: 0 64px;
  height: 550px;
  min-height: 550px;
}
.line-base {
  position: absolute; height: 12px; left: 0; right: 0;
  border-radius: 6px; background: #e2e8f0;
}
.line-base.forward { top: 28%; }
.line-base.backward { top: 55%; }
.line-label {
  position: absolute; left: 20px; font-size: 11px;
  font-weight: 700; letter-spacing: 1px;
}
.forward-label { top: calc(28% - 24px); color: #2563eb; }
.backward-label { top: calc(55% - 24px); color: #7c3aed; }
.route-segment {
  position: absolute; height: 12px; border-radius: 6px;
  cursor: pointer; transition: filter 0.2s;
}
.route-segment.forward { top: 28%; }
.route-segment.backward-seg { top: 55%; }
.route-segment.smooth { background: linear-gradient(180deg, #4ade80, #22c55e); }
.route-segment.slow { background: linear-gradient(180deg, #fbbf24, #f59e0b); }
.route-segment.jam { background: linear-gradient(180deg, #f87171, #ef4444); }
.route-segment:hover { filter: brightness(1.15); z-index: 20; }
.tooltip {
  position: absolute; bottom: calc(100% + 12px); left: 50%;
  transform: translateX(-50%) scale(0.95);
  background: rgba(15, 23, 42, 0.95);
  color: #fff; border-radius: 10px; padding: 10px 14px;
  min-width: 200px; font-size: 11px;
  opacity: 0; visibility: hidden;
  transition: all 0.2s; z-index: 100; pointer-events: none;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}
.tooltip::after {
  content: ''; position: absolute; top: 100%; left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: rgba(15, 23, 42, 0.95);
}
.route-segment:hover .tooltip {
  opacity: 1; visibility: visible;
  transform: translateX(-50%) scale(1);
}
.tooltip.reverse { bottom: auto; top: calc(100% + 12px); }
.tooltip.reverse::after {
  top: auto; bottom: 100%;
  border-top-color: transparent;
  border-bottom-color: rgba(15, 23, 42, 0.95);
}
.tt-title {
  font-size: 12px; font-weight: 700; margin-bottom: 6px;
  padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  white-space: nowrap;
}
.tt-row { display: flex; justify-content: space-between; gap: 16px; line-height: 1.7; }
.tt-row span { color: rgba(255, 255, 255, 0.6); }
.tt-row b { font-weight: 600; white-space: nowrap; }
.station {
  position: absolute; top: 41.5%;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  z-index: 5;
}
.station-node {
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff; border: 3px solid #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}
.station-name {
  font-size: 12px; font-weight: 600; color: #334155;
  white-space: nowrap; background: #fff;
  padding: 2px 6px; border-radius: 6px;
}
.station-index {
  font-size: 9px; color: #94a3b8;
  font-family: 'Courier New', monospace;
}
.bus-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center;
  z-index: 30;
  transition: left 0.8s ease, top 0.8s ease;
}
.bus-bubble {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; border: 2px solid #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  animation: float 2.5s ease-in-out infinite;
}
.bubble-forward { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
.bubble-backward { background: linear-gradient(135deg, #a78bfa, #7c3aed); }
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.bus-tag {
  margin-top: 2px; font-size: 10px; font-weight: 700; color: #fff;
  background: #1e293b; padding: 1px 6px; border-radius: 8px;
  font-family: 'Courier New', monospace; white-space: nowrap;
}
.eta-badge {
  position: absolute; top: -42px; left: 50%; transform: translateX(-50%);
  background: #1e293b; color: #fff;
  padding: 2px 8px; border-radius: 10px;
  font-size: 10px; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.route-empty {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  text-align: center; color: #94a3b8; font-size: 13px;
}
.route-empty .empty-icon { font-size: 48px; margin-bottom: 10px; }
.footer-stats {
  display: flex; justify-content: space-around; align-items: center;
  padding: 14px 28px;
  border-top: 1px solid #f1f5f9;
  background: #fafbfc;
}
.fs-item { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.fs-label { font-size: 11px; color: #94a3b8; }
.fs-value {
  font-size: 14px; font-weight: 700; color: #1e3a8a;
  font-family: 'Courier New', monospace;
}
</style>
