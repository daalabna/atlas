import { describe, expect, it } from 'vitest'
import {
  applyPatches,
  createHistory,
  discardLast,
  invertPatches,
  pushEntry,
  type Patch,
} from '@atlas/history-engine'
import { MutationRequestSchema, MutationResponseSchema } from '@atlas/contracts'
import {
  enqueueForDataset,
  runRemoteChain,
  shouldReloadAfterChainFailure,
} from '../../apps/web/app/utils/remoteMutations'

describe('optimistic mutation state machine', () => {
  const createState = () => ({
    version: 1,
    rowIds: ['row-1'],
    rowsById: { 'row-1': { id: 'row-1', cells: { name: 'John' } } },
  })

  it('commits on 200 and advances version', async () => {
    let state = createState()
    let history = createHistory()
    const patches: Patch[] = [
      { path: ['rowsById', 'row-1', 'cells', 'name'], oldValue: 'John', newValue: 'Alex' },
    ]
    state = applyPatches(state, patches)
    history = pushEntry(history, {
      id: 'm1',
      type: 'update-cell',
      summary: 'John → Alex',
      patches,
      inversePatches: invertPatches(patches),
      timestamp: 1,
      mutationId: 'mut-1',
    })
    const mutation = MutationRequestSchema.parse({
      type: 'update-cell',
      rowId: 'row-1',
      columnId: 'name',
      value: 'Alex',
      expectedVersion: 1,
      mutationId: 'mut-1',
    })
    const result = MutationResponseSchema.parse({
      version: 2,
      mutationId: mutation.mutationId,
      appliedAt: new Date().toISOString(),
    })
    state = { ...state, version: result.version }
    expect(state.rowsById['row-1']?.cells.name).toBe('Alex')
    expect(state.version).toBe(2)
    expect(history.past).toHaveLength(1)
  })

  it('rolls back with inverse patches; discardLast clears past without redo (library helper)', () => {
    let state = createState()
    let history = createHistory()
    const patches: Patch[] = [
      { path: ['rowsById', 'row-1', 'cells', 'name'], oldValue: 'John', newValue: 'Alex' },
    ]
    state = applyPatches(state, patches)
    history = pushEntry(history, {
      id: 'm1',
      type: 'update-cell',
      summary: 'John → Alex',
      patches,
      inversePatches: invertPatches(patches),
      timestamp: 1,
    })
    state = applyPatches(state, invertPatches(patches))
    history = discardLast(history)
    expect(state.rowsById['row-1']?.cells.name).toBe('John')
    expect(history.past).toHaveLength(0)
    expect(history.future).toHaveLength(0)
  })

  it('structurally undoes delete via rowIds + rowsById patches alone', () => {
    const row = { id: 'row-1', cells: { name: 'John' } }
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
    expect(Object.prototype.hasOwnProperty.call(state.rowsById, 'row-1')).toBe(false)
    state = applyPatches(state, invertPatches(patches))
    expect(state.rowIds).toEqual(['row-1', 'row-2'])
    expect(state.rowsById['row-1']?.cells.name).toBe('John')
  })
})

describe('runRemoteChain / partial failure policy', () => {
  it('reports applied count via onApplied and stops on first throw', async () => {
    const sent: number[] = []
    let applied = 0
    await expect(
      runRemoteChain(
        [0, 1, 2],
        async (body) => {
          if (body === 2) throw new Error('boom')
          sent.push(body)
        },
        (count) => {
          applied = count
        },
      ),
    ).rejects.toThrow('boom')
    expect(sent).toEqual([0, 1])
    expect(applied).toBe(2)
    expect(shouldReloadAfterChainFailure(applied)).toBe(true)
  })

  it('does not reload when the first remote step fails', () => {
    expect(shouldReloadAfterChainFailure(0)).toBe(false)
  })

  it('serializes all dataset keys on one workspace FIFO', async () => {
    const order: string[] = []
    const a1 = enqueueForDataset('a', async () => {
      await new Promise((r) => setTimeout(r, 20))
      order.push('a1')
    })
    const b1 = enqueueForDataset('b', async () => {
      order.push('b1')
    })
    const a2 = enqueueForDataset('a', async () => {
      order.push('a2')
    })
    await Promise.all([a1, b1, a2])
    expect(order).toEqual(['a1', 'b1', 'a2'])
  })
})
