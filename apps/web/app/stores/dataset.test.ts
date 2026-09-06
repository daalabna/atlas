import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { getSnapshot } = vi.hoisted(() => ({ getSnapshot: vi.fn() }))

vi.mock('~/utils/atlasApi', () => ({
  atlasApi: { datasets: { getSnapshot } },
}))

import { useDatasetStore } from './dataset'

const snapshot = (id: string, name: string) => ({
  dataset: {
    id,
    name,
    version: 1,
    columns: [],
    rowIds: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  rows: [],
})

describe('dataset loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getSnapshot.mockReset()
  })

  it('ignores an older response that arrives after a newer request', async () => {
    let resolveOld!: (value: ReturnType<typeof snapshot>) => void
    getSnapshot
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValueOnce(snapshot('customers', 'New 100k'))

    const store = useDatasetStore()
    const oldLoad = store.loadDataset('customers', 1_000)
    await expect(store.loadDataset('customers', 100_000)).resolves.toBe(true)
    resolveOld(snapshot('customers', 'Old 1k'))

    await expect(oldLoad).resolves.toBe(false)
    expect(store.dataset?.name).toBe('New 100k')
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('does not commit when stillWanted returns false', async () => {
    getSnapshot.mockResolvedValueOnce(snapshot('customers', 'Stale'))
    const store = useDatasetStore()
    await expect(
      store.loadDataset('customers', 1_000, { stillWanted: () => false }),
    ).resolves.toBe(false)
    expect(store.dataset).toBeNull()
  })

  it('invalidateInFlightLoads prevents a late commit', async () => {
    let resolveSnap!: (value: ReturnType<typeof snapshot>) => void
    getSnapshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSnap = resolve
        }),
    )
    const store = useDatasetStore()
    const pending = store.loadDataset('customers', 1_000)
    store.invalidateInFlightLoads()
    resolveSnap(snapshot('customers', 'Late'))
    await expect(pending).resolves.toBe(false)
    expect(store.dataset).toBeNull()
  })

  it('preserves an existing snapshot when a scope switch fails', async () => {
    const store = useDatasetStore()
    store.replaceDataset(snapshot('customers', 'Current').dataset, {})
    getSnapshot.mockRejectedValueOnce(new Error('offline'))

    await expect(
      store.loadDataset('customers', 1_000, { preserveExistingOnError: true }),
    ).rejects.toThrow('offline')

    expect(store.dataset?.name).toBe('Current')
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })
})
