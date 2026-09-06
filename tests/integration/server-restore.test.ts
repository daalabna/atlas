import { beforeEach, describe, expect, it } from 'vitest'
import {
  getOrCreateDataset,
  resetMemories,
  restoreToVersion,
  snapshot,
} from '../../apps/web/server/utils/store'
import { applyMutation } from '../../apps/web/server/utils/applyServerMutation'

describe('server restore', () => {
  beforeEach(() => {
    resetMemories()
  })

  it('restores insert-row and delete-rows via structural inverse patches', () => {
    const memory = getOrCreateDataset('customers', 100)
    const baseline = memory.dataset.version
    const firstId = memory.dataset.rowIds[0]!
    const firstRow = memory.rowsById[firstId]!

    applyMutation(memory, {
      type: 'delete-rows',
      rowIds: [firstId],
      expectedVersion: memory.dataset.version,
      mutationId: 'del-1',
    })
    expect(memory.rowsById[firstId]).toBeUndefined()
    expect(memory.dataset.rowIds.includes(firstId)).toBe(false)

    const insertedId = 'row-restore-test'
    applyMutation(memory, {
      type: 'insert-row',
      rowId: insertedId,
      cells: { name: 'Zed' },
      index: 0,
      expectedVersion: memory.dataset.version,
      mutationId: 'ins-1',
    })
    expect(memory.rowsById[insertedId]?.cells.name).toBe('Zed')

    restoreToVersion(memory, baseline, memory.dataset.version)
    const snap = snapshot(memory)
    expect(snap.dataset.version).toBe(baseline)
    expect(snap.dataset.rowIds.includes(firstId)).toBe(true)
    expect(memory.rowsById[firstId]?.cells).toEqual(firstRow.cells)
    expect(memory.rowsById[insertedId]).toBeUndefined()
  })

  it('rejects restore when the mutation log cannot reach the target version', () => {
    const memory = getOrCreateDataset('customers', 10)
    memory.dataset.version = 4
    memory.mutations = []
    expect(() => restoreToVersion(memory, 2, 4)).toThrow(/incomplete/)
    expect(memory.dataset.version).toBe(4)
  })

  it('does not mutate memory when the mutation log is shorter than the version gap', () => {
    const memory = getOrCreateDataset('customers', 10)
    const firstId = memory.dataset.rowIds[0]!
    applyMutation(memory, {
      type: 'delete-rows',
      rowIds: [firstId],
      expectedVersion: memory.dataset.version,
      mutationId: 'del-short',
    })
    const last = memory.mutations.at(-1)
    if (!last) throw new Error('expected a mutation after delete')
    last.version = 5
    memory.dataset.version = 5

    expect(() => restoreToVersion(memory, 2, 5)).toThrow(/incomplete/)
    expect(memory.dataset.version).toBe(5)
    expect(memory.mutations).toHaveLength(1)
    expect(memory.rowsById[firstId]).toBeUndefined()
  })

  it('does not pop the mutation log when inverse apply throws', () => {
    const memory = getOrCreateDataset('customers', 10)
    const version = memory.dataset.version
    memory.dataset.version = version + 1
    memory.mutations.push({
      id: 'bad',
      version: version + 1,
      type: 'update-cell',
      summary: 'bad inverse',
      timestamp: new Date(0).toISOString(),
      mutationId: 'bad',
      requestFingerprint: 'bad',
      patches: [],
      inversePatches: [
        { path: ['rowsById', 'missing', 'cells', 'name'], oldValue: 'x', newValue: 'y' },
      ],
    })

    expect(() => restoreToVersion(memory, version, version + 1)).toThrow()
    expect(memory.dataset.version).toBe(version + 1)
    expect(memory.mutations).toHaveLength(1)
  })
})
