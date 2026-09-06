<script setup lang="ts">
import type { Column } from '@atlas/domain'
import { usePerformance } from '~/composables/usePerformance'

defineProps<{
  columns: Column[]
  template: string
  rowCount: number
  scrollLeft: number
  height: number
}>()

const { metrics } = usePerformance()

const formatCell = (column: Column) => {
  if (column.type !== 'number') return ''
  const score = metrics.score
  if (!score || column.id !== 'score') return ''
  return `avg ${score.avg.toFixed(1)}`
}
</script>

<template>
  <div class="grid-footer-clip" :style="{ height: `${height}px` }">
    <div
      class="grid-footer"
      :style="{
        gridTemplateColumns: template,
        height: `${height}px`,
        transform: `translateX(${-scrollLeft}px)`,
      }"
    >
      <div class="grid-footer-cell is-index">Σ {{ rowCount.toLocaleString('en-US') }}</div>
      <div v-for="column in columns" :key="column.id" class="grid-footer-cell">
        {{ formatCell(column) }}
      </div>
    </div>
  </div>
</template>
