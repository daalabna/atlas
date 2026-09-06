<script setup lang="ts">
import GridHeader from './GridHeader.vue'
import GridRow from './GridRow.vue'
import GridFooter from './GridFooter.vue'
import EditorOverlay from './EditorOverlay.vue'
import { useGrid } from '~/composables/useGrid'
import { useSelection } from '~/composables/useSelection'
import { useCellEditor } from '~/composables/useCellEditor'
import { useDataGridInteractions } from '~/composables/useDataGridInteractions'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useSessionStore } from '~/stores/session'
import { usePerformance } from '~/composables/usePerformance'
import { GRID_HEADER_HEIGHT } from '~/utils/gridLayout'
import { scheduleIdleTask } from '~/utils/idleTask'

const INDEX_COL = 72
const FOOTER_HEIGHT = 36

const datasetStore = useDatasetStore()
const gridStore = useGridStore()
const session = useSessionStore()
const grid = useGrid()
const selection = useSelection()
const editor = useCellEditor()
const metrics = usePerformance()
const viewport = ref<HTMLElement | null>(null)
const shell = ref<HTMLElement | null>(null)

/** Stretch columns to fill the viewport when natural widths leave empty space. */
const template = computed(() => {
  const cols = grid.visibleColumns.value
  const natural = cols.map((column) => gridStore.columnWidths[column.id] ?? column.width)
  const naturalTotal = natural.reduce((sum, width) => sum + width, 0)
  const available = Math.max(0, gridStore.viewportWidth - INDEX_COL)
  const scale = naturalTotal > 0 && naturalTotal < available ? available / naturalTotal : 1
  const widths = natural.map((width) => `${Math.floor(width * scale)}px`)
  return `${INDEX_COL}px ${widths.join(' ')}`
})

const editingRowIndex = computed(() => {
  const rowId = editor.editing.value?.rowId
  if (!rowId) return -1
  return grid.displayRowIds.value.indexOf(rowId)
})

const { onCellClick, onToggleRow, onCellDblClick, onKeydown } = useDataGridInteractions({
  grid,
  selection,
  editor,
  datasetStore,
})

watch(
  () => session.writesBlocked || session.workspaceLoading,
  (blocked) => {
    if (blocked && editor.isEditing.value) editor.cancelEditing()
  },
)

const syncViewportSize = () => {
  if (!shell.value) return
  // Measure the scroll viewport itself so the Σ footer is never stolen from layout math.
  const viewportHeight = viewport.value?.clientHeight ?? shell.value.clientHeight - FOOTER_HEIGHT
  gridStore.viewportHeight = Math.max(120, viewportHeight)
  gridStore.viewportWidth = shell.value.clientWidth
}

onMounted(() => {
  metrics.start()
  const observer = new ResizeObserver(() => syncViewportSize())
  if (shell.value) observer.observe(shell.value)
  if (viewport.value) observer.observe(viewport.value)
  syncViewportSize()

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') editor.cancelEditing()
  }
  document.addEventListener('visibilitychange', onVisibility)

  const onWindowKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && editor.isEditing.value) {
      event.preventDefault()
      editor.cancelEditing()
    }
  }
  window.addEventListener('keydown', onWindowKeydown)

  const cancelWorkerInit = scheduleIdleTask(() => {
    void grid.initWorker()
  })

  onUnmounted(() => {
    cancelWorkerInit()
    metrics.stop()
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('keydown', onWindowKeydown)
  })
})

watch(
  () => gridStore.scrollTop,
  (top) => {
    metrics.mark('grid-render-start')
    if (viewport.value && Math.abs(viewport.value.scrollTop - top) > 1) {
      viewport.value.scrollTop = top
    }
  },
)

watch(
  () => [grid.renderedRowIds.value, grid.visibleColumns.value.length] as const,
  () => {
    metrics.mark('grid-render-end')
    metrics.measure('grid-render', 'grid-render-start', 'grid-render-end')
    metrics.recordRender(
      grid.renderedRowIds.value.length,
      grid.renderedRowIds.value.length * grid.visibleColumns.value.length,
    )
  },
)

watch(
  () =>
    [
      editingRowIndex.value,
      grid.virtualWindow.value.startIndex,
      grid.virtualWindow.value.endIndex,
    ] as const,
  ([index, start, end]) => {
    if (!editor.isEditing.value) return
    // Leaving the virtual window — cancel (do not commit) so invalid values cannot sticky-lock.
    if (index < 0 || index < start || index >= end) editor.cancelEditing()
  },
)

watch(
  () => [gridStore.filters, gridStore.sort] as const,
  () => {
    if (editor.isEditing.value) editor.cancelEditing()
    selection.clearSelection()
    gridStore.scrollTop = 0
  },
  { deep: true },
)

const rowAt = (index: number) => {
  const rowId = grid.displayRowIds.value[index]
  if (!rowId) return null
  return datasetStore.rowsById[rowId] ?? null
}

</script>

<template>
  <div ref="shell" class="grid-shell">
    <div
      ref="viewport"
      class="grid-root"
      data-testid="grid-viewport"
      role="grid"
      aria-label="Dataset grid"
      tabindex="0"
      @scroll="grid.onScroll"
      @keydown="onKeydown"
    >
      <div
        class="grid-canvas"
        :style="{
          height: `${grid.virtualWindow.value.totalHeight + GRID_HEADER_HEIGHT}px`,
          width: 'max-content',
          minWidth: '100%',
        }"
      >
        <GridHeader :columns="grid.visibleColumns.value" :template="template" />
        <div :style="{ transform: `translateY(${grid.virtualWindow.value.offsetTop}px)` }">
          <GridRow
            v-for="(rowId, offset) in grid.renderedRowIds.value"
            :key="rowId"
            :row-id="rowId"
            :row-index="grid.virtualWindow.value.startIndex + offset"
            :row-number="grid.virtualWindow.value.startIndex + offset + 1"
            :columns="grid.visibleColumns.value"
            :cells="rowAt(grid.virtualWindow.value.startIndex + offset)?.cells ?? {}"
            :template="template"
            :selected="selection.isSelected(grid.virtualWindow.value.startIndex + offset)"
            :active-column-id="
              selection.activeCell.value?.rowId === rowId
                ? selection.activeCell.value.columnId
                : null
            "
            :height="gridStore.rowHeight"
            @click="
              (event, columnId) =>
                onCellClick(event, grid.virtualWindow.value.startIndex + offset, rowId, columnId)
            "
            @toggle="
              (event) => onToggleRow(event, grid.virtualWindow.value.startIndex + offset, rowId)
            "
            @dblclick="(columnId) => onCellDblClick(rowId, columnId)"
          />
        </div>
        <EditorOverlay
          :columns="grid.visibleColumns.value"
          :template="template"
          :row-index="editingRowIndex"
          :row-height="gridStore.rowHeight"
        />
      </div>
    </div>
    <GridFooter
      :columns="grid.visibleColumns.value"
      :template="template"
      :row-count="grid.displayRowIds.value.length"
      :scroll-left="gridStore.scrollLeft"
      :height="FOOTER_HEIGHT"
    />
  </div>
</template>
