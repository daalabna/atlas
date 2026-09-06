import type { ColumnId, Row, RowId } from '@atlas/domain'
export interface AggregateResult {
  count: number
  numeric: Record<
    ColumnId,
    {
      min: number
      max: number
      avg: number
      sum: number
    }
  >
}
export const aggregateRows = (
  rowIds: RowId[],
  rowsById: Record<RowId, Row>,
  numericColumns: ColumnId[],
): AggregateResult => {
  const numeric: AggregateResult['numeric'] = {}
  const validCounts: Record<ColumnId, number> = {}
  for (const columnId of numericColumns) {
    numeric[columnId] = {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      avg: 0,
      sum: 0,
    }
    validCounts[columnId] = 0
  }
  let count = 0
  for (const id of rowIds) {
    const row = rowsById[id]
    if (!row) continue
    count++
    for (const columnId of numericColumns) {
      const raw = row.cells[columnId]
      if (raw == null || raw === '' || typeof raw === 'boolean') continue
      const value = Number(raw)
      if (!Number.isFinite(value)) continue
      const bucket = numeric[columnId]!
      bucket.min = Math.min(bucket.min, value)
      bucket.max = Math.max(bucket.max, value)
      bucket.sum += value
      validCounts[columnId] = (validCounts[columnId] ?? 0) + 1
    }
  }
  for (const columnId of numericColumns) {
    const bucket = numeric[columnId]!
    const validCount = validCounts[columnId] ?? 0
    bucket.avg = validCount === 0 ? 0 : bucket.sum / validCount
    if (!Number.isFinite(bucket.min)) bucket.min = 0
    if (!Number.isFinite(bucket.max)) bucket.max = 0
  }
  return { count, numeric }
}
