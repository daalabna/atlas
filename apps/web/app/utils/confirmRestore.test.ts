import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { snapshot } from '../../test-utils/optimisticMutation.harness'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import {
  pendingChanges,
  resetOptimisticMutationState,
  type PendingOptimisticChange,
} from '~/utils/optimisticTransport'
import { datasetQueueKey, resetDatasetQueues } from '~/utils/remoteMutations'

const { restore, applySnapshotSideEffects } = vi.hoisted(() => ({
  restore: vi.fn(),
  applySnapshotSideEffects: vi.fn(),
}))

vi.mock('~/utils/atlasApi', () => ({
  atlasApi: { datasets: { restore } },
}))
vi.mock('~/composables/useSnapshotSync', () => ({ applySnapshotSideEffects }))

import { applyRestoreOnQueue, restoreConfirmGate } from './confirmRestore'

const restoredSnap = snapshot('Ada', 2)

const seedDataset = (version = 3) => {
  const dataset = useDatasetStore()
  const initial = snapshot('Ada', version)
  const row = initial.rows[0]
  if (!row) throw new Error('fixture missing row')
  dataset.replaceDataset(initial.dataset, { r1: row })
  const session = useSessionStore()
  session.activeDatasetId = 'customers'
  session.datasetSize = 10_000
  session.connectionStatus = 'degraded'
  session.notice = null
}

const run = (overrides: Partial<Parameters<typeof applyRestoreOnQueue>[0]> = {}) =>
  applyRestoreOnQueue({
    targetVersion: 2,
    datasetId: 'customers',
    size: 10_000,
    scopeIsActive: () => true,
    leftScope: () => true,
    ...overrides,
  })

const strandedChange = (): PendingOptimisticChange => ({
  id: 'opt-1',
  patches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Ada', newValue: 'X' }],
  inversePatches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'X', newValue: 'Ada' }],
  cancelled: false,
  remoteApplied: 0,
  mutationCount: 1,
})

describe('applyRestoreOnQueue (HistoryPanel.confirmRestore)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetOptimisticMutationState()
    resetDatasetQueues()
    restore.mockReset()
    applySnapshotSideEffects.mockReset()
    applySnapshotSideEffects.mockResolvedValue(undefined)
    restore.mockResolvedValue(restoredSnap)
    seedDataset()
  })

  it('replaces the snapshot, hydrates via side effects, and flashes success', async () => {
    const leftScope = vi.fn()
    await expect(run({ leftScope })).resolves.toBe(true)
    expect(restore).toHaveBeenCalledWith('customers', 2, 3, 10_000)
    expect(useDatasetStore().version).toBe(2)
    expect(applySnapshotSideEffects).toHaveBeenCalledOnce()
    expect(useSessionStore().notice).toBe('Restored to version 2')
    expect(useSessionStore().connectionStatus).toBe('online')
    expect(leftScope).not.toHaveBeenCalled()
  })

  it('does not invert cancelled optimistic patches on the happy path', async () => {
    const dataset = useDatasetStore()
    dataset.applyLocalPatches([
      { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Ada', newValue: 'X' },
    ])
    pendingChanges.set(datasetQueueKey('customers', 10_000), [strandedChange()])
    const applyLocal = vi.spyOn(dataset, 'applyLocalPatches')
    await run()
    expect(applyLocal).not.toHaveBeenCalled()
    expect(pendingChanges.has(datasetQueueKey('customers', 10_000))).toBe(false)
  })

  it('leaves after a successful server restore if the scope is gone', async () => {
    const leftScope = vi.fn().mockReturnValue(true)
    let active = true
    restore.mockImplementation(async () => {
      active = false
      return restoredSnap
    })
    await expect(run({ scopeIsActive: () => active, leftScope })).resolves.toBe(true)
    expect(leftScope).toHaveBeenCalledWith(true)
    expect(applySnapshotSideEffects).not.toHaveBeenCalled()
  })

  it('leaves without a success flash if scope dies during happy-path side effects', async () => {
    const leftScope = vi.fn().mockReturnValue(true)
    let active = true
    applySnapshotSideEffects.mockImplementation(async () => {
      active = false
    })
    await expect(run({ scopeIsActive: () => active, leftScope })).resolves.toBe(true)
    expect(leftScope).toHaveBeenCalledWith(true)
    expect(useSessionStore().notice).toBeNull()
    expect(useSessionStore().connectionStatus).toBe('degraded')
  })

  it('after heal-failed + second load, calls side effects and marks degraded', async () => {
    const dataset = useDatasetStore()
    dataset.applyLocalPatches([
      { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Ada', newValue: 'X' },
    ])
    pendingChanges.set(datasetQueueKey('customers', 10_000), [strandedChange()])

    vi.spyOn(dataset, 'replaceDataset').mockImplementation(() => {
      throw new Error('apply failed')
    })
    const load = vi
      .spyOn(dataset, 'loadDataset')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true)
    const applyLocal = vi.spyOn(dataset, 'applyLocalPatches')

    await expect(run()).resolves.toBe(true)

    expect(load).toHaveBeenCalledTimes(2)
    expect(applyLocal).toHaveBeenCalledWith(strandedChange().inversePatches)
    expect(applySnapshotSideEffects).toHaveBeenCalledOnce()
    expect(useHistoryStore().canUndo).toBe(false)
    expect(useSessionStore().connectionStatus).toBe('degraded')
    expect(useSessionStore().notice).toMatch(/after a local apply failure/)
  })

  it('falls back to invalidate + requestSync if heal recovery side effects throw', async () => {
    const dataset = useDatasetStore()
    vi.spyOn(dataset, 'replaceDataset').mockImplementation(() => {
      throw new Error('apply failed')
    })
    vi.spyOn(dataset, 'loadDataset')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true)
    applySnapshotSideEffects.mockRejectedValueOnce(new Error('hydrate failed'))

    const grid = useGridStore()
    const generation = grid.workerGeneration
    const nonce = grid.queryNonce

    await expect(run()).resolves.toBe(true)
    expect(grid.workerGeneration).toBe(generation + 1)
    expect(grid.queryNonce).toBe(nonce + 1)
    expect(useSessionStore().connectionStatus).toBe('degraded')
  })

  it('leaves without a verify flash if scope dies during heal recovery side effects', async () => {
    const dataset = useDatasetStore()
    vi.spyOn(dataset, 'replaceDataset').mockImplementation(() => {
      throw new Error('apply failed')
    })
    vi.spyOn(dataset, 'loadDataset')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true)
    const leftScope = vi.fn().mockReturnValue(true)
    let active = true
    applySnapshotSideEffects.mockImplementation(async () => {
      active = false
    })

    await expect(run({ scopeIsActive: () => active, leftScope })).resolves.toBe(true)
    expect(leftScope).toHaveBeenCalledWith(true)
    expect(useSessionStore().notice).toBeNull()
    expect(useSessionStore().connectionStatus).toBe('degraded')
  })

  it('marks degraded when happy-path side effects throw', async () => {
    applySnapshotSideEffects.mockRejectedValueOnce(new Error('hydrate failed'))
    await expect(run()).resolves.toBe(true)
    expect(useDatasetStore().version).toBe(2)
    expect(useSessionStore().connectionStatus).toBe('degraded')
    expect(useSessionStore().notice).toMatch(/verify the workspace/)
    expect(useSessionStore().notice).not.toBe('Restored to version 2')
  })

  it('leaves without a verify flash if scope dies while happy-path side effects throw', async () => {
    const leftScope = vi.fn().mockReturnValue(true)
    let active = true
    applySnapshotSideEffects.mockImplementation(async () => {
      active = false
      throw new Error('hydrate failed')
    })
    const grid = useGridStore()
    const generation = grid.workerGeneration
    const nonce = grid.queryNonce

    await expect(run({ scopeIsActive: () => active, leftScope })).resolves.toBe(true)
    expect(leftScope).toHaveBeenCalledWith(true)
    expect(useSessionStore().notice).toBeNull()
    expect(useSessionStore().connectionStatus).toBe('degraded')
    expect(grid.workerGeneration).toBe(generation)
    expect(grid.queryNonce).toBe(nonce)
  })

  it('throws when heal fails and the second load does not commit', async () => {
    const dataset = useDatasetStore()
    vi.spyOn(dataset, 'replaceDataset').mockImplementation(() => {
      throw new Error('apply failed')
    })
    vi.spyOn(dataset, 'loadDataset')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(false)

    const onServerCommitted = vi.fn()
    await expect(run({ onServerCommitted })).rejects.toThrow(/reload required/)
    expect(onServerCommitted).toHaveBeenCalledOnce()
    expect(useSessionStore().connectionStatus).toBe('degraded')
    expect(applySnapshotSideEffects).not.toHaveBeenCalled()
  })
})

describe('restoreConfirmGate', () => {
  const pending = { targetVersion: 2, datasetId: 'customers', size: 10_000 }
  const ready = {
    pending,
    restoring: false,
    transportBusy: false,
    snapshotMatches: true,
    sessionId: 'customers',
    sessionSize: 10_000,
  }

  it('skips while busy, restoring, or unmatched', () => {
    expect(restoreConfirmGate({ ...ready, pending: null })).toBe('skip')
    expect(restoreConfirmGate({ ...ready, restoring: true })).toBe('skip')
    expect(restoreConfirmGate({ ...ready, transportBusy: true })).toBe('skip')
    expect(restoreConfirmGate({ ...ready, snapshotMatches: false })).toBe('skip')
  })

  it('clears pending when the session left the restore target', () => {
    expect(restoreConfirmGate({ ...ready, sessionId: 'orders' })).toBe('clear')
    expect(restoreConfirmGate({ ...ready, sessionSize: 50_000 })).toBe('clear')
  })

  it('runs when the pending restore still matches the session', () => {
    expect(restoreConfirmGate(ready)).toBe('run')
  })
})
