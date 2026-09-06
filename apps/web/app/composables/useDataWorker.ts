import type { Filter, Row, RowId, SortRule } from '@atlas/domain'
import { joinChunkedWorkerHydrate } from '~/utils/workerHydrate'
import { createWorkerRuntime } from '~/utils/workerRuntime'

export const WORKER_REQUEST_TIMEOUT_MS = 10_000

let refCount = 0
const runtime = createWorkerRuntime(
  () =>
    import.meta.client
      ? new Worker(new URL('../workers/data.worker.ts', import.meta.url), { type: 'module' })
      : null,
  WORKER_REQUEST_TIMEOUT_MS,
)

/** Create worker instance without refcount (snapshot reload before grid mount). */
export const ensureWorkerReady = (): boolean => {
  if (!import.meta.client) return false
  return Boolean(runtime.ensure())
}

export const useDataWorker = () => {
  const boot = () => {
    refCount += 1
    runtime.ensure()
  }

  const release = () => {
    refCount = Math.max(0, refCount - 1)
    if (refCount > 0) return
    runtime.reset(new Error('Worker released'))
  }

  const init = async (rowIds: RowId[], rows: Row[]) => {
    return runtime.post({
      kind: 'init',
      rowIds,
      rows: rows.map((row) => ({ id: row.id, cells: row.cells })),
    })
  }

  const patchRows = async (input: { rows?: Row[]; removeIds?: RowId[] }) => {
    if (!runtime.isReady()) throw new Error('Worker is not ready')
    return runtime.post({
      kind: 'patch-rows',
      rows: input.rows?.map((row) => ({ id: row.id, cells: row.cells })),
      removeIds: input.removeIds,
    })
  }

  const filterSort = async (filters: Filter[], sorting: SortRule[]) => {
    return runtime.post({
      kind: 'filter-sort',
      filters,
      sorting,
    })
  }

  const aggregate = async (rowIds: RowId[], numericColumns: string[]) => {
    return runtime.post({
      kind: 'aggregate',
      rowIds,
      numericColumns,
    })
  }

  const isReady = runtime.isReady
  const ensureReady = () => Boolean(runtime.ensure())
  const onReset = runtime.onReset

  return {
    boot,
    release,
    init,
    patchRows,
    filterSort,
    aggregate,
    isReady,
    ensureReady,
    onReset,
  }
}

export const syncWorkerFromDataset = async (input: {
  rowIds: RowId[]
  rowsById: Record<RowId, Row>
  touchedIds?: RowId[]
  removedIds?: RowId[]
}) => {
  const worker = useDataWorker()
  if (!worker.isReady()) throw new Error('Worker is not ready')
  const touched = input.touchedIds ?? []
  const rows = touched.map((id) => input.rowsById[id]).filter((row): row is Row => Boolean(row))
  // Cell patches must not clone the full rowIds list — worker already has order from init.
  await worker.patchRows({
    rows,
    removeIds: input.removedIds,
  })
}

/** Chunked full rehydrate after snapshot replace / conflict reload. */
export const hydrateWorkerFromDataset = async (input: {
  rowIds: RowId[]
  rowsById: Record<RowId, Row>
  getRowsById?: () => Record<RowId, Row>
  shouldAbort?: () => boolean
  onRowCountChange?: (expected: number, actual: number) => boolean
  getLiveRowCount?: () => number
  getLiveRowIds?: () => RowId[]
  rowIdsAtStart?: RowId[]
  generation: number
}): Promise<boolean> => {
  if (!import.meta.client) return false
  if (!ensureWorkerReady()) return false

  const worker = useDataWorker()
  const rowsAt = (id: RowId) => (input.getRowsById?.() ?? input.rowsById)[id]

  return joinChunkedWorkerHydrate(input.generation, {
    rowIds: input.rowIds,
    getRow: rowsAt,
    expectedRowCount: input.rowIds.length,
    getLiveRowCount: input.getLiveRowCount,
    getLiveRowIds: input.getLiveRowIds,
    rowIdsAtStart: input.rowIdsAtStart,
    init: worker.init,
    patchRows: (rows) => worker.patchRows({ rows }),
    shouldAbort: input.shouldAbort,
    onRowCountChange: input.onRowCountChange,
  })
}
