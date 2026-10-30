<template>
  <aside class="sidebar">
     <div class="sidebar-header">
      <div class="header-title">
        <span class="icon">🚍</span>
        <span>车辆实时状态</span>
      </div>
      
      <!-- ⭐ 新增：按钮组 -->
      <div class="header-actions">
        <!-- 清空历史按钮 -->
        <button class="clear-btn" @click="clearHistory" title="清空历史数据">
          <span>🗑️</span> 清空
        </button>
        
        <!-- 原来的刷新按钮 -->
        <button class="refresh-btn" @click="$emit('refresh')">
          <span>⟳</span>
        </button>
      </div>
    </div>

    <div class="stats">
      <div class="stat-item">
        <div class="stat-icon" style="background: #dbeafe; color: #2563eb;">🚌</div>
        <div class="stat-info">
          <div class="stat-value">{{ buses.length }}</div>
          <div class="stat-label">在线车辆</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon" style="background: #dcfce7; color: #16a34a;">🟢</div>
        <div class="stat-info">
          <div class="stat-value">{{ runningCount }}</div>
          <div class="stat-label">运行中</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon" style="background: #f1f5f9; color: #64748b;">✅</div>
        <div class="stat-info">
          <div class="stat-value">{{ arrivedCount }}</div>
          <div class="stat-label">已到终点</div>
        </div>
      </div>
    </div>

    <div class="bus-list">
      <div v-if="buses.length === 0" class="empty">
        <div class="empty-icon">📭</div>
        <div class="empty-text">暂无车辆数据</div>
        <div class="empty-hint">请刷卡后点击刷新按钮</div>
      </div>

      <div
        v-for="bus in buses"
        :key="bus.bus_id"
        class="bus-card"
        :class="{ arrived: bus.station_index >= maxIndex }"
      >
        <div class="status-bar" :class="bus.station_index >= maxIndex ? 'gray' : 'green'"></div>

        <div class="card-header">
          <div class="bus-line">
            <span class="line-badge">{{ bus.line }}</span>
            <span class="bus-id">{{ bus.bus_id }}</span>
          </div>
          <div class="status-tag" :class="bus.station_index >= maxIndex ? 'arrived' : 'running'">
            <span class="tag-dot"></span>
            {{ bus.station_index >= maxIndex ? '已到终点' : '运行中' }}
          </div>
        </div>

        <div class="card-body">
          <div class="info-row">
            <span class="label-icon">📍</span>
            <span class="label">当前位置</span>
            <span class="value">{{ bus.station_name }}</span>
          </div>
          <div class="info-row">
            <span class="label-icon">🕐</span>
            <span class="label">到站时间</span>
            <span class="value small">{{ formatTime(bus.arrival_time) }}</span>
          </div>
        </div>

        <!-- ETA 区域 -->
        <div class="eta-section" v-if="bus.etas && bus.etas.length > 0">
          <div class="eta-title">
            <span>预计到站</span>
          </div>
          <div class="eta-list">
            <div
              v-for="(eta, idx) in bus.etas"
              :key="eta.stationId"
              class="eta-item"
              :class="{ next: idx === 0 }"
            >
              <div class="eta-row">
                <span class="eta-station">{{ eta.stationName }}</span>
                <span class="eta-dots"></span>
                <span class="eta-arrive">{{ eta.arriveTime }}</span>
              </div>
              <div class="eta-sub">
                <span class="eta-minutes">{{ eta.etaMinutes }} 分钟后</span>
                <!-- 拥堵状态 -->
                <span
                  class="eta-congestion"
                  v-if="eta.segment"
                  :style="{
                    background: eta.segment.congestion.color + '20',
                    color: eta.segment.congestion.color,
                  }"
                >
                  <span
                    class="dot"
                    :style="{ background: eta.segment.congestion.color }"
                  ></span>
                  {{ eta.segment.congestion.label }}
                  · {{ eta.segment.speed_kmh }} km/h
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="arrived-tip" v-else-if="bus.station_index >= maxIndex">
          <span>✅</span> 已到达终点站，等待调度
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import axios from 'axios' // ⭐ 新增：引入 axios

const props = defineProps({
  buses: { type: Array, default: () => [] },
  maxIndex: { type: Number, default: 0 },
})

const emit = defineEmits(['refresh'])

const runningCount = computed(() =>
  props.buses.filter(b => b.station_index < props.maxIndex).length
)
const arrivedCount = computed(() =>
  props.buses.filter(b => b.station_index >= props.maxIndex).length
)

function formatTime(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ⭐ 新增：清空历史数据的函数
async function clearHistory() {
  // 加上 confirm 防止误触
  const confirmClear = window.confirm('确定要清空所有历史到站和耗时数据吗？\n（车辆当前位置不受影响）')
  if (!confirmClear) return

  try {
    // 发送 DELETE 请求给后端
    const res = await axios.delete('/api/history/clear')
    if (res.data.code === 200) {
      alert('✅ 历史数据已成功清空！')
      // 触发父组件的刷新函数，让页面数据立刻同步
      emit('refresh')
    } else {
      alert('清空失败：' + res.data.msg)
    }
  } catch (error) {
    console.error('清空请求失败:', error)
    alert('❌ 网络请求失败，请检查后端是否启动')
  }
}
</script>

<style scoped>
.sidebar {
  width: 380px;
  background: #fff;
  border-right: 1px solid #e8ecf1;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: 4px 0 24px rgba(15, 23, 42, 0.04);
}

.sidebar-header {
  padding: 18px 22px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e8ecf1;
}
.header-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 700; color: #0f172a;
}
.header-title .icon { font-size: 18px; }
.refresh-btn {
  width: 32px; height: 32px; border-radius: 8px;
  background: #eff6ff; color: #2563eb; border: none;
  cursor: pointer; font-size: 16px; font-weight: 700;
  transition: all 0.25s;
  display: flex; align-items: center; justify-content: center;
}
.refresh-btn:hover {
  background: #2563eb; color: #fff; transform: rotate(180deg);
}

.stats {
  display: flex; gap: 10px; padding: 16px 16px;
  background: #fafbfc; border-bottom: 1px solid #e8ecf1;
}
.stat-item {
  flex: 1; display: flex; align-items: center; gap: 8px;
  padding: 10px 8px; background: #fff; border-radius: 10px;
  border: 1px solid #eef2f7; transition: all 0.25s;
}
.stat-item:hover { border-color: #bfdbfe; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08); }
.stat-icon {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 17px; font-weight: 700; color: #0f172a; line-height: 1.1; }
.stat-label { font-size: 10px; color: #94a3b8; margin-top: 2px; white-space: nowrap; }

.bus-list {
  flex: 1; overflow-y: auto; padding: 16px; background: #fafbfc;
}
.bus-list::-webkit-scrollbar { width: 6px; }
.bus-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

.empty { text-align: center; padding: 70px 20px; }
.empty-icon { font-size: 52px; margin-bottom: 14px; opacity: 0.5; }
.empty-text { font-size: 14px; color: #94a3b8; margin-bottom: 6px; font-weight: 500; }
.empty-hint { font-size: 12px; color: #cbd5e1; }

.bus-card {
  position: relative;
  background: #fff;
  border-radius: 12px;
  padding: 16px 16px 16px 20px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
  border: 1px solid #eef2f7;
  transition: all 0.3s ease;
  overflow: hidden;
  animation: slideIn 0.4s ease;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.bus-card:hover {
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.12);
  border-color: #bfdbfe;
  transform: translateY(-2px);
}
.bus-card.arrived { opacity: 0.8; }

.status-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.status-bar.green { background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%); }
.status-bar.gray { background: linear-gradient(180deg, #94a3b8 0%, #64748b 100%); }

.card-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px;
}
.bus-line { display: flex; align-items: center; gap: 8px; }
.line-badge {
  font-size: 11px; padding: 3px 9px;
  background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
  color: #fff; border-radius: 5px; font-weight: 700; letter-spacing: 0.5px;
}
.bus-id {
  font-size: 14px; font-weight: 700; color: #0f172a;
  letter-spacing: 0.3px; font-family: 'Courier New', monospace;
}
.status-tag {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 600;
}
.status-tag .tag-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.status-tag.running { background: #dcfce7; color: #16a34a; }
.status-tag.running .tag-dot {
  background: #22c55e; box-shadow: 0 0 6px #22c55e;
  animation: pulse 2s infinite;
}
.status-tag.arrived { background: #f1f5f9; color: #64748b; }
.status-tag.arrived .tag-dot { background: #94a3b8; }

.card-body {
  padding: 10px 12px; background: #fafbfc; border-radius: 8px;
  margin-bottom: 12px; border: 1px solid #f1f5f9;
}
.info-row {
  display: grid; grid-template-columns: 18px 70px 1fr;
  align-items: center; gap: 6px; padding: 5px 0; font-size: 13px;
}
.info-row .label-icon { font-size: 12px; text-align: center; }
.info-row .label { color: #64748b; font-size: 12px; }
.info-row .value { color: #0f172a; font-weight: 600; text-align: right; }
.info-row .value.small {
  font-family: 'Courier New', monospace; font-size: 12px;
  color: #475569; font-weight: 500;
}

.eta-section { border-top: 1px dashed #e2e8f0; padding-top: 12px; }
.eta-title {
  font-size: 11px; color: #94a3b8; margin-bottom: 8px;
  font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
}
.eta-list { display: flex; flex-direction: column; gap: 8px; }
.eta-item {
  padding: 9px 12px; border-radius: 8px;
  background: #fafbfc; border: 1px solid #f1f5f9;
  transition: all 0.25s;
}
.eta-item.next {
  background: linear-gradient(90deg, #f0fdf4 0%, #dcfce7 100%);
  border-color: #bbf7d0;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.12);
}
.eta-row { display: flex; align-items: center; }
.eta-station { color: #334155; font-weight: 600; font-size: 13px; }
.eta-dots { flex: 1; border-bottom: 2px dotted #cbd5e1; margin: 0 8px; height: 1px; }
.eta-arrive {
  color: #0f172a; font-weight: 700; font-size: 14px;
  font-family: 'Courier New', monospace; letter-spacing: 0.5px;
}
.eta-item.next .eta-arrive { color: #16a34a; }

.eta-sub {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 5px; padding-left: 2px;
}
.eta-minutes { font-size: 11px; color: #64748b; }
.eta-congestion {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; padding: 2px 7px; border-radius: 10px;
  font-weight: 600;
}
.eta-congestion .dot {
  width: 6px; height: 6px; border-radius: 50%;
}

.arrived-tip {
  padding: 10px 12px; background: #f8fafc; border-radius: 7px;
  font-size: 12px; color: #64748b; text-align: center;
  font-weight: 500; border: 1px solid #f1f5f9;
}
.arrived-tip span { margin-right: 4px; }

/* ⭐ 新增：按钮组容器样式 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px; /* 按钮之间的间距 */
}

/* ⭐ 新增：清空按钮样式 */
.clear-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  background: #fef2f2; /* 浅红色背景 */
  color: #ef4444;      /* 红色字体 */
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.25s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.clear-btn:hover {
  background: #ef4444; /* 悬停变红底 */
  color: #fff;         /* 白字 */
}
</style>