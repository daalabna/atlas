import { beforeEach, describe, expect, it, vi } from 'vitest'

const { applyMutation, getSnapshot, syncWorkerFromDataset } = vi.hoisted(() => ({
  applyMutation: vi.fn(),
  getSnapshot: vi.fn(),
  syncWorkerFromDataset: vi.fn(),
}))

vi.mock('~/utils/atlasApi', () => ({
  atlasApi: {
    mutations: { apply: applyMutation },
    datasets: { getSnapshot },
  },
}))
vi.mock('./useDataWorker', () => ({ syncWorkerFromDataset }))
vi.mock('./useSnapshotSync', () => ({ applySnapshotSideEffects: vi.fn() }))

import { resetOptimisticFixtures, snapshot } from '../../test-utils/optimisticMutation.harness'
import { useOptimisticMutation } from './useOptimisticMutation'
import { useDatasetStore } from '~/stores/dataset'
import { useSessionStore } from '~/stores/session'

describe('useOptimisticMutation syncRemote', () => {
  beforeEach(() => {
    resetOptimisticFixtures({ applyMutation, getSnapshot, syncWorkerFromDataset })
  })

  it('rejects syncRemote while write lock is held and repairs via onRemoteFailure', async () => {
    const session = useSessionStore()
    const lock = session.beginWriteLock()
    const onRemoteFailure = vi.fn()
    await expect(
      useOptimisticMutation().syncRemote({
        patches: [],
        rollbackPatches: [],
        bodies: [{ type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'X' }],
        onRemoteFailure,
      }),
    ).rejects.toMatchObject({ name: 'RemoteAbortError' })
    expect(onRemoteFailure).toHaveBeenCalledOnce()
    expect(applyMutation).not.toHaveBeenCalled()
    session.endWriteLock(lock)
  })

  it('calls onRemoteFailure exactly once when aborting after local apply', async () => {
    let releaseWorker!: () => void
    syncWorkerFromDataset.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseWorker = resolve
      }),
    )
    const onRemoteFailure = vi.fn()
    const pending = useOptimisticMutation().syncRemote({
      patches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'A', newValue: 'Z' }],
      rollbackPatches: [
        { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Z', newValue: 'A' },
      ],
      bodies: [{ type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'Z' }],
      onRemoteFailure,
    })
    await vi.waitFor(() => expect(syncWorkerFromDataset).toHaveBeenCalled())
    useSessionStore().activeDatasetId = 'other'
    releaseWorker()
    await expect(pending).rejects.toMatchObject({ name: 'RemoteAbortError' })
    expect(onRemoteFailure).toHaveBeenCalledOnce()
    expect(applyMutation).not.toHaveBeenCalled()
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('A')
  })

  it('does not roll back left-scope patches after a newer snapshot replaced Pinia', async () => {
    let releaseWorker!: () => void
    syncWorkerFromDataset.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseWorker = resolve
      }),
    )
    const onRemoteFailure = vi.fn()
    const pending = useOptimisticMutation().syncRemote({
      patches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'A', newValue: 'Z' }],
      rollbackPatches: [
        { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Z', newValue: 'A' },
      ],
      bodies: [{ type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'Z' }],
      onRemoteFailure,
    })
    await vi.waitFor(() => expect(syncWorkerFromDataset).toHaveBeenCalled())
    useSessionStore().activeDatasetId = 'orders'
    const next = snapshot('WINNER', 5)
    const row = next.rows[0]
    if (!row) throw new Error('fixture')
    useDatasetStore().replaceDataset(next.dataset, { r1: row })
    releaseWorker()
    await expect(pending).rejects.toMatchObject({ name: 'RemoteAbortError' })
    expect(onRemoteFailure).toHaveBeenCalledOnce()
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('WINNER')
  })

  it('syncRemote allowWhileLocked proceeds under write lock', async () => {
    applyMutation.mockResolvedValue({
      version: 2,
      mutationId: 'm-undo',
      appliedAt: new Date().toISOString(),
    })
    const lock = useSessionStore().beginWriteLock()
    const onRemoteFailure = vi.fn()
    await useOptimisticMutation().syncRemote(
      {
        patches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'A', newValue: 'Z' }],
        rollbackPatches: [
          { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Z', newValue: 'A' },
        ],
        bodies: [{ type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'Z' }],
        onRemoteFailure,
      },
      { allowWhileLocked: true },
    )
    expect(onRemoteFailure).not.toHaveBeenCalled()
    expect(applyMutation).toHaveBeenCalledOnce()
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('Z')
    useSessionStore().endWriteLock(lock)
  })

  it('keeps already-synced syncRemote patches when a partial chain reload fails', async () => {
    applyMutation
      .mockResolvedValueOnce({
        version: 2,
        mutationId: 'm1',
        appliedAt: new Date().toISOString(),
      })
      .mockRejectedValueOnce(new Error('second failed'))
    getSnapshot.mockRejectedValueOnce(new Error('offline'))
    const onRemoteFailure = vi.fn()

    await expect(
      useOptimisticMutation().syncRemote({
        patches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'A', newValue: 'Z' }],
        rollbackPatches: [
          { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Z', newValue: 'A' },
        ],
        bodies: [
          { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'Z' },
          { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'Z2' },
        ],
        onRemoteFailure,
      }),
    ).rejects.toMatchObject({ name: 'PartialRemoteSyncError' })

    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('Z')
    expect(onRemoteFailure).not.toHaveBeenCalled()
    expect(useSessionStore().notice).toMatch(/already-synced changes were kept/)
  })

  it('drops unsent insert-row bodies when a partial undo reload fails', async () => {
    const store = useDatasetStore()
    const initial = snapshot('A')
    store.replaceDataset(initial.dataset, { r1: { id: 'r1', cells: { name: 'A' } } })
    applyMutation
      .mockResolvedValueOnce({
        version: 2,
        mutationId: 'm1',
        appliedAt: new Date().toISOString(),
      })
      .mockRejectedValueOnce(new Error('second failed'))
    getSnapshot.mockRejectedValueOnce(new Error('offline'))
    const onRemoteFailure = vi.fn()

    await expect(
      useOptimisticMutation().syncRemote({
        patches: [
          { path: ['rowIds'], oldValue: ['r1'], newValue: ['r1', 'r2', 'r3'] },
          {
            path: ['rowsById', 'r2'],
            oldValue: undefined,
            newValue: { id: 'r2', cells: { name: 'B' } },
          },
          {
            path: ['rowsById', 'r3'],
            oldValue: undefined,
            newValue: { id: 'r3', cells: { name: 'C' } },
          },
        ],
        rollbackPatches: [
          {
            path: ['rowsById', 'r3'],
            oldValue: { id: 'r3', cells: { name: 'C' } },
            newValue: undefined,
          },
          {
            path: ['rowsById', 'r2'],
            oldValue: { id: 'r2', cells: { name: 'B' } },
            newValue: undefined,
          },
          { path: ['rowIds'], oldValue: ['r1', 'r2', 'r3'], newValue: ['r1'] },
        ],
        bodies: [
          { type: 'insert-row', rowId: 'r2', cells: { name: 'B' }, index: 0 },
          { type: 'insert-row', rowId: 'r3', cells: { name: 'C' }, index: 0 },
        ],
        onRemoteFailure,
      }),
    ).rejects.toMatchObject({ name: 'PartialRemoteSyncError' })

    expect(store.rowIds).toEqual(['r1', 'r2'])
    expect(store.rowsById.r3).toBeUndefined()
    expect(onRemoteFailure).not.toHaveBeenCalled()
    expect(useSessionStore().notice).toMatch(/unsynced local rows were dropped/)
  })
})
