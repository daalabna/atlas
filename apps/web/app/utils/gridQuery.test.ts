import { describe, expect, it } from 'vitest'
import { resolveVisibleColumns, runMainThreadFilterSort } from './gridQuery'

describe('gridQuery', () => {
  const columns = [
    { id: 'name', name: 'Name', type: 'text' as const, width: 120 },
    { id: 'score', name: 'Score', type: 'number' as const, width: 80 },
    { id: 'city', name: 'City', type: 'text' as const, width: 100 },
  ]

  it('resolveVisibleColumns falls back to all columns', () => {
    expect(resolveVisibleColumns(columns, []).map((c) => c.id)).toEqual([
      'name',
      'score',
      'city',
    ])
    expect(resolveVisibleColumns(columns, ['score', 'name']).map((c) => c.id)).toEqual([
      'name',
      'score',
    ])
  })

  it('runMainThreadFilterSort filters then sorts', () => {
    const rowIds = ['a', 'b', 'c']
    const rowsById = {
      a: { id: 'a', cells: { name: 'Ada', score: 2 } },
      b: { id: 'b', cells: { name: 'Bob', score: 9 } },
      c: { id: 'c', cells: { name: 'Cid', score: 5 } },
    }
    expect(
      runMainThreadFilterSort(
        rowIds,
        rowsById,
        [{ id: 'f1', columnId: 'name', operator: 'contains', value: 'a' }],
        [{ columnId: 'score', direction: 'desc' }],
      ),
    ).toEqual(['a'])
    expect(
      runMainThreadFilterSort(rowIds, rowsById, [], [{ columnId: 'score', direction: 'desc' }]),
    ).toEqual(['b', 'c', 'a'])
  })
})
