<script setup lang="ts">
import type { Column, Filter, FilterOperator } from '@atlas/domain'
import { AtlasButton, AtlasInput, AtlasSelect } from '@atlas/ui'
import { useGridStore } from '~/stores/grid'
import { useSessionStore } from '~/stores/session'
import { useViewsStore } from '~/stores/views'
import { useHistoryStore } from '~/stores/history'
import { isTransportBusy } from '~/utils/transportBusy'

const props = defineProps<{
  columns: Column[]
}>()

const grid = useGridStore()
const session = useSessionStore()
const viewsStore = useViewsStore()
const historyStore = useHistoryStore()
const transportBusy = computed(() =>
  isTransportBusy({
    writesBlocked: session.writesBlocked,
    workspaceLoading: session.workspaceLoading,
    pendingCount: historyStore.pendingCount,
  }),
)

/** IDs of filters that belong to the currently active view — read-only / pinned. */
const pinnedFilterIds = computed(() => {
  const view = viewsStore.activeView
  if (!view) return new Set<string>()
  return new Set(view.filters.map((f) => f.id))
})

const isPinned = (filter: Filter) => pinnedFilterIds.value.has(filter.id)

const textOperators = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'not-equals', label: 'not equals' },
]

const numberOperators = [
  { value: 'gt', label: 'gt' },
  { value: 'lt', label: 'lt' },
  { value: 'equals', label: 'equals' },
]

const selectOperators = [
  { value: 'equals', label: 'equals' },
  { value: 'not-equals', label: 'not equals' },
]

const booleanOperators = [
  { value: 'is-true', label: 'is true' },
  { value: 'is-false', label: 'is false' },
]

const operatorOptionsForColumn = (columnId: string) => {
  const column = props.columns.find((item) => item.id === columnId)
  if (!column) return textOperators
  if (column.type === 'boolean') return booleanOperators
  if (column.type === 'number') return numberOperators
  if (column.type === 'select') return selectOperators
  return textOperators
}

const defaultOperator = (column: Column): FilterOperator => {
  if (column.type === 'boolean') return 'is-true'
  if (column.type === 'number') return 'gt'
  if (column.type === 'select') return 'equals'
  return 'contains'
}

const needsValue = (operator: FilterOperator) =>
  operator !== 'is-true' && operator !== 'is-false' && operator !== 'is-empty'

const usedColumns = computed(() => new Set(grid.filters.map((filter) => filter.columnId)))

const canAddFilter = computed(() =>
  props.columns.some((column) => !usedColumns.value.has(column.id)),
)

const columnOptionsForRow = (index: number) => {
  const current = grid.filters[index]?.columnId
  return props.columns
    .filter((column) => column.id === current || !usedColumns.value.has(column.id))
    .map((column) => ({ value: column.id, label: column.name }))
}

const addFilter = () => {
  if (transportBusy.value) return
  const column = props.columns.find((item) => !usedColumns.value.has(item.id))
  if (!column) {
    session.flash('Each column can only have one filter')
    return
  }
  grid.setFilters([
    ...grid.filters,
    {
      id: crypto.randomUUID(),
      columnId: column.id,
      operator: defaultOperator(column),
      value: '',
    },
  ])
}

const updateFilter = (index: number, patch: Partial<Filter>) => {
  if (transportBusy.value) return
  const target = grid.filters[index]
  if (target && isPinned(target)) return
  if (patch.columnId) {
    const taken = grid.filters.some(
      (filter, i) => i !== index && filter.columnId === patch.columnId,
    )
    if (taken) {
      session.flash('A filter for this column already exists')
      return
    }
  }
  const next = grid.filters.map((filter, i) => {
    if (i !== index) return filter
    const merged = { ...filter, ...patch }
    if (patch.columnId && patch.columnId !== filter.columnId) {
      const column = props.columns.find((item) => item.id === patch.columnId)
      if (column) merged.operator = defaultOperator(column)
    }
    if (patch.operator && !needsValue(patch.operator as FilterOperator)) {
      merged.value = ''
    }
    return merged
  })
  grid.setFilters(next)
}

const setOperator = (index: number, value: string) => {
  updateFilter(index, { operator: value as FilterOperator })
}

const removeFilter = (index: number) => {
  if (transportBusy.value) return
  const target = grid.filters[index]
  if (target && isPinned(target)) return
  grid.setFilters(grid.filters.filter((_, i) => i !== index))
}
</script>

<template>
  <div class="filter-bar">
    <div class="filter-bar-head">
      <AtlasButton
        size="sm"
        data-testid="add-filter"
        :disabled="!canAddFilter || transportBusy"
        @click="addFilter"
      >
        Add filter
      </AtlasButton>
      <span v-if="grid.filters.length" class="filter-bar-count">
        {{ grid.filters.length }} active
      </span>
    </div>
    <div v-if="grid.filters.length" class="filter-list">
      <div
        v-for="(filter, index) in grid.filters"
        :key="filter.id"
        class="filter-row"
        :class="{ 'is-pinned': isPinned(filter) }"
      >
        <AtlasSelect
          size="sm"
          class="filter-column"
          :model-value="filter.columnId"
          :options="columnOptionsForRow(index)"
          :disabled="isPinned(filter) || transportBusy"
          @update:model-value="updateFilter(index, { columnId: $event })"
        />
        <AtlasSelect
          size="sm"
          class="filter-operator"
          :model-value="filter.operator"
          :options="operatorOptionsForColumn(filter.columnId)"
          :disabled="isPinned(filter) || transportBusy"
          @update:model-value="setOperator(index, $event)"
        />
        <AtlasInput
          v-if="needsValue(filter.operator)"
          size="sm"
          class="filter-value"
          :model-value="String(filter.value ?? '')"
          data-testid="filter-value"
          placeholder="Value"
          :disabled="isPinned(filter) || transportBusy"
          @update:model-value="updateFilter(index, { value: $event })"
        />
        <span v-else class="filter-row-spacer" />
        <AtlasButton
          v-if="!isPinned(filter)"
          size="sm"
          variant="subtle"
          :disabled="transportBusy"
          @click="removeFilter(index)"
        >×</AtlasButton>
        <span
          v-else
          class="filter-pin"
          role="status"
          aria-label="View filter (locked)"
          title="View filter (locked)"
        >Locked</span>
      </div>
    </div>
  </div>
</template>
