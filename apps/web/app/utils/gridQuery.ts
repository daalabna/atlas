import type { Column, ColumnId, Filter, Row, RowId, SortRule } from '@atlas/domain'
import { filterRowIds, sortRowIds } from '@atlas/data-engine'

export const resolveVisibleColumns = (
  columns: Column[],
  visibleColumnIds: ColumnId[],
): Column[] => {
  const ids = visibleColumnIds.length ? visibleColumnIds : columns.map((column) => column.id)
  return columns.filter((column) => ids.includes(column.id))
}

/** Main-thread filter/sort used when the worker is off or not yet hydrated. */
export const runMainThreadFilterSort = (
  rowIds: RowId[],
  rowsById: Record<RowId, Row>,
  filters: Filter[],
  sort: SortRule[],
): RowId[] => {
  const filtered = filterRowIds(rowIds, rowsById, filters)
  return sortRowIds(filtered, rowsById, sort)
}
