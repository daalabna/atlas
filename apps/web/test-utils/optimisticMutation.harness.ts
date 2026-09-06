import { createPinia, setActivePinia } from 'pinia'
import { resetOptimisticMutationState } from '~/utils/optimisticTransport'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useSessionStore } from '~/stores/session'
import { resetAbandonedRemote } from '~/utils/abandonedRemote'
import { resetDatasetQueues } from '~/utils/remoteMutations'
import { clearSkippedWorkerTouches } from '~/composables/optimisticWorkerSync'

export const snapshot = (name: string, version = 1) => ({
  dataset: {
    id: 'customers',
    name: 'Customers',
    version,
    columns: [{ id: 'name', name: 'Name', type: 'text' as const, width: 160 }],
    rowIds: ['r1'],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  rows: [{ id: 'r1', cells: { name } }],
})

export const input = (oldValue: string, newValue: string) => ({
  type: 'update-cell' as const,
  summary: `${oldValue} -> ${newValue}`,
  patches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue, newValue }],
  inversePatches: [
    { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: newValue, newValue: oldValue },
  ],
  mutations: [
    {
      type: 'update-cell' as const,
      rowId: 'r1',
      columnId: 'name',
      value: newValue,
    },
  ],
  revertMutations: [
    {
      type: 'update-cell' as const,
      rowId: 'r1',
      columnId: 'name',
      value: oldValue,
    },
  ],
})

export const resetOptimisticFixtures = (mocks: {
  applyMutation: { mockReset: () => void }
  getSnapshot: { mockReset: () => void }
  syncWorkerFromDataset: { mockReset: () => void; mockResolvedValue: (value: unknown) => void }
}) => {
  setActivePinia(createPinia())
  resetOptimisticMutationState()
  resetDatasetQueues()
  resetAbandonedRemote()
  clearSkippedWorkerTouches()
  mocks.applyMutation.mockReset()
  mocks.getSnapshot.mockReset()
  mocks.syncWorkerFromDataset.mockReset()
  mocks.syncWorkerFromDataset.mockResolvedValue(undefined)
  const dataset = useDatasetStore()
  const initial = snapshot('A')
  const row = initial.rows[0]
  if (!row) throw new Error('fixture missing row')
  dataset.replaceDataset(initial.dataset, { r1: row })
  useSessionStore().activeDatasetId = 'customers'
  useSessionStore().datasetSize = 10_000
  const grid = useGridStore()
  grid.acknowledgeWorkerHydration(grid.workerGeneration)
}
