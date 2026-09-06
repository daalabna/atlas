import type { Row, RowId, SortRule } from '@atlas/domain'
const compareValues = (a: unknown, b: unknown): number => {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}
export const sortRowIds = (
  rowIds: RowId[],
  rowsById: Record<RowId, Row>,
  sorting: SortRule[],
): RowId[] => {
  if (sorting.length === 0) return rowIds
  return [...rowIds].sort((leftId, rightId) => {
    const left = rowsById[leftId]
    const right = rowsById[rightId]
    if (!left || !right) return 0
    for (const rule of sorting) {
      const cmp = compareValues(left.cells[rule.columnId], right.cells[rule.columnId])
      if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp
    }
    return 0
  })
}
