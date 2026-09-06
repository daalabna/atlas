import { aggregateRows, filterRowIds, sortRowIds } from '@atlas/data-engine'
import type { Filter, Row, RowId, SortRule } from '@atlas/domain'
interface WorkerMessage {
  requestId?: string
}

type WorkerRow = { id: RowId; cells: Row['cells'] }

export type WorkerPayload =
  | (WorkerMessage & { kind: 'init'; rowIds: RowId[]; rows: WorkerRow[] })
  | (WorkerMessage & {
      kind: 'patch-rows'
      rows?: WorkerRow[]
      removeIds?: RowId[]
    })
  | (WorkerMessage & { kind: 'filter'; rowIds?: RowId[]; filters: Filter[] })
  | (WorkerMessage & { kind: 'sort'; rowIds?: RowId[]; sorting: SortRule[] })
  | (WorkerMessage & {
      kind: 'filter-sort'
      rowIds?: RowId[]
      filters: Filter[]
      sorting: SortRule[]
    })
  | (WorkerMessage & { kind: 'aggregate'; rowIds: RowId[]; numericColumns: string[] })
export interface WorkerResult {
  kind: WorkerPayload['kind']
  requestId?: string
  rowIds: RowId[]
  duration: number
  aggregate?: ReturnType<typeof aggregateRows>
}
let cachedRowIds: RowId[] = []
let cachedRowsById: Record<RowId, Row> = Object.create(null)
export const runWorkerJob = (payload: WorkerPayload): WorkerResult => {
  const started = Date.now()
  if (payload.kind === 'init') {
    cachedRowIds = payload.rowIds
    cachedRowsById = Object.create(null)
    for (const row of payload.rows) cachedRowsById[row.id] = row
    return {
      kind: 'init',
      requestId: payload.requestId,
      rowIds: cachedRowIds,
      duration: Date.now() - started,
    }
  }
  if (payload.kind === 'patch-rows') {
    const removed = payload.removeIds ?? []
    if (removed.length) {
      const removeSet = new Set(removed)
      for (const id of removed) delete cachedRowsById[id]
      cachedRowIds = cachedRowIds.filter((id) => !removeSet.has(id))
    }
    for (const row of payload.rows ?? []) cachedRowsById[row.id] = row
    return {
      kind: 'patch-rows',
      requestId: payload.requestId,
      rowIds: cachedRowIds,
      duration: Date.now() - started,
    }
  }
  let rowIds = payload.rowIds ?? cachedRowIds
  const rowsById = cachedRowsById
  if (payload.kind === 'filter' || payload.kind === 'filter-sort') {
    rowIds = filterRowIds(rowIds, rowsById, payload.filters)
  }
  if (payload.kind === 'sort' || payload.kind === 'filter-sort') {
    rowIds = sortRowIds(rowIds, rowsById, payload.sorting)
  }
  const aggregate =
    payload.kind === 'aggregate'
      ? aggregateRows(rowIds, rowsById, payload.numericColumns)
      : undefined
  return {
    kind: payload.kind,
    requestId: payload.requestId,
    rowIds,
    duration: Date.now() - started,
    aggregate,
  }
}
export const resetWorkerCache = () => {
  cachedRowIds = []
  cachedRowsById = Object.create(null)
}
