import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'

const { syncWorkerFromDataset } = vi.hoisted(() => ({
  syncWorkerFromDataset: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./useDataWorker', () => ({ syncWorkerFromDataset }))

import {
  clearSkippedWorkerTouches,
  flushSkippedWorkerTouches,
  rememberSkippedWorkerTouches,
  syncWorker,
} from './optimisticWorkerSync'

const cellPatch = {
  path: ['rowsById', 'r1', 'cells', 'name'],
  oldValue: 'Ada',
  newValue: 'Zoe',
}

describe('syncWorker hydrate skip replay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearSkippedWorkerTouches()
    syncWorkerFromDataset.mockReset()
    syncWorkerFromDataset.mockResolvedValue(undefined)
    const dataset = useDatasetStore()
    dataset.replaceDataset(
      {
        id: 'customers',
        name: 'Customers',
        version: 1,
        columns: [{ id: 'name', name: 'Name', type: 'text', width: 120 }],
        rowIds: ['r1'],
        createdAt: 't',
        updatedAt: 't',
      },
      { r1: { id: 'r1', cells: { name: 'Zoe' } } },
    )
  })

  it('records cell touches while the worker is not hydrated and does not patch-rows', async () => {
    const grid = useGridStore()
    grid.invalidateWorker()
    expect(grid.workerHydrated).toBe(false)
    const nonce = grid.queryNonce

    await syncWorker([cellPatch])

    expect(syncWorkerFromDataset).not.toHaveBeenCalled()
    expect(grid.queryNonce).toBe(nonce + 1)
    expect(grid.workerGeneration).toBeGreaterThan(0)
  })

  it('flushes skipped touches from live Pinia before the next acknowledge', async () => {
    useGridStore().invalidateWorker()
    await syncWorker([cellPatch])
    expect(syncWorkerFromDataset).not.toHaveBeenCalled()

    await flushSkippedWorkerTouches()
    expect(syncWorkerFromDataset).toHaveBeenCalledWith({
      rowIds: ['r1'],
      rowsById: useDatasetStore().rowsById,
      touchedIds: ['r1'],
    })

    await flushSkippedWorkerTouches()
    expect(syncWorkerFromDataset).toHaveBeenCalledOnce()
  })

  it('drains touches recorded while a flush pass is in flight', async () => {
    useDatasetStore().replaceDataset(
      {
        id: 'customers',
        name: 'Customers',
        version: 1,
        columns: [{ id: 'name', name: 'Name', type: 'text', width: 120 }],
        rowIds: ['r1', 'r2'],
        createdAt: 't',
        updatedAt: 't',
      },
      {
        r1: { id: 'r1', cells: { name: 'Zoe' } },
        r2: { id: 'r2', cells: { name: 'Ada' } },
      },
    )
    useGridStore().invalidateWorker()
    await syncWorker([cellPatch])
    syncWorkerFromDataset.mockImplementationOnce(async () => {
      rememberSkippedWorkerTouches(['r2'])
    })

    await flushSkippedWorkerTouches()

    expect(syncWorkerFromDataset).toHaveBeenCalledTimes(2)
    expect(syncWorkerFromDataset.mock.calls[1]![0]).toMatchObject({ touchedIds: ['r2'] })
    await flushSkippedWorkerTouches()
    expect(syncWorkerFromDataset).toHaveBeenCalledTimes(2)
  })

  it('re-queues touches when a flush pass throws', async () => {
    useGridStore().invalidateWorker()
    await syncWorker([cellPatch])
    syncWorkerFromDataset.mockRejectedValueOnce(new Error('not ready'))

    await expect(flushSkippedWorkerTouches()).rejects.toThrow(/not ready/)
    await flushSkippedWorkerTouches()
    expect(syncWorkerFromDataset).toHaveBeenCalledTimes(2)
    expect(syncWorkerFromDataset.mock.calls[1]![0]).toMatchObject({ touchedIds: ['r1'] })
  })

  it('drops skipped touches when a structural edit invalidates hydrate', async () => {
    useGridStore().invalidateWorker()
    await syncWorker([cellPatch])
    await syncWorker([
      { path: ['rowIds'], oldValue: ['r1'], newValue: [] },
      { path: ['rowsById', 'r1'], oldValue: { id: 'r1', cells: { name: 'Zoe' } }, newValue: undefined },
    ])
    await flushSkippedWorkerTouches()
    expect(syncWorkerFromDataset).not.toHaveBeenCalled()
  })
})
