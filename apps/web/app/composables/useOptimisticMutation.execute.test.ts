import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionConflictError } from '@atlas/api-client'

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

import { applySnapshotSideEffects } from './useSnapshotSync'
import { input, resetOptimisticFixtures, snapshot } from '../../test-utils/optimisticMutation.harness'
import { useOptimisticMutation } from './useOptimisticMutation'
import { cancelOptimisticTransport } from '~/utils/optimisticTransport'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { datasetQueueKey } from '~/utils/remoteMutations'

describe('useOptimisticMutation execute', () => {
  beforeEach(() => {
    resetOptimisticFixtures({ applyMutation, getSnapshot, syncWorkerFromDataset })
    vi.mocked(applySnapshotSideEffects).mockReset()
    vi.mocked(applySnapshotSideEffects).mockResolvedValue(undefined)
  })

  it('applies locally immediately and blocks history while transport is pending', async () => {
    let resolveRemote!: (value: { version: number; mutationId: string; appliedAt: string }) => void
    applyMutation.mockReturnValue(
      new Promise((resolve) => {
        resolveRemote = resolve
      }),
    )

    await useOptimisticMutation().execute(input('A', 'B'))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('B')
    expect(useHistoryStore().pendingCount).toBe(1)
    expect(useHistoryStore().canUndo).toBe(false)

    resolveRemote({ version: 2, mutationId: 'm1', appliedAt: new Date().toISOString() })
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(useHistoryStore().canUndo).toBe(true)
  })

  it('cancels dependent pending commands and reloads after the first failure', async () => {
    let rejectFirst!: (reason: Error) => void
    applyMutation.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject
        }),
    )
    getSnapshot.mockResolvedValue(snapshot('A'))
    const optimistic = useOptimisticMutation()

    await optimistic.execute(input('A', 'B'))
    await optimistic.execute(input('B', 'C'))
    await vi.waitFor(() => expect(typeof rejectFirst).toBe('function'))
    rejectFirst(new Error('boom'))

    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(applyMutation).toHaveBeenCalledTimes(1)
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('A')
    expect(useHistoryStore().canUndo).toBe(false)
  })

  it('continues remote persistence when the optional worker cache fails', async () => {
    syncWorkerFromDataset.mockRejectedValueOnce(new Error('worker crashed'))
    applyMutation.mockResolvedValue({
      version: 2,
      mutationId: 'm-worker',
      appliedAt: new Date().toISOString(),
    })

    await useOptimisticMutation().execute(input('A', 'B'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(applyMutation).toHaveBeenCalledOnce()
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('B')
    expect(useHistoryStore().canUndo).toBe(true)
  })

  it('requests filter/sort synchronization immediately after a local patch', async () => {
    let resolveRemote!: (value: { version: number; mutationId: string; appliedAt: string }) => void
    applyMutation.mockReturnValue(new Promise((resolve) => (resolveRemote = resolve)))
    const grid = useGridStore()
    const nonceBefore = grid.queryNonce

    await useOptimisticMutation().execute(input('A', 'B'))
    expect(grid.queryNonce).toBe(nonceBefore + 1)

    resolveRemote({ version: 2, mutationId: 'm-query', appliedAt: new Date().toISOString() })
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
  })

  it('reloads on VersionConflictError during execute', async () => {
    applyMutation.mockRejectedValueOnce(
      new VersionConflictError(9, null, { code: 'VERSION_CONFLICT' }),
    )
    getSnapshot.mockResolvedValue(snapshot('SERVER', 9))

    await useOptimisticMutation().execute(input('A', 'B'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(getSnapshot).toHaveBeenCalled()
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('SERVER')
    expect(useDatasetStore().version).toBe(9)
    expect(useHistoryStore().canUndo).toBe(false)
    expect(useSessionStore().connectionStatus).toBe('online')
  })

  it('keeps degraded status when conflict reload side-effects fail', async () => {
    applyMutation.mockRejectedValueOnce(
      new VersionConflictError(9, null, { code: 'VERSION_CONFLICT' }),
    )
    getSnapshot.mockResolvedValue(snapshot('SERVER', 9))
    vi.mocked(applySnapshotSideEffects).mockRejectedValueOnce(new Error('hydrate failed'))

    await useOptimisticMutation().execute(input('A', 'B'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('SERVER')
    expect(useSessionStore().connectionStatus).toBe('degraded')
  })

  it('does not flash a conflict notice after leaving scope during reload side-effects', async () => {
    applyMutation.mockRejectedValueOnce(
      new VersionConflictError(9, null, { code: 'VERSION_CONFLICT' }),
    )
    getSnapshot.mockResolvedValue(snapshot('SERVER', 9))
    vi.mocked(applySnapshotSideEffects).mockImplementation(async () => {
      useSessionStore().activeDatasetId = 'other'
    })

    await useOptimisticMutation().execute(input('A', 'B'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(useSessionStore().notice).toBeNull()
  })

  it('does not invalidate the worker when reload side-effects throw after leaving scope', async () => {
    applyMutation.mockRejectedValueOnce(
      new VersionConflictError(9, null, { code: 'VERSION_CONFLICT' }),
    )
    getSnapshot.mockResolvedValue(snapshot('SERVER', 9))
    vi.mocked(applySnapshotSideEffects).mockImplementation(async () => {
      useSessionStore().activeDatasetId = 'other'
      throw new Error('hydrate failed')
    })
    const generation = useGridStore().workerGeneration

    await useOptimisticMutation().execute(input('A', 'B'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(useSessionStore().notice).toBeNull()
    expect(useGridStore().workerGeneration).toBe(generation)
  })

  it('reverts optimistic local state when reload fails after remote error', async () => {
    applyMutation.mockRejectedValueOnce(new Error('boom'))
    getSnapshot.mockRejectedValueOnce(new Error('offline'))

    await useOptimisticMutation().execute(input('A', 'B'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('A')
    expect(useHistoryStore().entries).toHaveLength(0)
    expect(useSessionStore().notice).toMatch(/Reload failed/)
  })

  it('skips worker patch-rows for structural edits', async () => {
    applyMutation.mockResolvedValue({
      version: 2,
      mutationId: 'm-del',
      appliedAt: new Date().toISOString(),
    })
    const grid = useGridStore()
    grid.acknowledgeWorkerHydration(grid.workerGeneration)

    await useOptimisticMutation().execute({
      type: 'delete-rows',
      summary: 'delete r1',
      patches: [
        { path: ['rowIds'], oldValue: ['r1'], newValue: [] },
        {
          path: ['rowsById', 'r1'],
          oldValue: { id: 'r1', cells: { name: 'A' } },
          newValue: undefined,
        },
      ],
      inversePatches: [
        {
          path: ['rowsById', 'r1'],
          oldValue: undefined,
          newValue: { id: 'r1', cells: { name: 'A' } },
        },
        { path: ['rowIds'], oldValue: [], newValue: ['r1'] },
      ],
      mutations: [{ type: 'delete-rows', rowIds: ['r1'] }],
      revertMutations: [{ type: 'insert-row', rowId: 'r1', cells: { name: 'A' }, index: 0 }],
    })

    expect(syncWorkerFromDataset).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
  })

  it('skips worker patch-rows while worker cache is not hydrated', async () => {
    applyMutation.mockResolvedValue({
      version: 2,
      mutationId: 'm-cell',
      appliedAt: new Date().toISOString(),
    })
    const grid = useGridStore()
    grid.invalidateWorker()
    const generationBefore = grid.workerGeneration
    expect(grid.workerHydrated).toBe(false)

    await useOptimisticMutation().execute(input('A', 'B'))
    expect(syncWorkerFromDataset).not.toHaveBeenCalled()
    // Must not thrash rehydrate by bumping generation on every cell edit.
    expect(grid.workerGeneration).toBe(generationBefore)
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
  })

  it('does not apply or send mutations while a workspace load is in flight', async () => {
    const session = useSessionStore()
    const token = session.beginWorkspaceLoad()

    await useOptimisticMutation().execute(input('A', 'B'))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('A')
    expect(applyMutation).not.toHaveBeenCalled()
    expect(useHistoryStore().pendingCount).toBe(0)
    expect(session.notice).toMatch(/finish loading/)

    session.endWorkspaceLoad(token)
  })

  it('does not apply or send mutations while restore holds the write lock', async () => {
    const session = useSessionStore()
    const lock = session.beginWriteLock()

    await useOptimisticMutation().execute(input('A', 'B'))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('A')
    expect(applyMutation).not.toHaveBeenCalled()
    expect(useHistoryStore().pendingCount).toBe(0)

    session.endWriteLock(lock)
  })

  it('skips POST when optimistic transport is cancelled during worker sync', async () => {
    let releaseWorker!: () => void
    syncWorkerFromDataset.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseWorker = resolve
      }),
    )

    await useOptimisticMutation().execute(input('A', 'B'))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('B')
    await vi.waitFor(() => expect(syncWorkerFromDataset).toHaveBeenCalled())
    cancelOptimisticTransport(datasetQueueKey('customers', 10_000))
    releaseWorker()
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(applyMutation).not.toHaveBeenCalled()
    expect(useHistoryStore().entries).toHaveLength(0)
  })

  it('continues execute while write lock is held if already queued ahead of restore', async () => {
    // Entry gate still blocks new executes; in-flight queue tasks must not abort solely on lock.
    let releaseRemote!: (value: { version: number; mutationId: string; appliedAt: string }) => void
    applyMutation.mockReturnValue(
      new Promise((resolve) => {
        releaseRemote = resolve
      }),
    )

    await useOptimisticMutation().execute(input('A', 'B'))
    const lock = useSessionStore().beginWriteLock()
    releaseRemote({ version: 2, mutationId: 'm-ahead', appliedAt: new Date().toISOString() })
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(applyMutation).toHaveBeenCalledOnce()
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('B')
    expect(useHistoryStore().canUndo).toBe(true)
    useSessionStore().endWriteLock(lock)
  })

  it('reverts optimistic cells when reload is superseded and store was not replaced', async () => {
    applyMutation.mockRejectedValueOnce(new Error('boom'))
    getSnapshot.mockResolvedValue(snapshot('A'))
    const dataset = useDatasetStore()
    vi.spyOn(dataset, 'loadDataset').mockResolvedValueOnce(false)

    const nonce = useGridStore().queryNonce
    const flash = vi.spyOn(useSessionStore(), 'flash')
    await useOptimisticMutation().execute(input('A', 'B'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(useHistoryStore().entries).toHaveLength(0)
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('A')
    expect(flash).toHaveBeenCalledOnce()
    expect(useSessionStore().notice).toMatch(/superseded/)
    expect(useGridStore().queryNonce).toBeGreaterThan(nonce)
  })

  it('keeps winning snapshot when reload is superseded after version advanced', async () => {
    applyMutation.mockRejectedValueOnce(new Error('boom'))
    const dataset = useDatasetStore()
    vi.spyOn(dataset, 'loadDataset').mockImplementationOnce(async () => {
      const next = snapshot('WINNER', 5)
      const row = next.rows[0]
      if (!row) throw new Error('fixture')
      dataset.replaceDataset(next.dataset, { r1: row })
      return false
    })

    await useOptimisticMutation().execute(input('A', 'B'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('WINNER')
    expect(useDatasetStore().version).toBe(5)
  })
})
