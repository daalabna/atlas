<script setup lang="ts">
import type { Column } from '@atlas/domain'
import CellEditor from '../editor/CellEditor.vue'
import { useCellEditor } from '~/composables/useCellEditor'
import { useGridStore } from '~/stores/grid'
import { GRID_HEADER_HEIGHT } from '~/utils/gridLayout'

const props = defineProps<{
  columns: Column[]
  template: string
  /** Absolute index of the editing row in the current display order (-1 if missing). */
  rowIndex: number
  rowHeight: number
  headerHeight?: number
}>()

const editor = useCellEditor()
const headerHeight = computed(() => props.headerHeight ?? GRID_HEADER_HEIGHT)

const column = computed(() =>
  props.columns.find((item) => item.id === editor.editing.value?.columnId),
)

const left = computed(() => {
  const index = props.columns.findIndex((item) => item.id === editor.editing.value?.columnId)
  if (index < 0) return 0
  const parts = props.template.split(' ')
  return parts.slice(0, index + 1).reduce((sum, part) => sum + Number.parseInt(part, 10), 0)
})

const width = computed(() => {
  const index = props.columns.findIndex((item) => item.id === editor.editing.value?.columnId)
  const parts = props.template.split(' ')
  return Number.parseInt(parts[index + 1] ?? '160', 10)
})

const visible = computed(
  () => Boolean(editor.editing.value && column.value && props.rowIndex >= 0),
)
const gridStore = useGridStore()
const errorAbove = computed(() => {
  const overlayBottom = headerHeight.value + props.rowIndex * props.rowHeight + props.rowHeight
  return overlayBottom + 28 > gridStore.scrollTop + gridStore.viewportHeight
})
</script>

<template>
  <div
    v-if="visible && column"
    class="editor-overlay"
    :style="{
      top: `${headerHeight + rowIndex * rowHeight}px`,
      left: `${left}px`,
      width: `${width}px`,
      height: `${rowHeight}px`,
    }"
  >
    <CellEditor :column="column" />
    <span
      v-if="editor.error.value"
      class="editor-error"
      :class="{ 'is-above': errorAbove }"
      role="alert"
    >{{ editor.error.value }}</span>
  </div>
</template>
