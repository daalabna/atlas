import type { CellValue, Filter, Row, RowId } from '@atlas/domain'
const matches = (value: CellValue | undefined, filter: Filter): boolean => {
  const expected = filter.value
  const numericOperands = (): [number, number] | null => {
    if (value == null || value === '' || expected == null || expected === '') return null
    const left = Number(value)
    const right = Number(expected)
    return Number.isFinite(left) && Number.isFinite(right) ? [left, right] : null
  }
  switch (filter.operator) {
    case 'equals':
      return value === expected || String(value ?? '') === String(expected ?? '')
    case 'not-equals':
      return value !== expected && String(value ?? '') !== String(expected ?? '')
    case 'contains':
      return String(value ?? '')
        .toLowerCase()
        .includes(String(expected ?? '').toLowerCase())
    case 'gt': {
      const operands = numericOperands()
      return operands ? operands[0] > operands[1] : false
    }
    case 'gte': {
      const operands = numericOperands()
      return operands ? operands[0] >= operands[1] : false
    }
    case 'lt': {
      const operands = numericOperands()
      return operands ? operands[0] < operands[1] : false
    }
    case 'lte': {
      const operands = numericOperands()
      return operands ? operands[0] <= operands[1] : false
    }
    case 'is-true':
      return value === true
    case 'is-false':
      return value === false
    case 'is-empty':
      return value == null || value === ''
    default:
      // Fail closed: unknown operators never match.
      return false
  }
}
export const filterRowIds = (
  rowIds: RowId[],
  rowsById: Record<RowId, Row>,
  filters: Filter[],
): RowId[] => {
  if (filters.length === 0) return rowIds
  const result: RowId[] = []
  for (const id of rowIds) {
    const row = rowsById[id]
    if (!row) continue
    let ok = true
    for (const filter of filters) {
      if (!matches(row.cells[filter.columnId], filter)) {
        ok = false
        break
      }
    }
    if (ok) result.push(id)
  }
  return result
}
