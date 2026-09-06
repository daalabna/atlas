import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const execute = vi.fn()

vi.mock('./useOptimisticMutation', () => ({
  useOptimisticMutation: () => ({ execute, syncRemote: vi.fn() }),
}))
vi.mock('./useSnapshotSync', () => ({ applySnapshotSideEffects: vi.fn() }))

import { applySnapshotSideEffects } from './useSnapshotSync'
import { useDataset } from './useDataset'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'

describe('useDataset mutation builders', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    execute.mockReset()
    execute.mockResolvedValue(undefined)
    vi.mocked(applySnapshotSideEffects).mockReset()
    vi.mocked(applySnapshotSideEffects).mockResolvedValue(undefined)
    const store = useDatasetStore()
    store.replaceDataset(
      {
        id: 'customers',
        name: 'Customers',
        version: 3,
        columns: [
          { id: 'name', name: 'Name', type: 'text', width: 120 },
          {
            id: 'priority',
            name: 'Priority',
            type: 'select',
            width: 100,
            options: ['low', 'high'],
          },
        ],
        rowIds: ['r1', 'r2'],
        createdAt: 't',
        updatedAt: 't',
      },
      {
        r1: { id: 'r1', cells: { name: 'Ada', priority: 'low' } },
        r2: { id: 'r2', cells: { name: 'Bob', priority: 'low' } },
      },
    )
  })

  it('updateCell sends MutationDraft without transport fields', async () => {
    await useDataset().updateCell('r1', 'name', 'Ada Lovelace')
    expect(execute).toHaveBeenCalledOnce()
    const arg = execute.mock.calls[0]![0]
    expect(arg.mutations).toEqual([
      { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'Ada Lovelace' },
    ])
    expect(arg.revertMutations).toEqual([
      { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'Ada' },
    ])
    expect(arg.mutations[0]).not.toHaveProperty('expectedVersion')
    expect(arg.patches[0]?.newValue).toBe('Ada Lovelace')
  })

  it('bulkUpdate builds a bulk draft and per-cell revert', async () => {
    await useDataset().bulkUpdate(['r1', 'r2'], 'priority', 'high')
    const arg = execute.mock.calls[0]![0]
    expect(arg.mutations[0]).toEqual({
      type: 'bulk-update',
      rowIds: ['r1', 'r2'],
      columnId: 'priority',
      value: 'high',
    })
    expect(arg.revertMutations[0]?.type).toBe('update-cells')
  })

  it('bulkUpdate posts only row ids that still exist', async () => {
    await useDataset().bulkUpdate(['r1', 'missing'], 'priority', 'high')
    const arg = execute.mock.calls[0]![0]
    expect(arg.mutations[0]).toEqual({
      type: 'bulk-update',
      rowIds: ['r1'],
      columnId: 'priority',
      value: 'high',
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('bulkUpdate no-ops when no matching rows remain', async () => {
    await useDataset().bulkUpdate(['gone'], 'priority', 'high')
    expect(execute).not.toHaveBeenCalled()
  })

  it('insertRow and deleteRows emit structural drafts', async () => {
    await useDataset().insertRow()
    const insertArg = execute.mock.calls[0]![0]
    expect(insertArg.mutations[0]?.type).toBe('insert-row')
    expect(insertArg.revertMutations[0]?.type).toBe('delete-rows')

    execute.mockClear()
    await useDataset().deleteRows(['r1'])
    const deleteArg = execute.mock.calls[0]![0]
    expect(deleteArg.mutations).toEqual([{ type: 'delete-rows', rowIds: ['r1'] }])
    expect(deleteArg.revertMutations[0]?.type).toBe('insert-row')
  })

  it('deleteRows posts only row ids that still exist', async () => {
    await useDataset().deleteRows(['r1', 'missing'])
    const arg = execute.mock.calls[0]![0]
    expect(arg.mutations).toEqual([{ type: 'delete-rows', rowIds: ['r1'] }])
    expect(execute).toHaveBeenCalledOnce()
  })

  it('deleteRows no-ops when no matching rows remain', async () => {
    await useDataset().deleteRows(['gone'])
    expect(execute).not.toHaveBeenCalled()
  })

  it('keeps history when loading a replacement snapshot fails', async () => {
    const store = useDatasetStore()
    const history = useHistoryStore()
    history.record({
      id: 'h1',
      type: 'update-cell',
      summary: 'change',
      patches: [],
      inversePatches: [],
      timestamp: 1,
    })
    vi.spyOn(store, 'loadDataset').mockRejectedValueOnce(new Error('offline'))

    await expect(useDataset().load('other', 1_000)).rejects.toThrow('offline')
    expect(history.entries).toHaveLength(1)
  })

  it('keeps a committed snapshot when side effects throw', async () => {
    const store = useDatasetStore()
    const grid = useGridStore()
    vi.spyOn(store, 'loadDataset').mockResolvedValueOnce(true)
    vi.mocked(applySnapshotSideEffects).mockRejectedValueOnce(new Error('hydrate failed'))
    const generation = grid.workerGeneration
    const nonce = grid.queryNonce

    await expect(useDataset().load('customers', 1_000)).resolves.toBe(true)
    expect(grid.workerGeneration).toBeGreaterThan(generation)
    expect(grid.queryNonce).toBeGreaterThan(nonce)
    expect(useSessionStore().connectionStatus).toBe('degraded')
  })

  it('does not invalidate the worker when load side effects throw after the scope is abandoned', async () => {
    const store = useDatasetStore()
    const grid = useGridStore()
    vi.spyOn(store, 'loadDataset').mockResolvedValueOnce(true)
    vi.mocked(applySnapshotSideEffects).mockRejectedValueOnce(new Error('hydrate failed'))
    const generation = grid.workerGeneration
    const nonce = grid.queryNonce

    await expect(
      useDataset().load('customers', 1_000, { stillWanted: () => false }),
    ).resolves.toBe(true)
    expect(grid.workerGeneration).toBe(generation)
    expect(grid.queryNonce).toBe(nonce)
    expect(useSessionStore().connectionStatus).toBe('online')
  })

  it('marks online when a committed load finishes side effects', async () => {
    const store = useDatasetStore()
    const session = useSessionStore()
    session.connectionStatus = 'degraded'
    vi.spyOn(store, 'loadDataset').mockResolvedValueOnce(true)

    await expect(useDataset().load('customers', 1_000)).resolves.toBe(true)
    expect(session.connectionStatus).toBe('online')
  })
})
