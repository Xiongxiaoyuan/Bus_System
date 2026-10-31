<template>
  <div class="history-panel">
    <div class="panel-header">
      <div class="header-left">
        <div class="header-icon">🕰️</div>
        <div>
          <div class="header-title">历史轨迹查询</div>
          <div class="header-sub">History Track · 仅展示最近 50 条记录</div>
        </div>
      </div>
      <div class="header-right">
        <select v-model="selectedBusId" class="bus-select" @change="loadHistory">
          <option value="">全部车辆</option>
          <option v-for="bus in buses" :key="bus.bus_id" :value="bus.bus_id">
            {{ bus.bus_id }}
          </option>
        </select>
        <button class="refresh-btn" @click="loadHistory">🔄 刷新</button>
      </div>
    </div>

    <div class="table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>车辆 ID</th>
            <th>到达站点</th>
            <th>到达时间</th>
            <th>记录生成时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="4" class="text-center">数据加载中...</td>
          </tr>
          <tr v-else-if="historyList.length === 0">
            <td colspan="4" class="text-center">暂无历史数据</td>
          </tr>
          <tr v-for="item in historyList" :key="item.id" v-else>
            <td>
              <span class="bus-badge">{{ item.bus_id }}</span>
            </td>
            <td>{{ item.station_name }}</td>
            <td>{{ formatTime(item.arrival_time) }}</td>
            <td class="text-gray">{{ formatTime(item.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const props = defineProps({
  buses: { type: Array, default: () => [] }
})

const historyList = ref([])
const selectedBusId = ref('')
const loading = ref(false)

// 格式化时间
function formatTime(timeStr) {
  if (!timeStr) return '--'
  const d = new Date(timeStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 加载数据
async function loadHistory() {
  loading.value = true
  historyList.value = []
  try {
    if (selectedBusId.value) {
      // 查特定车辆（复用后端的 /api/history/:busId）
      const res = await axios.get(`/api/history/${selectedBusId.value}`)
      historyList.value = res.data.data || []
    } else {
      // 如果后端没有查全部历史记录的接口，这里我们暂时先提示，或者你可以直接查第一辆车的
      // 为了演示，如果没选车，我们就默认查第一辆车的记录
      if (props.buses.length > 0) {
        selectedBusId.value = props.buses[0].bus_id
        const res = await axios.get(`/api/history/${selectedBusId.value}`)
        historyList.value = res.data.data || []
      }
    }
  } catch (error) {
    console.error('获取历史失败', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadHistory()
})
</script>

<style scoped>
.history-panel {
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
.header-right { display: flex; gap: 12px; }

.bus-select {
  padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0;
  font-size: 13px; color: #1e293b; outline: none; cursor: pointer;
}
.bus-select:focus { border-color: #3b82f6; }

.refresh-btn {
  padding: 6px 14px; border-radius: 8px; border: none;
  background: #eff6ff; color: #1d4ed8; font-size: 13px;
  cursor: pointer; transition: 0.2s; font-weight: 500;
}
.refresh-btn:hover { background: #dbeafe; }

.table-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 16px 28px;
}
.history-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}
.history-table th {
  padding: 12px;
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 10;
}
.history-table td {
  padding: 12px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}
.history-table tr:hover td {
  background: #f8fafc;
}
.bus-badge {
  background: #e0e7ff; color: #4338ca;
  padding: 2px 8px; border-radius: 6px;
  font-weight: 700; font-family: 'Courier New', monospace;
}
.text-gray { color: #94a3b8; }
.text-center { text-align: center; padding: 40px; color: #94a3b8; }
</style>