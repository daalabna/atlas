<script setup lang="ts">
import type { Column } from '@atlas/domain'
import { useGridStore } from '~/stores/grid'
import { GRID_HEADER_HEIGHT } from '~/utils/gridLayout'
const props = defineProps<{
  columns: Column[]
  template: string
}>()
const grid = useGridStore()
const resizing = ref<{
  id: string
  startX: number
  startWidth: number
  pointerId: number
} | null>(null)
/** Ignore the click that fires after a resize drag ends on the header cell. */
let suppressSortClick = false
let clearSuppressTimer: ReturnType<typeof setTimeout> | null = null
let resizeListenersActive = false

const sortLabel = (columnId: string) => {
  const rule = grid.sort[0]
  if (!rule || rule.columnId !== columnId) return ''
  return rule.direction === 'asc' ? ' ↑' : ' ↓'
}
const ariaSort = (columnId: string) => {
  const rule = grid.sort[0]
  if (!rule || rule.columnId !== columnId) return 'none' as const
  return rule.direction === 'asc' ? ('ascending' as const) : ('descending' as const)
}
const onHeaderClick = (columnId: string) => {
  if (suppressSortClick) {
    suppressSortClick = false
    return
  }
  grid.toggleSort(columnId)
}
const onResizeStart = (event: PointerEvent, column: Column) => {
  event.stopPropagation()
  event.preventDefault()
  if (clearSuppressTimer) {
    clearTimeout(clearSuppressTimer)
    clearSuppressTimer = null
  }
  suppressSortClick = false
  const handle = event.currentTarget as HTMLElement | null
  handle?.setPointerCapture?.(event.pointerId)
  resizing.value = {
    id: column.id,
    startX: event.clientX,
    startWidth: grid.columnWidths[column.id] ?? column.width,
    pointerId: event.pointerId,
  }
  addResizeListeners()
}
const onPointerMove = (event: PointerEvent) => {
  if (!resizing.value || event.pointerId !== resizing.value.pointerId) return
  const delta = event.clientX - resizing.value.startX
  if (Math.abs(delta) > 2) suppressSortClick = true
  const width = resizing.value.startWidth + delta
  grid.setColumnWidth(resizing.value.id, width)
}
const removeResizeListeners = () => {
  if (!resizeListenersActive) return
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  resizeListenersActive = false
}
const addResizeListeners = () => {
  if (resizeListenersActive) return
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
  resizeListenersActive = true
}
const endResize = (event: PointerEvent) => {
  if (!resizing.value || event.pointerId !== resizing.value.pointerId) return
  resizing.value = null
  removeResizeListeners()
  if (!suppressSortClick) return
  // Let the trailing click (if any) observe suppress, then clear so the next sort works.
  clearSuppressTimer = setTimeout(() => {
    suppressSortClick = false
    clearSuppressTimer = null
  }, 0)
}
onUnmounted(() => {
  removeResizeListeners()
  if (clearSuppressTimer) clearTimeout(clearSuppressTimer)
})
</script>

<template>
  <div
    class="grid-header"
    :style="{ gridTemplateColumns: props.template, height: `${GRID_HEADER_HEIGHT}px` }"
  >
    <div class="grid-head-cell grid-head-index">#</div>
    <button
      v-for="column in props.columns"
      :key="column.id"
      type="button"
      class="grid-head-cell"
      data-testid="column-header"
      :aria-sort="ariaSort(column.id)"
      :title="`Sort by ${column.name} (click to cycle asc → desc → off)`"
      @click="onHeaderClick(column.id)"
    >
      {{ column.name }}{{ sortLabel(column.id) }}
      <span
        class="resize-handle"
        data-testid="column-resize"
        @pointerdown.stop="onResizeStart($event, column)"
        @click.stop
      />
    </button>
  </div>
</template>
