import { beforeEach, describe, expect, it, vi } from 'vitest'
import { input, resetOptimisticFixtures, snapshot } from '../../test-utils/optimisticMutation.harness'
import { useOptimisticMutation } from './useOptimisticMutation'
import { useDatasetStore } from '~/stores/dataset'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'

const { applyMutation, getSnapshot, getHistory, listViews, syncWorkerFromDataset } = vi.hoisted(
  () => ({
    applyMutation: vi.fn(),
    getSnapshot: vi.fn(),
    getHistory: vi.fn(),
    listViews: vi.fn(),
    syncWorkerFromDataset: vi.fn(),
  }),
)

const route = { params: { id: 'customers' } }
const navigateTo = vi.fn()

vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('navigateTo', navigateTo)

vi.mock('~/utils/atlasApi', () => ({
  atlasApi: {
    mutations: { apply: applyMutation },
    datasets: { getSnapshot, getHistory },
    views: { list: listViews },
  },
}))
vi.mock('./useDataWorker', () => ({ syncWorkerFromDataset }))
vi.mock('./useSnapshotSync', () => ({ applySnapshotSideEffects: vi.fn() }))

import { applySnapshotSideEffects } from './useSnapshotSync'
import { useWorkspaceLoad } from './useWorkspaceLoad'

const otherSnapshot = (id: string, name: string, version = 1) => ({
  dataset: {
    ...snapshot(name, version).dataset,
    id,
    name: id,
  },
  rows: snapshot(name, version).rows,
})

describe('useWorkspaceLoad', () => {
  beforeEach(() => {
    resetOptimisticFixtures({ applyMutation, getSnapshot, syncWorkerFromDataset })
    getHistory.mockReset()
    listViews.mockReset()
    navigateTo.mockReset()
    getHistory.mockResolvedValue({ entries: [] })
    listViews.mockResolvedValue([])
    vi.mocked(applySnapshotSideEffects).mockReset()
    vi.mocked(applySnapshotSideEffects).mockResolvedValue(undefined)
    route.params.id = 'customers'
    useSessionStore().activeDatasetId = 'customers'
    useSessionStore().datasetSize = 10_000
  })

  it('does not invert a committed execute when a switch then fails', async () => {
    let resolveRemote!: (value: { version: number; mutationId: string; appliedAt: string }) => void
    applyMutation.mockReturnValue(
      new Promise((resolve) => {
        resolveRemote = resolve
      }),
    )
    await useOptimisticMutation().execute(input('A', 'B'))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('B')
    await vi.waitFor(() => expect(applyMutation).toHaveBeenCalled())

    route.params.id = 'orders'
    getSnapshot.mockRejectedValue(new Error('offline'))
    const loading = useWorkspaceLoad().load()
    resolveRemote({ version: 2, mutationId: 'm-ahead', appliedAt: new Date().toISOString() })
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    await loading

    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('B')
    expect(useDatasetStore().version).toBe(2)
    expect(useSessionStore().activeDatasetId).toBe('customers')
    expect(navigateTo).toHaveBeenCalledWith('/datasets/customers', { replace: true })
  })

  it('reloads the previous dataset after a partial remote chain on a failed switch', async () => {
    let rejectSecond!: (reason: Error) => void
    applyMutation
      .mockResolvedValueOnce({
        version: 2,
        mutationId: 'm1',
        appliedAt: new Date().toISOString(),
      })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSecond = reject
          }),
      )

    await useOptimisticMutation().execute({
      ...input('A', 'B'),
      mutations: [
        { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'B' },
        { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'C' },
      ],
    })
    await vi.waitFor(() => expect(applyMutation).toHaveBeenCalledTimes(2))

    route.params.id = 'orders'
    getSnapshot.mockImplementation((id: string) => {
      if (id === 'orders') return Promise.reject(new Error('offline'))
      return Promise.resolve(snapshot('B', 2))
    })
    const loading = useWorkspaceLoad().load()
    rejectSecond(new Error('aborted'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    await loading

    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('B')
    expect(useDatasetStore().version).toBe(2)
    expect(useSessionStore().activeDatasetId).toBe('customers')
  })

  it('inverts an uncommitted execute when a switch fails', async () => {
    let releaseWorker!: () => void
    syncWorkerFromDataset.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseWorker = resolve
      }),
    )
    await useOptimisticMutation().execute(input('A', 'B'))
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('B')

    route.params.id = 'orders'
    getSnapshot.mockRejectedValue(new Error('offline'))
    const loading = useWorkspaceLoad().load()
    releaseWorker()
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    await loading

    expect(applyMutation).not.toHaveBeenCalled()
    expect(useDatasetStore().rowsById.r1?.cells.name).toBe('A')
    expect(useSessionStore().activeDatasetId).toBe('customers')
  })

  it('keeps the newer session when a stale switch would abort', async () => {
    let resolveOrders!: (value: ReturnType<typeof otherSnapshot>) => void
    getSnapshot.mockImplementation((id: string) => {
      if (id === 'orders') {
        return new Promise((resolve) => {
          resolveOrders = resolve
        })
      }
      return Promise.resolve(otherSnapshot('invoices', 'INV', 1))
    })

    const workspace = useWorkspaceLoad()
    route.params.id = 'orders'
    const first = workspace.load()
    await vi.waitFor(() => expect(typeof resolveOrders).toBe('function'))
    route.params.id = 'invoices'
    const second = workspace.load()
    resolveOrders(otherSnapshot('orders', 'ORD', 1))
    await first
    await second

    expect(useSessionStore().activeDatasetId).toBe('invoices')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('finishes leftover POSTs on the previous dataset after a successful switch', async () => {
    let rejectSecond!: (reason: Error) => void
    applyMutation
      .mockResolvedValueOnce({
        version: 2,
        mutationId: 'm1',
        appliedAt: new Date().toISOString(),
      })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSecond = reject
          }),
      )
      .mockResolvedValue({
        version: 3,
        mutationId: 'm-abandoned',
        appliedAt: new Date().toISOString(),
      })

    await useOptimisticMutation().execute({
      ...input('A', 'B'),
      mutations: [
        { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'B' },
        { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'C' },
      ],
    })
    await vi.waitFor(() => expect(applyMutation).toHaveBeenCalledTimes(2))

    route.params.id = 'orders'
    getSnapshot.mockResolvedValue(otherSnapshot('orders', 'ORD', 1))
    const loading = useWorkspaceLoad().load()
    rejectSecond(new Error('aborted'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    await loading

    expect(useSessionStore().activeDatasetId).toBe('orders')
    expect(useDatasetStore().dataset?.id).toBe('orders')
    await vi.waitFor(() => expect(applyMutation).toHaveBeenCalledTimes(3))
    expect(applyMutation.mock.calls[2]?.[0]).toBe('customers')
  })

  it('waits for leftover POSTs before reloading the abandoned dataset', async () => {
    let rejectSecond!: (reason: Error) => void
    let releaseDrain!: (value: { version: number; mutationId: string; appliedAt: string }) => void
    applyMutation
      .mockResolvedValueOnce({
        version: 2,
        mutationId: 'm1',
        appliedAt: new Date().toISOString(),
      })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSecond = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseDrain = resolve
          }),
      )

    await useOptimisticMutation().execute({
      ...input('A', 'B'),
      mutations: [
        { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'B' },
        { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'C' },
      ],
    })
    await vi.waitFor(() => expect(applyMutation).toHaveBeenCalledTimes(2))

    route.params.id = 'orders'
    getSnapshot.mockImplementation((id: string) => {
      if (id === 'orders') return Promise.resolve(otherSnapshot('orders', 'ORD', 1))
      return Promise.resolve(snapshot('C', 3))
    })
    const toOrders = useWorkspaceLoad().load()
    rejectSecond(new Error('aborted'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    await toOrders
    await vi.waitFor(() => expect(applyMutation).toHaveBeenCalledTimes(3))

    route.params.id = 'customers'
    const back = useWorkspaceLoad().load()
    await Promise.resolve()
    expect(getSnapshot.mock.calls.some((call) => call[0] === 'customers')).toBe(false)
    releaseDrain({
      version: 3,
      mutationId: 'm-drain',
      appliedAt: new Date().toISOString(),
    })
    await back
    expect(useDatasetStore().dataset?.id).toBe('customers')
    expect(getSnapshot.mock.calls.some((call) => call[0] === 'customers')).toBe(true)
  })

  it('starts leftover POSTs before views so a quick switch-back waits', async () => {
    let rejectSecond!: (reason: Error) => void
    let releaseDrain!: (value: { version: number; mutationId: string; appliedAt: string }) => void
    let releaseViews!: (value: unknown[]) => void
    applyMutation
      .mockResolvedValueOnce({
        version: 2,
        mutationId: 'm1',
        appliedAt: new Date().toISOString(),
      })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSecond = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseDrain = resolve
          }),
      )
    listViews.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseViews = resolve
        }),
    )

    await useOptimisticMutation().execute({
      ...input('A', 'B'),
      mutations: [
        { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'B' },
        { type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'C' },
      ],
    })
    await vi.waitFor(() => expect(applyMutation).toHaveBeenCalledTimes(2))

    route.params.id = 'orders'
    getSnapshot.mockImplementation((id: string) => {
      if (id === 'orders') return Promise.resolve(otherSnapshot('orders', 'ORD', 1))
      return Promise.resolve(snapshot('C', 3))
    })
    const workspace = useWorkspaceLoad()
    const toOrders = workspace.load()
    rejectSecond(new Error('aborted'))
    await vi.waitFor(() => expect(useHistoryStore().pendingCount).toBe(0))
    await vi.waitFor(() => expect(applyMutation).toHaveBeenCalledTimes(3))
    expect(useDatasetStore().dataset?.id).toBe('orders')

    route.params.id = 'customers'
    const back = workspace.load()
    await Promise.resolve()
    expect(getSnapshot.mock.calls.some((call) => call[0] === 'customers')).toBe(false)
    releaseDrain({
      version: 3,
      mutationId: 'm-drain',
      appliedAt: new Date().toISOString(),
    })
    listViews.mockResolvedValue([])
    releaseViews([])
    await back
    await toOrders
    expect(useDatasetStore().dataset?.id).toBe('customers')
    expect(getSnapshot.mock.calls.some((call) => call[0] === 'customers')).toBe(true)
  })

  it('stays on the new dataset when views fail after a committed load', async () => {
    route.params.id = 'orders'
    getSnapshot.mockResolvedValue(otherSnapshot('orders', 'ORD', 1))
    listViews.mockRejectedValue(new Error('views down'))

    await useWorkspaceLoad().load()

    expect(useSessionStore().activeDatasetId).toBe('orders')
    expect(useDatasetStore().dataset?.id).toBe('orders')
    expect(useSessionStore().notice).toMatch(/views/i)
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('keeps session and Pinia on the new dataset when hydrate throws after a committed switch', async () => {
    route.params.id = 'orders'
    getSnapshot.mockResolvedValue(otherSnapshot('orders', 'ORD', 1))
    vi.mocked(applySnapshotSideEffects).mockRejectedValueOnce(new Error('hydrate failed'))

    await useWorkspaceLoad().load()

    expect(useSessionStore().activeDatasetId).toBe('orders')
    expect(useDatasetStore().dataset?.id).toBe('orders')
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
