import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useSelectionStore } from '~/stores/selection'
import { ensureWorkerReady, hydrateWorkerFromDataset } from './useDataWorker'
import { clearSkippedWorkerTouches, flushSkippedWorkerTouches } from './optimisticWorkerSync'

export type SnapshotHydrate = typeof hydrateWorkerFromDataset
export type SnapshotEnsureWorker = typeof ensureWorkerReady

/**
 * Pure orchestration used by load / restore / conflict reload.
 * Extracted so unit tests can inject hydrate/ensure without a real Worker.
 */
export const runSnapshotSideEffects = async (deps?: {
  ensureWorker?: SnapshotEnsureWorker
  hydrate?: SnapshotHydrate
}) => {
  const datasetStore = useDatasetStore()
  const gridStore = useGridStore()
  const selection = useSelectionStore()
  const ensure = deps?.ensureWorker ?? ensureWorkerReady
  const hydrate = deps?.hydrate ?? hydrateWorkerFromDataset

  selection.clearSelection()
  gridStore.visibleRowIds = null
  gridStore.scrollTop = 0
  gridStore.invalidateWorker()
  clearSkippedWorkerTouches()
  ensure()
  const generation = gridStore.workerGeneration
  const rowIdsAtStart = datasetStore.rowIds
  const rowIds = rowIdsAtStart.slice()
  const hydrated = await hydrate({
    rowIds,
    rowIdsAtStart,
    rowsById: datasetStore.rowsById,
    getRowsById: () => datasetStore.rowsById,
    getLiveRowCount: () => datasetStore.rowIds.length,
    getLiveRowIds: () => datasetStore.rowIds,
    generation,
    shouldAbort: () => gridStore.workerGeneration !== generation,
    onRowCountChange: (expected, actual) => {
      if (gridStore.workerGeneration !== generation) return false
      if (actual !== expected) {
        gridStore.invalidateWorker()
        return false
      }
      return true
    },
  })
  if (gridStore.workerGeneration !== generation) return { acknowledged: false, generation }
  if (hydrated) {
    try {
      await flushSkippedWorkerTouches()
    } catch {
      gridStore.invalidateWorker()
      gridStore.requestSync()
      return { acknowledged: false, generation }
    }
    if (gridStore.workerGeneration !== generation) return { acknowledged: false, generation }
    gridStore.acknowledgeWorkerHydration(generation)
  }
  gridStore.requestSync()
  return { acknowledged: hydrated, generation }
}

/**
 * Shared post-snapshot invariants after loadDataset / restore / conflict reload.
 */
export const applySnapshotSideEffects = async () => {
  await runSnapshotSideEffects()
}
