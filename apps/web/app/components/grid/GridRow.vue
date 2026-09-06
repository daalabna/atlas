<script setup lang="ts">
import type { CellValue, Column } from '@atlas/domain'

const props = defineProps<{
  rowIndex: number
  rowId: string
  rowNumber: number
  columns: Column[]
  cells: Record<string, CellValue>
  template: string
  selected: boolean
  activeColumnId: string | null
  height: number
}>()

const emit = defineEmits<{
  click: [event: MouseEvent, columnId: string]
  dblclick: [columnId: string]
  toggle: [event: MouseEvent]
}>()

const display = (column: Column) => {
  const value = props.cells[column.id]
  return value == null ? '' : String(value)
}

const badgeClass = (column: Column) => {
  const value = String(props.cells[column.id] ?? '')
  return ['status', 'priority', 'active'].includes(column.id) ? `badge ${value}` : ''
}
</script>

<template>
  <div
    class="grid-row"
    :class="{ 'is-selected': selected, 'is-active': Boolean(activeColumnId) }"
    :data-row-id="rowId"
    :style="{ gridTemplateColumns: template, height: `${height}px` }"
  >
    <div class="grid-cell grid-cell-index" @click.stop="emit('toggle', $event)">
      <input
        class="row-check"
        type="checkbox"
        :checked="selected"
        tabindex="-1"
        :aria-label="`Select row ${rowNumber}`"
        @click.stop="emit('toggle', $event)"
      />
      <span class="row-number">{{ rowNumber }}</span>
    </div>
    <div
      v-for="column in columns"
      :key="column.id"
      class="grid-cell"
      :class="{ 'is-active': activeColumnId === column.id }"
      :data-testid="`cell-${rowId}-${column.id}`"
      @click="emit('click', $event, column.id)"
      @dblclick="emit('dblclick', column.id)"
    >
      <span class="cell-value" :class="badgeClass(column)">{{ display(column) }}</span>
    </div>
  </div>
</template>
