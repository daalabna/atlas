import { describe, expect, it } from 'vitest'
import { applyPatches, invertPatches, type Patch } from './patch'
import { createHistory, discardLast, pushEntry, redo, undo } from './history'

describe('patch engine', () => {
  it('applies and inverts a cell patch without snapshotting the dataset', () => {
    const state = {
      rowsById: {
        'row-123': { id: 'row-123', cells: { name: 'John' } },
      },
    }

    const patches: Patch[] = [
      {
        path: ['rowsById', 'row-123', 'cells', 'name'],
        oldValue: 'John',
        newValue: 'Alex',
      },
    ]

    const next = applyPatches(state, patches)
    expect(next.rowsById['row-123']?.cells.name).toBe('Alex')
    expect(state.rowsById['row-123']?.cells.name).toBe('John')

    const undone = applyPatches(next, invertPatches(patches))
    expect(undone.rowsById['row-123']?.cells.name).toBe('John')
  })

  it('deletes and restores row keys with undefined newValue', () => {
    const row = { id: 'row-1', cells: { name: 'Ada' } }
    let state = {
      rowIds: ['row-1', 'row-2'],
      rowsById: {
        'row-1': row,
        'row-2': { id: 'row-2', cells: { name: 'Bob' } },
      } as Record<string, { id: string; cells: { name: string } }>,
    }

    const patches: Patch[] = [
      { path: ['rowIds'], oldValue: state.rowIds, newValue: ['row-2'] },
      { path: ['rowsById', 'row-1'], oldValue: row, newValue: undefined },
    ]

    state = applyPatches(state, patches)
    expect(state.rowIds).toEqual(['row-2'])
    expect(state.rowsById['row-1']).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(state.rowsById, 'row-1')).toBe(false)

    state = applyPatches(state, invertPatches(patches))
    expect(state.rowIds).toEqual(['row-1', 'row-2'])
    expect(state.rowsById['row-1']?.cells.name).toBe('Ada')
  })

  it('clones rowsById once per batch and leaves the source map intact', () => {
    const rowA = { id: 'a', cells: { n: 1 } }
    const rowB = { id: 'b', cells: { n: 2 } }
    const rowsById = { a: rowA, b: rowB }
    const state = { rowsById, rowIds: ['a', 'b'] }

    const next = applyPatches(state, [
      { path: ['rowsById', 'a', 'cells', 'n'], oldValue: 1, newValue: 10 },
      { path: ['rowsById', 'b', 'cells', 'n'], oldValue: 2, newValue: 20 },
    ])

    expect(next.rowsById).not.toBe(rowsById)
    expect(next.rowsById.a?.cells.n).toBe(10)
    expect(next.rowsById.b?.cells.n).toBe(20)
    expect(rowA.cells.n).toBe(1)
    expect(rowB.cells.n).toBe(2)
    expect(rowsById.a).toBe(rowA)
  })

  it('does not mutate the source rowsById after an unknown-root patch in the same batch', () => {
    const rowA = { id: 'a', cells: { n: 1 } }
    const rowsById = { a: rowA }
    const state = { rowsById, rowIds: ['a'], meta: 0 }

    const next = applyPatches(state, [
      { path: ['meta'], oldValue: 0, newValue: 1 },
      { path: ['rowsById', 'a', 'cells', 'n'], oldValue: 1, newValue: 10 },
    ])

    expect(next.meta).toBe(1)
    expect(next.rowsById.a?.cells.n).toBe(10)
    expect(rowA.cells.n).toBe(1)
    expect(rowsById.a).toBe(rowA)
    expect(next.rowsById).not.toBe(rowsById)
  })
})

describe('history', () => {
  it('undoes then redoes in stack order', () => {
    let history = createHistory()
    history = pushEntry(history, {
      id: '1',
      type: 'update-cell',
      summary: 'John → Alex',
      patches: [],
      inversePatches: [],
      timestamp: 1,
    })
    history = pushEntry(history, {
      id: '2',
      type: 'update-cell',
      summary: 'Alex → Sam',
      patches: [],
      inversePatches: [],
      timestamp: 2,
    })

    const first = undo(history)
    expect(first.entry?.id).toBe('2')
    const second = undo(first.history)
    expect(second.entry?.id).toBe('1')
    const redone = redo(second.history)
    expect(redone.entry?.id).toBe('1')
  })

  it('discardLast drops a failed optimistic entry without creating redo', () => {
    let history = createHistory()
    history = pushEntry(history, {
      id: 'failed',
      type: 'update-cell',
      summary: 'x',
      patches: [],
      inversePatches: [],
      timestamp: 1,
    })
    history = discardLast(history)
    expect(history.past).toHaveLength(0)
    expect(history.future).toHaveLength(0)
  })
})
