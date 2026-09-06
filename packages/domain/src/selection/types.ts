import type { RowId, ColumnId } from '../dataset/types'
export type RowRange = {
  start: number
  end: number
}
export interface GridSelection {
  ranges: RowRange[]
  activeCell: {
    rowId: RowId
    columnId: ColumnId
  } | null
  anchorCell: {
    rowId: RowId
    columnId: ColumnId
  } | null
}
export const emptySelection = (): GridSelection => {
  return {
    ranges: [],
    activeCell: null,
    anchorCell: null,
  }
}
export const normalizeRange = (start: number, end: number): RowRange => {
  return start <= end ? { start, end } : { start: end, end: start }
}
export const mergeRanges = (ranges: RowRange[]): RowRange[] => {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: RowRange[] = []
  let current = { ...sorted[0]! }
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!
    if (next.start <= current.end + 1) {
      current.end = Math.max(current.end, next.end)
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}
export const addRange = (ranges: RowRange[], range: RowRange): RowRange[] => {
  return mergeRanges([...ranges, range])
}
export const toggleIndex = (ranges: RowRange[], index: number): RowRange[] => {
  if (containsIndex(ranges, index)) {
    return subtractIndex(ranges, index)
  }
  return addRange(ranges, { start: index, end: index })
}
export const containsIndex = (ranges: RowRange[], index: number): boolean => {
  let low = 0
  let high = ranges.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const range = ranges[mid]!
    if (index < range.start) high = mid - 1
    else if (index > range.end) low = mid + 1
    else return true
  }
  return false
}
export const subtractIndex = (ranges: RowRange[], index: number): RowRange[] => {
  const next: RowRange[] = []
  for (const range of ranges) {
    if (index < range.start || index > range.end) {
      next.push(range)
      continue
    }
    if (range.start < index) next.push({ start: range.start, end: index - 1 })
    if (index < range.end) next.push({ start: index + 1, end: range.end })
  }
  return next
}
export const selectedCount = (ranges: RowRange[]): number => {
  let count = 0
  for (const range of ranges) count += range.end - range.start + 1
  return count
}
export const collectSelectedIds = <T>(ranges: RowRange[], orderedIds: readonly T[]): T[] => {
  const result: T[] = []
  for (const range of ranges) {
    for (let i = range.start; i <= range.end; i++) {
      const id = orderedIds[i]
      if (id !== undefined) result.push(id)
    }
  }
  return result
}
