<template>
  <div class="app">
    <header class="topbar">
      <div class="topbar-left">
        <div class="logo-circle">🚌</div>
        <div class="title-group">
          <div class="title">公交运行信息后台</div>
          <div class="subtitle">Bus Operation Dashboard</div>
        </div>
      </div>

      <!-- 顶部导航菜单 -->
      <div class="topbar-center">
        <div 
          class="nav-item" 
          :class="{ active: currentTab === 'monitor' }"
          @click="currentTab = 'monitor'"
        >
          实时监控
        </div>
        <div 
          class="nav-item" 
          :class="{ active: currentTab === 'history' }"
          @click="currentTab = 'history'"
        >
          历史轨迹
        </div>
        <div 
          class="nav-item" 
          :class="{ active: currentTab === 'stats' }"
          @click="currentTab = 'stats'"
        >
          数据统计
        </div>
      </div>

      <div class="topbar-right">
        <div class="status-pill" :class="connected ? 'ok' : 'bad'">
          <span class="dot"></span>
          {{ connected ? '系统正常' : '连接断开' }}
        </div>
        <div class="clock">
          <span class="clock-icon">🕐</span>
          <span class="clock-time">{{ currentTime }}</span>
        </div>
      </div>
    </header>

    <div class="body">
      <!-- 1. 实时监控视图 -->
      <template v-if="currentTab === 'monitor'">
        <BusList 
          :buses="buses" 
          :stationsList="stations"
          :maxIndex="maxIndex" 
          @refresh="loadData" 
        />
        <RouteMap
          :buses="buses"
          :stations="stations"
          :segments="segments"
          :maxIndex="maxIndex"
          :connected="connected"
        />
      </template>

      <!-- 2. 历史轨迹视图 -->
      <template v-else-if="currentTab === 'history'">
        <HistoryList :buses="buses" />
      </template>

      <!-- 3. 数据统计视图 -->
      <template v-else-if="currentTab === 'stats'">
        <StatisticsPanel :stations="stations" :segments="segments" />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import BusList from './components/BusList.vue'
import RouteMap from './components/RouteMap.vue'
import HistoryList from './components/HistoryList.vue'
import StatisticsPanel from './components/StatisticsPanel.vue' // 引入图表组件

const currentTab = ref('monitor') // 默认显示实时监控

const buses = ref([])
const stations = ref([])
const segments = ref({ forward: [], backward: [] })
const connected = ref(false)
const currentTime = ref('')

const maxIndex = computed(() =>
  stations.value.length > 0 ? stations.value.length - 1 : 0
)

async function loadData() {
  try {
    const [busRes, segRes] = await Promise.all([
      axios.get('/api/buses'),
      axios.get('/api/segments'),
    ])

    const list = busRes.data.data || []
    const body = segRes.data || {}
    const forward = Array.isArray(body.data) ? body.data : []
    const backward = Array.isArray(body.backward) ? body.backward : forward
    segments.value = { forward, backward }

    const etaResults = await Promise.all(
      list.map(bus =>
        axios.get(`/api/eta/${bus.bus_id}`)
          .then(r => r.data.data || [])
          .catch(() => [])
      )
    )

    list.forEach((bus, i) => { bus.etas = etaResults[i] })
    buses.value = list
    connected.value = true
  } catch (e) {
    console.error('加载失败:', e)
    connected.value = false
  }
}

async function loadStations() {
  try {
    const res = await axios.get('/api/stations')
    stations.value = res.data.data || []
  } catch (e) {
    console.error('站点加载失败:', e)
  }
}

function updateClock() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  currentTime.value = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

let refreshTimer = null
let clockTimer = null

onMounted(() => {
  loadStations()
  loadData()
  updateClock()
  refreshTimer = setInterval(loadData, 3000)
  clockTimer = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Microsoft YaHei", "PingFang SC", -apple-system, sans-serif;
  background: #f5f7fa;
  color: #2c3e50;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
.app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.topbar {
  height: 64px;
  background: linear-gradient(90deg, #0f172a 0%, #1e3a8a 40%, #2563eb 70%, #3b82f6 100%);
  background-size: 200% 100%;
  animation: gradientFlow 8s ease infinite;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.35);
  z-index: 10;
}
@keyframes gradientFlow {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.topbar-left { display: flex; align-items: center; gap: 14px; }
.logo-circle {
  width: 40px; height: 40px; border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.title-group { display: flex; flex-direction: column; gap: 2px; }
.title { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
.subtitle { font-size: 10px; opacity: 0.65; letter-spacing: 1.2px; text-transform: uppercase; }
.topbar-center {
  display: flex; gap: 4px; padding: 4px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.nav-item {
  padding: 6px 16px; font-size: 13px; border-radius: 7px; cursor: pointer;
  color: rgba(255, 255, 255, 0.75); transition: all 0.25s; font-weight: 500;
}
.nav-item:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
.nav-item.active { background: #fff; color: #1e3a8a; font-weight: 600; }
.topbar-right { display: flex; align-items: center; gap: 16px; }
.status-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.status-pill .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.status-pill.ok .dot { background: #4ade80; box-shadow: 0 0 10px #4ade80; animation: pulse 2s infinite; }
.status-pill.bad .dot { background: #f87171; box-shadow: 0 0 10px #f87171; }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.15); }
}
.clock {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 20px;
  background: rgba(0, 0, 0, 0.2);
  font-size: 14px; font-weight: 600;
  font-family: 'Courier New', monospace; letter-spacing: 1px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.body { flex: 1; display: flex; overflow: hidden; }
</style>