import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { ColumnId, Filter, SortRule } from '@atlas/domain'
export const useGridStore = defineStore('grid', () => {
  const sort = shallowRef<SortRule[]>([])
  const filters = shallowRef<Filter[]>([])
  const visibleColumns = shallowRef<ColumnId[]>([])
  const columnWidths = ref<Record<ColumnId, number>>({})
  const rowHeight = ref(32)
  const scrollTop = ref(0)
  const scrollLeft = ref(0)
  const viewportHeight = ref(640)
  const viewportWidth = ref(1200)
  const visibleRowIds = shallowRef<string[] | null>(null)
  const useWorker = ref(true)
  const processing = ref(false)
  /** Bumped to force filter/sort re-run (e.g. after server restore). */
  const queryNonce = ref(0)
  /** Identifies the dataset snapshot the worker cache must contain. */
  const workerGeneration = ref(0)
  /** Equals workerGeneration only after that snapshot has been fully hydrated. */
  const hydratedWorkerGeneration = ref(-1)
  const workerHydrated = computed(() => hydratedWorkerGeneration.value === workerGeneration.value)
  const hasActiveQuery = computed(() => sort.value.length > 0 || filters.value.length > 0)
  const setVisibleColumns = (ids: ColumnId[]) => {
    visibleColumns.value = ids
  }
  const setColumnWidth = (id: ColumnId, width: number) => {
    columnWidths.value = { ...columnWidths.value, [id]: Math.max(72, width) }
  }
  const setFilters = (next: Filter[]) => {
    filters.value = next
  }
  const toggleSort = (columnId: ColumnId) => {
    const current = sort.value[0]
    if (!current || current.columnId !== columnId) {
      sort.value = [{ columnId, direction: 'asc' }]
      return
    }
    if (current.direction === 'asc') {
      sort.value = [{ columnId, direction: 'desc' }]
      return
    }
    sort.value = []
  }
  const applyView = (input: {
    filters: Filter[]
    sorting: SortRule[]
    visibleColumns: ColumnId[]
    columnWidths: Record<ColumnId, number>
  }) => {
    // Assign query fields first so one computed queryKey flush drives syncQuery.
    filters.value = input.filters
    sort.value = input.sorting
    visibleColumns.value = input.visibleColumns
    columnWidths.value = { ...input.columnWidths }
  }
  const requestSync = () => {
    queryNonce.value += 1
  }
  const invalidateWorker = () => {
    workerGeneration.value += 1
  }
  const acknowledgeWorkerHydration = (generation = workerGeneration.value) => {
    if (generation === workerGeneration.value) hydratedWorkerGeneration.value = generation
  }
  return {
    sort,
    filters,
    visibleColumns,
    columnWidths,
    rowHeight,
    scrollTop,
    scrollLeft,
    viewportHeight,
    viewportWidth,
    visibleRowIds,
    useWorker,
    processing,
    queryNonce,
    workerGeneration,
    hydratedWorkerGeneration,
    workerHydrated,
    hasActiveQuery,
    setVisibleColumns,
    setColumnWidth,
    setFilters,
    toggleSort,
    applyView,
    requestSync,
    invalidateWorker,
    acknowledgeWorkerHydration,
  }
})
