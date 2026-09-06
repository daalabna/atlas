import { beforeEach, describe, expect, it } from 'vitest'
import {
  getOrCreateDataset,
  resetMemories,
  snapshot,
} from '../../apps/web/server/utils/store'
import { applyMutation } from '../../apps/web/server/utils/applyServerMutation'

describe('server mutations', () => {
  beforeEach(() => {
    resetMemories()
  })

  it('rejects bulk-update when a row is missing', () => {
    const memory = getOrCreateDataset('customers', 50)
    expect(() =>
      applyMutation(memory, {
        type: 'bulk-update',
        rowIds: ['missing-row'],
        columnId: 'priority',
        value: 'high',
        expectedVersion: memory.dataset.version,
        mutationId: 'bulk-1',
      }),
    ).toThrow(/not found/)
    expect(memory.dataset.version).toBe(1)
  })

  it('rejects empty delete-rows without bumping version', () => {
    const memory = getOrCreateDataset('customers', 10)
    expect(() =>
      applyMutation(memory, {
        type: 'delete-rows',
        rowIds: [],
        expectedVersion: memory.dataset.version,
        mutationId: 'delete-empty',
      }),
    ).toThrow(/No rows to delete/)
    expect(memory.dataset.version).toBe(1)
    expect(memory.mutations).toHaveLength(0)
  })

  it('rejects mixed delete-rows atomically when any row is missing', () => {
    const memory = getOrCreateDataset('customers', 10)
    const existingId = memory.dataset.rowIds[0]!
    const orderBefore = [...memory.dataset.rowIds]
    const rowBefore = memory.rowsById[existingId]

    expect(() =>
      applyMutation(memory, {
        type: 'delete-rows',
        rowIds: [existingId, 'missing-row'],
        expectedVersion: memory.dataset.version,
        mutationId: 'delete-mixed',
      }),
    ).toThrow(/not found/)

    expect(memory.dataset.rowIds).toEqual(orderBefore)
    expect(memory.rowsById[existingId]).toBe(rowBefore)
    expect(memory.dataset.version).toBe(1)
    expect(memory.mutations).toHaveLength(0)
  })

  it('snapshot repairs orphan row ids and remains internally consistent', () => {
    const memory = getOrCreateDataset('customers', 10)
    memory.dataset.rowIds = [...memory.dataset.rowIds, 'ghost']
    const snap = snapshot(memory)
    expect(snap.rows.every((row) => row.id !== 'ghost')).toBe(true)
    expect(snap.dataset.rowIds).not.toContain('ghost')
    expect(snap.rows.length).toBe(snap.dataset.rowIds.length)
  })

  it('rejects duplicate row ids without corrupting row order', () => {
    const memory = getOrCreateDataset('customers', 10)
    const rowId = memory.dataset.rowIds[0]!
    const before = [...memory.dataset.rowIds]
    expect(() =>
      applyMutation(memory, {
        type: 'insert-row',
        rowId,
        cells: {},
        expectedVersion: memory.dataset.version,
      }),
    ).toThrow(/already exists/)
    expect(memory.dataset.rowIds).toEqual(before)
    expect(memory.dataset.version).toBe(1)
  })

  it('validates column existence and value type', () => {
    const memory = getOrCreateDataset('customers', 10)
    const rowId = memory.dataset.rowIds[0]!
    expect(() =>
      applyMutation(memory, {
        type: 'update-cell',
        rowId,
        columnId: 'missing',
        value: 'x',
        expectedVersion: memory.dataset.version,
      }),
    ).toThrow(/Unknown column/)
    expect(() =>
      applyMutation(memory, {
        type: 'update-cell',
        rowId,
        columnId: 'score',
        value: 'not-a-number',
        expectedVersion: memory.dataset.version,
      }),
    ).toThrow(/Invalid value/)
    expect(memory.dataset.version).toBe(1)
  })

  it('returns the original result when a mutationId is retried', () => {
    const memory = getOrCreateDataset('customers', 10)
    const rowId = memory.dataset.rowIds[0]!
    const request = {
      type: 'update-cell' as const,
      rowId,
      columnId: 'name',
      value: 'Ada',
      expectedVersion: memory.dataset.version,
      mutationId: 'stable-id',
    }
    const first = applyMutation(memory, request)
    const retried = applyMutation(memory, request)
    expect(retried).toBe(first)
    expect(memory.dataset.version).toBe(2)
    expect(memory.mutations).toHaveLength(1)
  })

  it('rejects non-existent calendar dates for date columns', () => {
    const memory = getOrCreateDataset('customers', 10)
    const rowId = memory.dataset.rowIds[0]!
    expect(() =>
      applyMutation(memory, {
        type: 'update-cell',
        rowId,
        columnId: 'joinedAt',
        value: '2023-02-29',
        expectedVersion: memory.dataset.version,
        mutationId: 'bad-date',
      }),
    ).toThrow(/Invalid date/)
    expect(memory.dataset.version).toBe(1)
  })

  it('rejects reuse of a mutationId for a different intent', () => {
    const memory = getOrCreateDataset('customers', 10)
    const rowId = memory.dataset.rowIds[0]!
    applyMutation(memory, {
      type: 'update-cell',
      rowId,
      columnId: 'name',
      value: 'Ada',
      expectedVersion: 1,
      mutationId: 'reused-id',
    })
    expect(() =>
      applyMutation(memory, {
        type: 'update-cell',
        rowId,
        columnId: 'name',
        value: 'Grace',
        expectedVersion: 2,
        mutationId: 'reused-id',
      }),
    ).toThrow(/already used/)
    expect(memory.rowsById[rowId]?.cells.name).toBe('Ada')
  })
})
