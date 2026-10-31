<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="header-title">车辆列表</div>
      <div class="header-sub">Bus List</div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-num">{{ buses.length }}</div>
        <div class="stat-label">在线车辆</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ runningCount }}</div>
        <div class="stat-label">运行中</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ arrivedCount }}</div>
        <div class="stat-label">已到站</div>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-refresh" @click="emit('refresh')">
        <span>🔄</span> 刷新
      </button>
      <button class="btn btn-clear" @click="clearHistory">🧹 清空</button>
      <button class="btn btn-reset" @click="resetAll">⚠️ 重置</button>
    </div>

    <div class="bus-list">
      <div
        v-for="bus in buses"
        :key="bus.bus_id"
        class="bus-card"
        :class="{
          arrived: isArrived(bus),
          backward: bus.direction === 'backward' && !isArrived(bus)
        }"
      >
        <div
          class="status-bar"
          :class="isArrived(bus) ? 'gray' : (bus.direction === 'backward' ? 'purple' : 'green')"
        ></div>

        <!-- 固定头部：车辆信息和状态 -->
        <div class="card-header">
          <div class="bus-info">
            <div class="bus-icon">
              <span class="bus-emoji">🚌</span>
            </div>
            <div class="bus-text">
              <div class="bus-id">{{ bus.bus_id }}</div>
              <div class="bus-line">{{ bus.line }}</div>
            </div>
          </div>
          <div class="header-right">
            <div
              class="status-tag"
              :class="isArrived(bus) ? 'arrived' : (bus.direction === 'backward' ? 'backward' : 'running')"
            >
              {{ statusText(bus) }}
            </div>
            <button class="dispatch-btn" @click="openDispatch(bus)" title="手动调度车辆">🚕</button>
          </div>
        </div>

        <!-- 滚动主体：包含当前位置、时间、ETA -->
        <div class="card-body">
          <div class="info-row">
            <span class="info-label">当前位置</span>
            <span class="info-value">{{ bus.station_name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">行驶方向</span>
            <span class="info-value">{{ directionText(bus) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">到站时间</span>
            <span class="info-value">{{ formatTime(bus.arrival_time) }}</span>
          </div>

          <!-- ETA 区域 -->
          <div class="eta-section" v-if="bus.etas && bus.etas.length > 0">
            <div class="eta-title">预计到达</div>
            <div class="eta-list">
              <div class="eta-item" v-for="eta in bus.etas" :key="eta.stationId">
                <span class="eta-station">{{ eta.stationName }}</span>
                <span class="eta-time">{{ eta.etaMinutes }} 分钟</span>
                <span
                  class="eta-congestion"
                  :style="{ background: eta.segment.congestion.color }"
                >
                  {{ eta.segment.congestion.label }}
                </span>
              </div>
            </div>
          </div>
          <div class="arrived-tip" v-else-if="maxIndex > 0 && bus.station_index >= maxIndex">
            已到达终点站，等待调度折返
          </div>
          <div class="arrived-tip" v-else-if="bus.station_index === 0 && bus.direction === 'backward'">
            已到达起点站，等待发车
          </div>
        </div>
      </div>

      <div v-if="buses.length === 0" class="empty">
        <div class="empty-icon">📭</div>
        <div class="empty-text">暂无车辆数据</div>
        <div class="empty-hint">请刷卡后再刷新</div>
      </div>
    </div>

    <!-- 调度弹窗 -->
    <div v-if="dispatchModal.show" class="modal-overlay" @click.self="dispatchModal.show = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>🚕 车辆调度</h3>
          <button class="close-btn" @click="dispatchModal.show = false">×</button>
        </div>
        <div class="modal-body">
          <p>车辆 ID：<b>{{ dispatchModal.busId }}</b></p>
          <p class="tip">选择将该车辆调度到哪个站点：</p>
          <div class="station-select-list">
            <button 
              v-for="(st, i) in stationsList" 
              :key="st.id"
              class="station-btn"
              @click="confirmDispatch(st.id)"
            >
              {{ i + 1 }}. {{ st.name }} ({{ st.id }})
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import axios from 'axios'

const props = defineProps({
  buses: { type: Array, default: () => [] },
  stationsList: { type: Array, default: () => [] },
  maxIndex: { type: Number, default: 0 },
})

const emit = defineEmits(['refresh'])

const dispatchModal = ref({
  show: false,
  busId: null
})

function openDispatch(bus) {
  dispatchModal.value = { show: true, busId: bus.bus_id }
}

async function confirmDispatch(targetStationId) {
  try {
    await axios.post(`/api/dispatch/${dispatchModal.value.busId}`, {
      toStation: targetStationId
    })
    dispatchModal.value.show = false
    emit('refresh')
  } catch (e) {
    console.error('调度失败', e)
    alert('调度失败，请检查网络')
  }
}

function isArrived(bus) {
  const idx = bus.station_index ?? 0
  if (props.maxIndex > 0 && idx >= props.maxIndex) return true
  return idx === 0 && bus.direction === 'backward'
}

function statusText(bus) {
  const idx = bus.station_index ?? 0
  if (props.maxIndex > 0 && idx >= props.maxIndex) return '已到终点'
  if (idx === 0 && bus.direction === 'backward') return '已到起点'
  return bus.direction === 'backward' ? '回程中' : '去程中'
}

function directionText(bus) {
  if (isArrived(bus)) return '—'
  return bus.direction === 'backward' ? '终点 → 起点' : '起点 → 终点'
}

const runningCount = computed(() => props.buses.filter(b => !isArrived(b)).length)
const arrivedCount = computed(() => props.buses.filter(b => isArrived(b)).length)

function formatTime(timeStr) {
  if (!timeStr) return '--'
  const d = new Date(timeStr)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function clearHistory() {
  if (!confirm('确定要清空所有历史耗时吗？\n（车辆位置、行驶方向和到站记录会保留）')) return
  try {
    await axios.delete('/api/history/clear')
    emit('refresh')
  } catch (e) {
    console.error('清空失败:', e)
    alert('清空失败')
  }
}

async function resetAll() {
  if (!confirm('⚠️ 警告：确定要彻底重置吗？\n这会清空所有车辆状态和历史数据！')) return
  try {
    await axios.delete('/api/reset/all')
    emit('refresh')
  } catch (e) {
    console.error('重置失败:', e)
    alert('重置失败')
  }
}
</script>

<style scoped>
.sidebar {
  width: 380px;
  background: #fff;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e5e7eb;
  overflow: hidden;
}
.sidebar-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid #f1f5f9;
}
.header-title { font-size: 18px; font-weight: 700; color: #0f172a; }
.header-sub {
  font-size: 11px; color: #94a3b8; letter-spacing: 1.5px;
  text-transform: uppercase; margin-top: 2px;
}
.stats-row { display: flex; gap: 10px; padding: 16px 24px; }
.stat-card {
  flex: 1;
  background: linear-gradient(135deg, #f8fafc, #f1f5f9);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 8px;
  text-align: center;
}
.stat-num {
  font-size: 22px; font-weight: 700; color: #1e3a8a;
  font-family: 'Courier New', monospace;
}
.stat-label { font-size: 11px; color: #64748b; margin-top: 2px; }
.btn-row { display: flex; gap: 8px; padding: 0 24px 16px; }
.btn {
  flex: 1; padding: 8px 10px; border: none; border-radius: 8px;
  font-size: 12px; cursor: pointer; transition: all 0.2s; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  font-family: inherit;
}
.btn-refresh { background: #eff6ff; color: #1d4ed8; }
.btn-refresh:hover { background: #dbeafe; }
.btn-clear { background: #fef3c7; color: #b45309; }
.btn-clear:hover { background: #fde68a; }
.btn-reset { background: #fee2e2; color: #b91c1c; }
.btn-reset:hover { background: #fecaca; }

.bus-list {
  flex: 1; overflow-y: auto; padding: 0 16px 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.bus-list::-webkit-scrollbar { width: 6px; }
.bus-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

/* ================= 卡片核心样式修改 ================= */
.bus-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px 14px 20px;
  position: relative;
  transition: all 0.25s;
  
  /* 限制卡片高度，允许内部滚动 */
  display: flex;
  flex-direction: column;
  max-height: 380px;  /* 可根据需要调小或调大 */
  flex-shrink: 0;
  overflow: hidden;
}

.bus-card:hover { box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08); transform: translateY(-1px); }
.bus-card.arrived { opacity: 0.65; background: #f8fafc; }
.bus-card.backward { border-color: #ddd6fe; background: #faf5ff; }

.status-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.status-bar.green { background: linear-gradient(180deg, #34d399, #059669); }
.status-bar.purple { background: linear-gradient(180deg, #a78bfa, #7c3aed); }
.status-bar.gray { background: #cbd5e1; }

/* 头部固定 */
.card-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: flex-start; 
  margin-bottom: 12px; 
  flex-shrink: 0;
}

.bus-info { display: flex; gap: 10px; align-items: center; }
.bus-icon {
  width: 38px; height: 38px; border-radius: 10px;
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  display: flex; align-items: center; justify-content: center;
}
.bus-emoji { font-size: 20px; }
.bus-text { display: flex; flex-direction: column; }
.bus-id { font-size: 15px; font-weight: 700; color: #0f172a; font-family: 'Courier New', monospace; }
.bus-line { font-size: 11px; color: #64748b; margin-top: 1px; }

.header-right { 
  display: flex; 
  align-items: center; 
  gap: 6px; 
}
.status-tag { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.status-tag.running { background: #dcfce7; color: #15803d; }
.status-tag.backward { background: #ede9fe; color: #6d28d9; }
.status-tag.arrived { background: #f1f5f9; color: #64748b; }

.dispatch-btn {
  background: #f1f5f9; border: none; border-radius: 4px; cursor: pointer;
  font-size: 14px; padding: 2px 4px; color: #475569; transition: 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.dispatch-btn:hover { background: #e2e8f0; color: #0f172a; }

/* 核心：内容区可滚动 */
.card-body { 
  display: flex; 
  flex-direction: column; 
  gap: 6px; 
  overflow-y: auto; 
  padding-right: 4px;
}
.card-body::-webkit-scrollbar { width: 4px; }
.card-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

.info-row { display: flex; justify-content: space-between; font-size: 12px; }
.info-label { color: #94a3b8; }
.info-value { color: #334155; font-weight: 500; }

/* ETA 和底部提示区 */
.eta-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e2e8f0; flex-shrink: 0; }
.eta-title { font-size: 12px; font-weight: 600; color: #1e3a8a; margin-bottom: 8px; }
.eta-list { display: flex; flex-direction: column; gap: 6px; }
.eta-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
.eta-station { color: #475569; flex: 1; }
.eta-time { font-weight: 700; color: #1e3a8a; font-family: 'Courier New', monospace; }
.eta-congestion {
  padding: 2px 8px; border-radius: 10px; font-size: 10px;
  color: #fff; white-space: nowrap;
}
.arrived-tip {
  margin-top: 10px; padding: 8px 10px; background: #f1f5f9;
  border-radius: 8px; font-size: 12px; color: #64748b; text-align: center;
}
.empty { text-align: center; padding: 50px 20px; color: #94a3b8; }
.empty-icon { font-size: 40px; margin-bottom: 10px; }
.empty-text { font-size: 15px; font-weight: 600; color: #64748b; margin-bottom: 4px; }
.empty-hint { font-size: 12px; }

/* ====== 调度弹窗样式 ====== */
.modal-overlay {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 999;
}
.modal-content {
  background: #fff; width: 300px; border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  overflow: hidden; animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes popIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #f1f5f9;
}
.modal-header h3 { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0; }
.close-btn {
  background: none; border: none; font-size: 20px; color: #94a3b8;
  cursor: pointer; padding: 0; line-height: 1;
}
.close-btn:hover { color: #ef4444; }
.modal-body { padding: 20px; }
.modal-body p { font-size: 13px; color: #475569; margin: 0 0 12px 0; }
.modal-body .tip { font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
.station-select-list { display: flex; flex-direction: column; gap: 8px; }
.station-btn {
  padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; font-size: 13px; color: #1e293b; cursor: pointer;
  text-align: left; transition: all 0.2s; font-weight: 500;
}
.station-btn:hover {
  background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8;
  transform: translateX(4px);
}
</style>