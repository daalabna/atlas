import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useSelectionStore } from '~/stores/selection'
import { runSnapshotSideEffects } from './useSnapshotSync'
import { clearSkippedWorkerTouches } from './optimisticWorkerSync'

describe('runSnapshotSideEffects', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearSkippedWorkerTouches()
  })

  it('clears selection, invalidates worker, and acknowledges hydrate', async () => {
    const dataset = useDatasetStore()
    const grid = useGridStore()
    const selection = useSelectionStore()

    dataset.replaceDataset(
      {
        id: 'customers',
        name: 'Customers',
        version: 1,
        columns: [],
        rowIds: ['r1'],
        createdAt: 't',
        updatedAt: 't',
      },
      { r1: { id: 'r1', cells: { name: 'Ada' } } },
    )
    selection.selectRow(0, 'r1', 'name')
    grid.visibleRowIds = ['r1']
    grid.scrollTop = 400
    const generationBefore = grid.workerGeneration

    const ensure = vi.fn()
    const hydrate = vi.fn().mockResolvedValue(true)

    const result = await runSnapshotSideEffects({ ensureWorker: ensure, hydrate })

    expect(ensure).toHaveBeenCalledOnce()
    expect(hydrate).toHaveBeenCalledOnce()
    expect(selection.rangeCount).toBe(0)
    expect(grid.visibleRowIds).toBeNull()
    expect(grid.scrollTop).toBe(0)
    expect(grid.workerGeneration).toBe(generationBefore + 1)
    expect(result.acknowledged).toBe(true)
    expect(grid.workerHydrated).toBe(true)
    expect(grid.queryNonce).toBeGreaterThan(0)
  })

  it('skips acknowledge when hydrate aborts after epoch bump', async () => {
    const dataset = useDatasetStore()
    const grid = useGridStore()
    dataset.replaceDataset(
      {
        id: 'customers',
        name: 'Customers',
        version: 1,
        columns: [],
        rowIds: ['r1'],
        createdAt: 't',
        updatedAt: 't',
      },
      { r1: { id: 'r1', cells: {} } },
    )

    const hydrate = vi.fn().mockImplementation(async () => {
      grid.invalidateWorker()
      return true
    })

    const result = await runSnapshotSideEffects({
      ensureWorker: () => true,
      hydrate,
    })

    expect(result.acknowledged).toBe(false)
  })
})
