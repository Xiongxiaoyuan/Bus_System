<template>
  <div class="stats-panel">
    <div class="panel-header">
      <div class="header-left">
        <div class="header-icon">📊</div>
        <div>
          <div class="header-title">数据统计大屏</div>
          <div class="header-sub">Data Analytics · 实时更新</div>
        </div>
      </div>
    </div>

    <div class="stats-content">
      <!-- 左侧：大图 - 24小时热度 -->
      <div class="chart-card large">
        <div class="chart-title">近 24 小时运行热度 (次)</div>
        <div ref="lineChartRef" class="chart-container"></div>
      </div>

      <!-- 右侧：上下两张小图 -->
      <div class="right-col">
        <!-- 右上：路况占比 -->
        <div class="chart-card small">
          <div class="chart-title">实时路况占比</div>
          <div ref="pieChartRef" class="chart-container"></div>
        </div>

        <!-- 右下：耗时排名 -->
        <div class="chart-card small">
          <div class="chart-title">路段平均耗时 Top 5 (分钟)</div>
          <div ref="barChartRef" class="chart-container"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import axios from 'axios'

const lineChartRef = ref(null)
const pieChartRef = ref(null)
const barChartRef = ref(null)

let lineChart = null
let pieChart = null
let barChart = null

async function initCharts() {
  // 1. 初始化折线图
  lineChart = echarts.init(lineChartRef.value)
  // 2. 初始化饼图
  pieChart = echarts.init(pieChartRef.value)
  // 3. 初始化柱状图
  barChart = echarts.init(barChartRef.value)

  // 默认加载动画
  const showLoading = (chart) => chart.showLoading({ text: '加载中...', color: '#3b82f6', textColor: '#64748b', maskColor: 'rgba(255,255,255,0.8)' })
  showLoading(lineChart)
  showLoading(pieChart)
  showLoading(barChart)

  try {
    const [heatmapRes, congestionRes, durationRes] = await Promise.all([
      axios.get('/api/stats/heatmap'),
      axios.get('/api/stats/congestion'),
      axios.get('/api/stats/duration')
    ])

    // --- 1. 渲染折线图 ---
    const heatmapData = heatmapRes.data.data || []
    lineChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: heatmapData.map(item => item.hour),
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b' }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
        axisLabel: { color: '#64748b' }
      },
      series: [{
        name: '刷卡次数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#3b82f6' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59, 130, 246, 0.5)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.01)' }
          ])
        },
        data: heatmapData.map(item => item.count)
      }]
    })
    lineChart.hideLoading()

    // --- 2. 渲染饼图 ---
    const congestionData = congestionRes.data.data || []
    pieChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} 段 ({d}%)' },
      legend: { bottom: '0%', left: 'center', textStyle: { color: '#64748b' } },
      color: ['#22c55e', '#f59e0b', '#ef4444'],
      series: [{
        name: '路况状态',
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' }
        },
        data: congestionData
      }]
    })
    pieChart.hideLoading()

    // --- 3. 渲染横向柱状图 ---
    const durationData = durationRes.data.data || []
    barChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
        axisLabel: { color: '#64748b' }
      },
      yAxis: {
        type: 'category',
        data: durationData.map(item => item.name).reverse(),
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#475569', fontWeight: 500 }
      },
      series: [{
        name: '平均耗时(分)',
        type: 'bar',
        barWidth: '50%',
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#818cf8' },
            { offset: 1, color: '#c7d2fe' }
          ])
        },
        data: durationData.map(item => item.value).reverse()
      }]
    })
    barChart.hideLoading()

  } catch (error) {
    console.error('统计数据加载失败:', error)
  }
}

function handleResize() {
  lineChart?.resize()
  pieChart?.resize()
  barChart?.resize()
}

onMounted(() => {
  initCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  lineChart?.dispose()
  pieChart?.dispose()
  barChart?.dispose()
})
</script>

<style scoped>
.stats-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f5f7fa;
}
.panel-header {
  display: flex;
  align-items: center;
  padding: 20px 28px 16px;
  background: #fff;
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

.stats-content {
  flex: 1;
  padding: 24px 28px;
  display: flex;
  gap: 20px;
  overflow-y: auto;
}

.right-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chart-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
  border: 1px solid #eef2f7;
  display: flex;
  flex-direction: column;
}
.chart-card.large { flex: 2; }
.chart-card.small { flex: 1; min-height: 280px; }

.chart-title {
  font-size: 15px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 4px solid #3b82f6;
}

.chart-container {
  flex: 1;
  width: 100%;
  min-height: 200px;
}
</style>