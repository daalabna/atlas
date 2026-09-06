import { describe, expect, it } from 'vitest'
import { filterRowIds } from './filter'
import { sortRowIds } from './sort'
import { aggregateRows } from './aggregate'
import type { Row } from '@atlas/domain'

const rowsById: Record<string, Row> = {
  a: { id: 'a', cells: { name: 'Ann', score: 10, status: 'active' } },
  b: { id: 'b', cells: { name: 'Bob', score: 30, status: 'inactive' } },
  c: { id: 'c', cells: { name: 'Cara', score: 20, status: 'active' } },
}

describe('filter + sort', () => {
  it('filters by equals then sorts by number', () => {
    const filtered = filterRowIds(['a', 'b', 'c'], rowsById, [
      { id: 'f1', columnId: 'status', operator: 'equals', value: 'active' },
    ])
    expect(filtered).toEqual(['a', 'c'])

    const sorted = sortRowIds(filtered, rowsById, [{ columnId: 'score', direction: 'desc' }])
    expect(sorted).toEqual(['c', 'a'])
  })

  it('fails closed on unknown operators and non-numeric comparisons', () => {
    const unknown = filterRowIds(['a', 'b', 'c'], rowsById, [
      { id: 'f2', columnId: 'status', operator: 'nope' as 'equals', value: 'active' },
    ])
    expect(unknown).toEqual([])

    const nonNumeric = filterRowIds(['a', 'b', 'c'], rowsById, [
      { id: 'f3', columnId: 'name', operator: 'gt', value: 10 },
    ])
    expect(nonNumeric).toEqual([])
  })

  it('does not coerce empty numeric cells to zero', () => {
    const rows: Record<string, Row> = {
      nullValue: { id: 'nullValue', cells: { score: null } },
      emptyValue: { id: 'emptyValue', cells: { score: '' } },
      zero: { id: 'zero', cells: { score: 0 } },
    }
    expect(
      filterRowIds(Object.keys(rows), rows, [
        { id: 'numeric', columnId: 'score', operator: 'gte', value: 0 },
      ]),
    ).toEqual(['zero'])
  })
})

describe('aggregateRows', () => {
  it('averages only finite, non-empty numeric values', () => {
    const rows: Record<string, Row> = {
      a: { id: 'a', cells: { score: 10 } },
      b: { id: 'b', cells: { score: null } },
      c: { id: 'c', cells: { score: 20 } },
      d: { id: 'd', cells: { score: '' } },
    }
    expect(aggregateRows(Object.keys(rows), rows, ['score'])).toEqual({
      count: 4,
      numeric: { score: { min: 10, max: 20, sum: 30, avg: 15 } },
    })
  })
})
