import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { snapshotToNormalized, type Dataset, type Row, type RowId } from '@atlas/domain'
import { applyPatches, type Patch } from '@atlas/history-engine'
import { atlasApi } from '~/utils/atlasApi'

export const useDatasetStore = defineStore('dataset', () => {
  const dataset = shallowRef<Dataset | null>(null)
  const rowsById = shallowRef<Record<RowId, Row>>(Object.create(null))
  const rowIds = shallowRef<RowId[]>([])
  const loading = shallowRef(true)
  const error = shallowRef<string | null>(null)
  let loadToken = 0

  const columns = computed(() => dataset.value?.columns ?? [])
  const version = computed(() => dataset.value?.version ?? 0)
  const rowCount = computed(() => rowIds.value.length)

  const loadDataset = async (
    id: string,
    size: number,
    options: { stillWanted?: () => boolean; preserveExistingOnError?: boolean } = {},
  ) => {
    const token = ++loadToken
    loading.value = true
    error.value = null
    try {
      const snapshot = await atlasApi.datasets.getSnapshot(id, size)
      if (token !== loadToken || options.stillWanted?.() === false) return false
      const normalized = snapshotToNormalized(snapshot.dataset, snapshot.rows)
      dataset.value = normalized.dataset
      rowsById.value = normalized.rowsById
      rowIds.value = normalized.dataset.rowIds
      return true
    } catch (err) {
      if (token !== loadToken) return false
      if (!options.preserveExistingOnError || !dataset.value) {
        error.value = err instanceof Error ? err.message : 'Failed to load dataset'
      }
      throw err
    } finally {
      if (token === loadToken) loading.value = false
    }
  }

  /** Prevent a response from an abandoned scope from replacing the active snapshot. */
  const invalidateInFlightLoads = () => {
    loadToken += 1
    loading.value = false
  }

  const replaceDataset = (next: Dataset, nextRows: Record<RowId, Row>) => {
    loadToken += 1
    loading.value = false
    error.value = null
    dataset.value = next
    rowsById.value = nextRows
    rowIds.value = next.rowIds
  }

  const applyLocalPatches = (patches: Patch[]) => {
    const nextState = applyPatches(
      { dataset: dataset.value, rowsById: rowsById.value, rowIds: rowIds.value },
      patches,
    )
    rowsById.value = nextState.rowsById
    rowIds.value = nextState.rowIds
    // Keep nested dataset.rowIds aligned with the top-level order ref.
    dataset.value = nextState.dataset
      ? { ...nextState.dataset, rowIds: nextState.rowIds }
      : nextState.dataset
  }

  const setVersion = (next: number) => {
    if (!dataset.value) return
    dataset.value = { ...dataset.value, version: next, updatedAt: new Date().toISOString() }
  }

  return {
    dataset,
    rowsById,
    rowIds,
    columns,
    version,
    rowCount,
    loading,
    error,
    loadDataset,
    invalidateInFlightLoads,
    replaceDataset,
    applyLocalPatches,
    setVersion,
  }
})
