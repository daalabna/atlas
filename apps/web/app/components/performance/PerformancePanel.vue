<script setup lang="ts">
import { usePerformance } from '~/composables/usePerformance'

const { metrics } = usePerformance()
const hydrated = ref(false)
const initialMetrics = {
  fps: 0,
  gridRenderMs: 0,
  rowsRendered: 0,
  cellsRendered: 0,
  filterSortMs: 0,
  workerMs: 0,
  memoryMb: null,
  score: null,
} as const
const displayed = computed(() => (hydrated.value ? metrics : initialMetrics))

onMounted(() => {
  hydrated.value = true
})
</script>

<template>
  <div class="panel" data-testid="performance-panel">
    <h3>Performance</h3>
    <div class="metric-grid">
      <div class="metric">
        <b>{{ displayed.fps }}</b
        ><span>FPS</span>
      </div>
      <div class="metric">
        <b>{{ displayed.gridRenderMs.toFixed(1) }}</b
        ><span>Grid render ms</span>
      </div>
      <div class="metric">
        <b>{{ displayed.rowsRendered }}</b
        ><span>Rows rendered</span>
      </div>
      <div class="metric">
        <b>{{ displayed.cellsRendered }}</b
        ><span>Cells rendered</span>
      </div>
      <div class="metric">
        <b>{{ displayed.filterSortMs.toFixed(1) }}</b
        ><span>Filter/sort ms</span>
      </div>
      <div class="metric">
        <b>{{ displayed.workerMs.toFixed(1) }}</b
        ><span>Worker ms</span>
      </div>
      <div class="metric">
        <b>{{ displayed.memoryMb ?? 'n/a' }}</b
        ><span>Memory MB</span>
      </div>
      <div class="metric" data-testid="score-avg">
        <b>{{ displayed.score ? displayed.score.avg.toFixed(1) : 'n/a' }}</b
        ><span>Score avg</span>
      </div>
      <div class="metric">
        <b>{{ displayed.score ? displayed.score.min.toFixed(1) : 'n/a' }}</b
        ><span>Score min</span>
      </div>
      <div class="metric">
        <b>{{ displayed.score ? displayed.score.max.toFixed(1) : 'n/a' }}</b
        ><span>Score max</span>
      </div>
    </div>
  </div>
</template>
