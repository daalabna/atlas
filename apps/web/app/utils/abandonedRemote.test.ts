import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, VersionConflictError } from '@atlas/api-client'
import type { PendingOptimisticChange } from '~/utils/optimisticTransport'

const { applyMutation, getHistory } = vi.hoisted(() => ({
  applyMutation: vi.fn(),
  getHistory: vi.fn(),
}))

vi.mock('~/utils/atlasApi', () => ({
  atlasApi: {
    mutations: { apply: applyMutation },
    datasets: { getHistory },
  },
}))

import {
  finishAbandonedRemote,
  resetAbandonedRemote,
  waitForAbandonedRemote,
} from './abandonedRemote'

const partialInserts = (): PendingOptimisticChange => ({
  id: 'c1',
  patches: [],
  inversePatches: [],
  cancelled: true,
  remoteApplied: 1,
  mutationCount: 2,
  lastRemoteVersion: 2,
  rowIdsAtApply: ['r1', 'r2'],
  bodies: [
    { type: 'insert-row', rowId: 'r1', cells: { name: 'A' }, index: 0 },
    { type: 'insert-row', rowId: 'r2', cells: { name: 'B' }, index: 1 },
  ],
})

describe('finishAbandonedRemote', () => {
  beforeEach(() => {
    resetAbandonedRemote()
    applyMutation.mockReset()
    getHistory.mockReset()
  })

  it('treats duplicate insert as success and continues from history version', async () => {
    applyMutation.mockRejectedValueOnce(
      new ApiClientError('Row r2 already exists', 400, { code: 'VALIDATION_ERROR' }),
    )
    getHistory.mockResolvedValueOnce({ datasetId: 'customers', currentVersion: 4, entries: [] })

    await finishAbandonedRemote([partialInserts()], 'customers', 10_000)

    expect(applyMutation).toHaveBeenCalledOnce()
    expect(getHistory).toHaveBeenCalledWith('customers', 10_000)
  })

  it('retries a 409 through the same send path so duplicate insert still heals', async () => {
    const firstId = 'm-conflict'
    applyMutation
      .mockRejectedValueOnce(new VersionConflictError(3, null, { currentVersion: 3 }))
      .mockRejectedValueOnce(
        new ApiClientError('Row r2 already exists', 400, { code: 'VALIDATION_ERROR' }),
      )
    getHistory.mockResolvedValueOnce({ datasetId: 'customers', currentVersion: 5, entries: [] })

    const change = partialInserts()
    await finishAbandonedRemote([change], 'customers', 10_000)

    expect(applyMutation).toHaveBeenCalledTimes(2)
    const first = applyMutation.mock.calls[0]?.[1] as { mutationId?: string; expectedVersion: number }
    const retry = applyMutation.mock.calls[1]?.[1] as { mutationId?: string; expectedVersion: number }
    expect(first.expectedVersion).toBe(2)
    expect(retry.expectedVersion).toBe(3)
    expect(retry.mutationId).toBe(first.mutationId ?? firstId)
    expect(getHistory).toHaveBeenCalledWith('customers', 10_000)
    expect(change.lastRemoteVersion).toBe(5)
  })

  it('blocks waitForAbandonedRemote until leftover POSTs finish', async () => {
    let release!: (value: { version: number; mutationId: string; appliedAt: string }) => void
    applyMutation.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const drain = finishAbandonedRemote([partialInserts()], 'customers', 10_000)
    let waited = false
    const waiting = waitForAbandonedRemote('customers', 10_000).then(() => {
      waited = true
    })
    await Promise.resolve()
    expect(waited).toBe(false)
    release({ version: 3, mutationId: 'm', appliedAt: new Date().toISOString() })
    await drain
    await waiting
    expect(waited).toBe(true)
  })
})
