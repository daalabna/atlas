import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chunkedWorkerHydrate,
  joinChunkedWorkerHydrate,
  resetSharedWorkerHydrate,
  WORKER_CHUNK,
} from './workerHydrate'

describe('chunkedWorkerHydrate', () => {
  beforeEach(() => {
    resetSharedWorkerHydrate()
  })

  it('initializes empty row sets', async () => {
    const init = vi.fn().mockResolvedValue(undefined)
    await expect(
      chunkedWorkerHydrate({
        rowIds: [],
        getRow: () => undefined,
        init,
        patchRows: vi.fn(),
      }),
    ).resolves.toBe(true)
    expect(init).toHaveBeenCalledWith([], [])
  })

  it('chunks large datasets and respects abort', async () => {
    const rowIds = Array.from({ length: WORKER_CHUNK + 3 }, (_, i) => `r-${i}`)
    const init = vi.fn().mockResolvedValue(undefined)
    const patchRows = vi.fn().mockResolvedValue(undefined)
    const ok = await chunkedWorkerHydrate({
      rowIds,
      getRow: (id) => ({ id, cells: { name: id } }),
      init,
      patchRows,
      shouldAbort: () => false,
    })

    expect(ok).toBe(true)
    expect(init).toHaveBeenCalledTimes(1)
    expect(patchRows).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0]![0]).toHaveLength(rowIds.length)
    expect(init.mock.calls[0]![1]).toHaveLength(WORKER_CHUNK)
    expect(patchRows.mock.calls[0]![0]).toHaveLength(3)
  })

  it('stops before the next chunk when aborted', async () => {
    const rowIds = Array.from({ length: WORKER_CHUNK + 1 }, (_, i) => `r-${i}`)
    let aborted = false
    const init = vi.fn().mockImplementation(async () => {
      aborted = true
    })
    const patchRows = vi.fn().mockResolvedValue(undefined)

    await expect(
      chunkedWorkerHydrate({
        rowIds,
        getRow: (id) => ({ id, cells: {} }),
        init,
        patchRows,
        shouldAbort: () => aborted,
      }),
    ).resolves.toBe(false)
    expect(patchRows).not.toHaveBeenCalled()
  })

  it('stops when live row count changes mid-hydrate', async () => {
    const rowIds = Array.from({ length: WORKER_CHUNK + 1 }, (_, i) => `r-${i}`)
    let live = rowIds.length
    const init = vi.fn().mockResolvedValue(undefined)
    const patchRows = vi.fn().mockResolvedValue(undefined)

    const ok = await chunkedWorkerHydrate({
      rowIds,
      getRow: (id) => ({ id, cells: {} }),
      init,
      patchRows,
      expectedRowCount: rowIds.length,
      getLiveRowCount: () => live,
      onRowCountChange: (expected, actual) => {
        if (actual !== expected) return false
        live = expected + 1
        return true
      },
    })

    expect(ok).toBe(false)
    expect(init).toHaveBeenCalledTimes(1)
    expect(patchRows).not.toHaveBeenCalled()
  })

  it('stops when rowIds identity changes even if length stays the same', async () => {
    const rowIdsAtStart = Array.from({ length: WORKER_CHUNK + 1 }, (_, i) => `r-${i}`)
    let liveIds = rowIdsAtStart
    const init = vi.fn().mockResolvedValue(undefined)
    const patchRows = vi.fn().mockResolvedValue(undefined)

    const ok = await chunkedWorkerHydrate({
      rowIds: [...rowIdsAtStart],
      rowIdsAtStart,
      getRow: (id) => ({ id, cells: {} }),
      init,
      patchRows,
      expectedRowCount: rowIdsAtStart.length,
      getLiveRowIds: () => liveIds,
      getLiveRowCount: () => liveIds.length,
      onRowCountChange: () => {
        liveIds = rowIdsAtStart.map((_, i) => `x-${i}`)
        return true
      },
    })

    expect(ok).toBe(false)
    expect(init).toHaveBeenCalledTimes(1)
    expect(patchRows).not.toHaveBeenCalled()
  })

  it('notifies onRowCountChange when count already differs', async () => {
    const onRowCountChange = vi.fn(() => false)
    const ok = await chunkedWorkerHydrate({
      rowIds: ['r1'],
      getRow: (id) => ({ id, cells: {} }),
      init: vi.fn().mockResolvedValue(undefined),
      patchRows: vi.fn(),
      expectedRowCount: 1,
      getLiveRowCount: () => 2,
      onRowCountChange,
    })
    expect(ok).toBe(false)
    expect(onRowCountChange).toHaveBeenCalledWith(1, 2)
  })

  it('does not start the next chunk after an in-flight patch aborts', async () => {
    const rowIds = Array.from({ length: WORKER_CHUNK * 2 + 1 }, (_, i) => `r-${i}`)
    let abort = false
    const patchRows = vi.fn().mockImplementation(async () => {
      abort = true
    })
    const ok = await chunkedWorkerHydrate({
      rowIds,
      getRow: (id) => ({ id, cells: {} }),
      init: vi.fn().mockResolvedValue(undefined),
      patchRows,
      shouldAbort: () => abort,
    })
    expect(ok).toBe(false)
    expect(patchRows).toHaveBeenCalledTimes(1)
  })

  it('joins concurrent hydrates for the same generation', async () => {
    const rowIds = ['r1']
    let finishInit!: () => void
    const init = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishInit = () => resolve()
        }),
    )
    const input = {
      rowIds,
      getRow: (id: string) => ({ id, cells: {} }),
      init,
      patchRows: vi.fn(),
      shouldAbort: () => false,
    }
    const first = joinChunkedWorkerHydrate(4, input)
    const second = joinChunkedWorkerHydrate(4, { ...input, init: vi.fn() })
    await vi.waitFor(() => expect(typeof finishInit).toBe('function'))
    finishInit()
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(init).toHaveBeenCalledOnce()
  })
})
