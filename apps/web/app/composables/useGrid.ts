import { computed, onMounted, onUnmounted, watch } from 'vue'
import { aggregateRows } from '@atlas/data-engine'
import { virtualizeRows } from '@atlas/virtual-grid'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { resolveVisibleColumns, runMainThreadFilterSort } from '~/utils/gridQuery'
import { useDataWorker } from './useDataWorker'
import { usePerformance } from './usePerformance'
import { GRID_OVERSCAN, gridBodyViewportHeight } from '~/utils/gridLayout'
import { joinChunkedWorkerHydrate } from '~/utils/workerHydrate'
import { clearSkippedWorkerTouches, flushSkippedWorkerTouches } from './optimisticWorkerSync'

export const useGrid = () => {
  const datasetStore = useDatasetStore()
  const gridStore = useGridStore()
  const metrics = usePerformance()
  const worker = useDataWorker()
  let scoreTimer: ReturnType<typeof setTimeout> | null = null
  let queryToken = 0
  let aggregateToken = 0
  let initPromise: Promise<void> | null = null
  let initGeneration = -1
  let scrollRaf = 0
  let booted = false
  const stopWorkerResetListener = worker.onReset(() => {
    gridStore.invalidateWorker()
    resetHydration()
  })

  const displayRowIds = computed(() => gridStore.visibleRowIds ?? datasetStore.rowIds)
  const virtualWindow = computed(() =>
    virtualizeRows({
      count: displayRowIds.value.length,
      rowHeight: gridStore.rowHeight,
      viewportHeight: gridBodyViewportHeight(gridStore.viewportHeight),
      scrollTop: gridStore.scrollTop,
      overscan: GRID_OVERSCAN,
    }),
  )
  const renderedRowIds = computed(() =>
    displayRowIds.value.slice(virtualWindow.value.startIndex, virtualWindow.value.endIndex),
  )
  const visibleColumns = computed(() =>
    resolveVisibleColumns(datasetStore.columns, gridStore.visibleColumns),
  )

  const queryKey = computed(() =>
    JSON.stringify({
      filters: gridStore.filters,
      sort: gridStore.sort,
      useWorker: gridStore.useWorker,
      datasetId: datasetStore.dataset?.id ?? null,
      nonce: gridStore.queryNonce,
      version: datasetStore.version,
    }),
  )

  const onScroll = (event: Event) => {
    const target = event.target as HTMLElement
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      gridStore.scrollTop = target.scrollTop
      gridStore.scrollLeft = target.scrollLeft
    })
  }

  const numericColumnIds = () =>
    datasetStore.columns.filter((column) => column.type === 'number').map((column) => column.id)

  const refreshScoreStats = async (rowIds: string[], token: number) => {
    const columns = numericColumnIds()
    if (!columns.length) {
      if (token !== aggregateToken) return
      metrics.recordScore(null)
      return
    }
    const workerResult = gridStore.workerHydrated
      ? await worker.aggregate(rowIds, columns).catch(() => null)
      : null
    const aggregate =
      workerResult?.aggregate ?? aggregateRows(rowIds, datasetStore.rowsById, columns)
    if (token !== aggregateToken) return
    metrics.recordScore(aggregate.numeric.score ?? null)
  }

  const scheduleScoreRefresh = (rowIds: string[]) => {
    if (scoreTimer) clearTimeout(scoreTimer)
    const token = ++aggregateToken
    scoreTimer = setTimeout(() => {
      void refreshScoreStats(rowIds, token)
    }, 600)
  }

  const resetHydration = () => {
    initPromise = null
    initGeneration = -1
  }

  const isCurrentGeneration = (generation: number) => generation === gridStore.workerGeneration

  const validateHydrateMembership = (generation: number, expected: number, actual: number) => {
    if (!isCurrentGeneration(generation)) return false
    if (actual === expected) return true
    gridStore.invalidateWorker()
    return false
  }

  const hydrateGeneration = (generation: number) => {
    const rowIdsAtStart = datasetStore.rowIds
    const rowIds = rowIdsAtStart.slice()
    return joinChunkedWorkerHydrate(generation, {
      rowIds,
      rowIdsAtStart,
      getRow: (id) => datasetStore.rowsById[id],
      expectedRowCount: rowIds.length,
      getLiveRowCount: () => datasetStore.rowIds.length,
      getLiveRowIds: () => datasetStore.rowIds,
      init: worker.init,
      patchRows: (rows) => worker.patchRows({ rows }),
      shouldAbort: () => !isCurrentGeneration(generation),
      onRowCountChange: (expected, actual) =>
        validateHydrateMembership(generation, expected, actual),
    })
  }

  const commitHydration = async (generation: number, hydrated: boolean) => {
    if (!isCurrentGeneration(generation)) return
    if (!hydrated) {
      // Identity-only membership change does not bump generation. Allow a retry.
      resetHydration()
      return
    }
    try {
      await flushSkippedWorkerTouches()
      if (isCurrentGeneration(generation)) gridStore.acknowledgeWorkerHydration(generation)
    } catch {
      // Re-queued touches must survive; a generation bump would clear them.
      if (initGeneration === generation) resetHydration()
    }
  }

  const runHydration = async (generation: number) => {
    const hydrated = await hydrateGeneration(generation)
    await commitHydration(generation, hydrated)
  }

  const beginHydrate = (generation: number) => {
    initGeneration = generation
    initPromise = runHydration(generation).catch((error) => {
      if (initGeneration === generation) resetHydration()
      throw error
    })
  }

  const joinHydrate = async (generation: number) => {
    if (!initPromise || initGeneration !== generation) beginHydrate(generation)
    await initPromise
  }

  /** Progressive worker cache fill — does not touch refcount (boot once on mount). */
  const ensureWorkerData = async () => {
    if (!datasetStore.rowIds.length) return
    if (!worker.ensureReady()) return
    if (gridStore.workerHydrated) return
    await joinHydrate(gridStore.workerGeneration)
    // One same-call retry: !ok / flush throw reset the promise without a generation bump,
    // so concurrent waiters would otherwise fall through to main-thread.
    if (gridStore.workerHydrated || !datasetStore.rowIds.length || !worker.ensureReady()) return
    await joinHydrate(gridStore.workerGeneration)
  }

  const runOnMainThread = (token: number, options?: { ownProcessing?: boolean }) => {
    const ownProcessing = options?.ownProcessing ?? true
    if (ownProcessing) gridStore.processing = true
    try {
      const filterStarted = globalThis.performance.now()
      const sorted = runMainThreadFilterSort(
        datasetStore.rowIds,
        datasetStore.rowsById,
        gridStore.filters,
        gridStore.sort,
      )
      const duration = globalThis.performance.now() - filterStarted
      if (token !== queryToken) return
      gridStore.visibleRowIds = sorted
      // Combined wall time — filter+sort share one main-thread pass via runMainThreadFilterSort.
      metrics.record('filter-sort', duration)
      scheduleScoreRefresh(sorted)
    } finally {
      if (ownProcessing && token === queryToken) gridStore.processing = false
    }
  }

  const runOnWorker = async (token: number) => {
    gridStore.processing = true
    try {
      await ensureWorkerData()
      if (token !== queryToken) return
      if (!gridStore.workerHydrated) {
        runOnMainThread(token, { ownProcessing: false })
        return
      }
      const started = globalThis.performance.now()
      const result = await worker.filterSort(gridStore.filters, gridStore.sort)
      if (token !== queryToken) return
      gridStore.visibleRowIds = result.rowIds
      metrics.record('worker', result.duration)
      metrics.record('filter-sort', globalThis.performance.now() - started)
      scheduleScoreRefresh(result.rowIds)
    } catch {
      if (token !== queryToken) return
      runOnMainThread(token, { ownProcessing: false })
    } finally {
      if (token === queryToken) gridStore.processing = false
    }
  }

  const syncQuery = async () => {
    const token = ++queryToken
    if (!gridStore.filters.length && !gridStore.sort.length) {
      gridStore.visibleRowIds = null
      gridStore.processing = false
      scheduleScoreRefresh(datasetStore.rowIds)
      return
    }
    if (gridStore.useWorker) await runOnWorker(token)
    else runOnMainThread(token)
  }

  const initWorker = async () => {
    if (gridStore.workerHydrated) return
    await ensureWorkerData()
  }

  onMounted(() => {
    if (!booted) {
      worker.boot()
      booted = true
    }
  })
  const releaseResources = () => {
    stopWorkerResetListener()
    if (booted) {
      worker.release()
      booted = false
    }
    if (scoreTimer) clearTimeout(scoreTimer)
    if (scrollRaf) cancelAnimationFrame(scrollRaf)
    queryToken += 1
    aggregateToken += 1
    resetHydration()
  }

  onUnmounted(releaseResources)

  watch(
    () => datasetStore.dataset?.id,
    () => {
      resetHydration()
    },
  )

  watch(
    () => gridStore.workerGeneration,
    () => {
      clearSkippedWorkerTouches()
      resetHydration()
    },
  )

  watch(queryKey, () => {
    void syncQuery()
  })

  watch(
    () => datasetStore.version,
    () => {
      if (!gridStore.filters.length && !gridStore.sort.length) {
        scheduleScoreRefresh(datasetStore.rowIds)
      }
    },
  )

  return {
    displayRowIds,
    renderedRowIds,
    visibleColumns,
    virtualWindow,
    workerHydrated: computed(() => gridStore.workerHydrated && worker.isReady()),
    processing: computed(() => gridStore.processing),
    onScroll,
    syncQuery,
    initWorker,
  }
}
