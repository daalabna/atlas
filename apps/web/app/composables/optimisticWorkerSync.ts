import type { Patch } from '@atlas/history-engine'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { collectTouchIds, isStructuralPatches } from '~/utils/optimisticHelpers'
import { syncWorkerFromDataset } from './useDataWorker'

/** Cell ids skipped while hydrate is in flight — flush before acknowledge. */
const skippedTouchIds = new Set<string>()

export const rememberSkippedWorkerTouches = (ids: readonly string[]) => {
  for (const id of ids) skippedTouchIds.add(id)
}

export const clearSkippedWorkerTouches = () => {
  skippedTouchIds.clear()
}

const MAX_FLUSH_PASSES = 8

export const flushSkippedWorkerTouches = async () => {
  const datasetStore = useDatasetStore()
  for (let pass = 0; skippedTouchIds.size > 0; pass++) {
    if (pass >= MAX_FLUSH_PASSES) {
      throw new Error('Worker touch flush did not drain')
    }
    const touchedIds = [...skippedTouchIds]
    skippedTouchIds.clear()
    try {
      await syncWorkerFromDataset({
        rowIds: datasetStore.rowIds,
        rowsById: datasetStore.rowsById,
        touchedIds,
      })
    } catch (error) {
      for (const id of touchedIds) skippedTouchIds.add(id)
      throw error
    }
  }
}

export const syncWorker = async (patches: Patch[]) => {
  const datasetStore = useDatasetStore()
  const gridStore = useGridStore()
  const { touchedIds, removedIds } = collectTouchIds(patches)
  const structural = isStructuralPatches(patches)
  // Structural edits bump generation and abort in-flight hydrate. Do not patch-rows
  // afterward — unordered patch vs init can corrupt the worker cache.
  if (structural) {
    clearSkippedWorkerTouches()
    // notifyLocalPatches already invalidated on execute; syncRemote still needs a bump.
    if (gridStore.workerHydrated) gridStore.invalidateWorker()
    gridStore.requestSync()
    return
  }
  // While rehydrate is in flight, skip patch-rows; Pinia stays authoritative.
  // Do not invalidate here — that would abort the in-flight hydrate on every cell edit.
  if (!gridStore.workerHydrated) {
    rememberSkippedWorkerTouches(touchedIds)
    gridStore.requestSync()
    return
  }
  try {
    await syncWorkerFromDataset({
      rowIds: datasetStore.rowIds,
      rowsById: datasetStore.rowsById,
      touchedIds,
      removedIds,
    })
  } catch {
    // Worker acceleration is optional; keep Pinia authoritative and rehydrate later.
    gridStore.invalidateWorker()
  }
  gridStore.requestSync()
}

/** Immediate UI/worker generation bump — must not await (keeps apply→enqueue atomic). */
export const notifyLocalPatches = (patches: Patch[]) => {
  const gridStore = useGridStore()
  if (isStructuralPatches(patches)) gridStore.invalidateWorker()
  gridStore.requestSync()
}
