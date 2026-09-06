import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => ({
  resetListener: undefined as (() => void) | undefined,
  boot: vi.fn(),
  release: vi.fn(),
  ensureReady: vi.fn(() => true),
  isReady: vi.fn(() => true),
  init: vi.fn(),
  patchRows: vi.fn(),
  filterSort: vi.fn(),
  aggregate: vi.fn(),
  onReset: vi.fn((listener: () => void) => {
    workerMock.resetListener = listener
    return vi.fn()
  }),
}))

vi.mock('./useDataWorker', () => ({
  useDataWorker: () => workerMock,
  syncWorkerFromDataset: async (input: {
    rowIds: string[]
    rowsById: Record<string, { id: string; cells: Record<string, unknown> }>
    touchedIds?: string[]
    removedIds?: string[]
  }) => {
    const rows = (input.touchedIds ?? [])
      .map((id) => input.rowsById[id])
      .filter((row): row is { id: string; cells: Record<string, unknown> } => Boolean(row))
    await workerMock.patchRows({
      rows,
      removeIds: input.removedIds,
    })
  },
}))

import { useGrid } from './useGrid'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { resetSharedWorkerHydrate } from '~/utils/workerHydrate'

const mountGridHarness = (pinia: ReturnType<typeof createPinia>) => {
  let gridApi!: ReturnType<typeof useGrid>
  const wrapper = mount(
    defineComponent({
      setup() {
        gridApi = useGrid()
        return () => h('div')
      },
    }),
    { global: { plugins: [pinia] } },
  )
  return { gridApi, wrapper }
}

describe('useGrid worker recovery', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    resetSharedWorkerHydrate()
    workerMock.resetListener = undefined
    vi.clearAllMocks()
    workerMock.ensureReady.mockReturnValue(true)
    workerMock.isReady.mockReturnValue(true)
    workerMock.patchRows.mockResolvedValue(null)
    workerMock.aggregate.mockResolvedValue(null)
    workerMock.filterSort.mockResolvedValue({
      kind: 'filter-sort',
      requestId: 'filter-1',
      rowIds: ['r1'],
      duration: 1,
    })

    useDatasetStore().replaceDataset(
      {
        id: 'recovery',
        name: 'Recovery',
        version: 1,
        columns: [{ id: 'name', name: 'Name', type: 'text', width: 120 }],
        rowIds: ['r1', 'r2'],
        createdAt: 't',
        updatedAt: 't',
      },
      {
        r1: { id: 'r1', cells: { name: 'Ada' } },
        r2: { id: 'r2', cells: { name: 'Bob' } },
      },
    )
    const grid = useGridStore()
    grid.setFilters([{ id: 'f1', columnId: 'name', operator: 'contains', value: 'Ada' }])
    grid.acknowledgeWorkerHydration()
  })

  it('does not invalidate a hydrated worker on idle init', async () => {
    const { gridApi, wrapper } = mountGridHarness(pinia)
    const grid = useGridStore()
    const generation = grid.workerGeneration
    expect(grid.workerHydrated).toBe(true)
    await gridApi.initWorker()
    expect(grid.workerGeneration).toBe(generation)
    expect(workerMock.init).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('invalidates, rehydrates, and only then runs the query after a physical reset', async () => {
    let finishInit!: () => void
    workerMock.init.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishInit = () => resolve({ kind: 'init', rowIds: ['r1', 'r2'], duration: 0 })
        }),
    )

    const { gridApi, wrapper } = mountGridHarness(pinia)
    const grid = useGridStore()
    const generationBeforeReset = grid.workerGeneration

    workerMock.resetListener?.()

    expect(grid.workerGeneration).toBe(generationBeforeReset + 1)
    expect(grid.workerHydrated).toBe(false)

    const recovery = gridApi.syncQuery()
    await vi.waitFor(() => expect(workerMock.init).toHaveBeenCalledOnce())
    expect(workerMock.filterSort).not.toHaveBeenCalled()

    finishInit()
    await recovery

    expect(grid.workerHydrated).toBe(true)
    expect(workerMock.filterSort).toHaveBeenCalledOnce()
    expect(grid.visibleRowIds).toEqual(['r1'])
    wrapper.unmount()
  })

  it('replays cell edits skipped during hydrate before the first worker query', async () => {
    let finishInit!: () => void
    workerMock.init.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishInit = () => resolve({ kind: 'init', rowIds: ['r1', 'r2'], duration: 0 })
        }),
    )

    const { gridApi, wrapper } = mountGridHarness(pinia)
    workerMock.resetListener?.()

    useDatasetStore().applyLocalPatches([
      { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Ada', newValue: 'Zoe' },
    ])
    const { syncWorker } = await import('./optimisticWorkerSync')
    await syncWorker([
      { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Ada', newValue: 'Zoe' },
    ])

    const recovery = gridApi.syncQuery()
    await vi.waitFor(() => expect(workerMock.init).toHaveBeenCalledOnce())
    expect(workerMock.patchRows).not.toHaveBeenCalled()
    expect(workerMock.filterSort).not.toHaveBeenCalled()

    finishInit()
    await recovery

    expect(workerMock.patchRows).toHaveBeenCalledWith({
      rows: [{ id: 'r1', cells: { name: 'Zoe' } }],
      removeIds: undefined,
    })
    expect(workerMock.filterSort).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('retries hydrate in the same ensureWorkerData when the first pass returns false', async () => {
    let finishInit!: () => void
    let initCalls = 0
    workerMock.init.mockImplementation(() => {
      initCalls += 1
      if (initCalls === 1) {
        return new Promise((resolve) => {
          finishInit = () => resolve({ kind: 'init', rowIds: ['r1', 'r2'], duration: 0 })
        })
      }
      return Promise.resolve({ kind: 'init', rowIds: ['r1', 'r2'], duration: 0 })
    })

    const { gridApi, wrapper } = mountGridHarness(pinia)
    const grid = useGridStore()
    workerMock.resetListener?.()
    const generation = grid.workerGeneration

    const recovery = gridApi.syncQuery()
    await vi.waitFor(() => expect(workerMock.init).toHaveBeenCalledOnce())

    const dataset = useDatasetStore()
    const current = dataset.dataset
    if (!current) throw new Error('fixture')
    dataset.replaceDataset({ ...current, rowIds: [...current.rowIds] }, { ...dataset.rowsById })

    finishInit()
    await recovery

    expect(grid.workerGeneration).toBe(generation)
    expect(workerMock.init).toHaveBeenCalledTimes(2)
    expect(grid.workerHydrated).toBe(true)
    expect(workerMock.filterSort).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('retries skipped touches after flush fails without clearing them via generation', async () => {
    let finishInit!: () => void
    let initCalls = 0
    workerMock.init.mockImplementation(() => {
      initCalls += 1
      if (initCalls === 1) {
        return new Promise((resolve) => {
          finishInit = () => resolve({ kind: 'init', rowIds: ['r1', 'r2'], duration: 0 })
        })
      }
      return Promise.resolve({ kind: 'init', rowIds: ['r1', 'r2'], duration: 0 })
    })
    workerMock.patchRows.mockRejectedValueOnce(new Error('flush failed'))

    const { gridApi, wrapper } = mountGridHarness(pinia)
    const grid = useGridStore()
    workerMock.resetListener?.()
    const generation = grid.workerGeneration

    useDatasetStore().applyLocalPatches([
      { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Ada', newValue: 'Zoe' },
    ])
    const { syncWorker } = await import('./optimisticWorkerSync')
    await syncWorker([
      { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'Ada', newValue: 'Zoe' },
    ])

    const recovery = gridApi.syncQuery()
    await vi.waitFor(() => expect(workerMock.init).toHaveBeenCalledOnce())
    finishInit()
    await recovery

    expect(grid.workerGeneration).toBe(generation)
    expect(workerMock.patchRows).toHaveBeenCalledTimes(2)
    expect(workerMock.patchRows).toHaveBeenLastCalledWith({
      rows: [{ id: 'r1', cells: { name: 'Zoe' } }],
      removeIds: undefined,
    })
    expect(grid.workerHydrated).toBe(true)
    expect(workerMock.filterSort).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
