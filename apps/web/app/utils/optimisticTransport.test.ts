import { describe, expect, it } from 'vitest'
import {
  cancelOptimisticTransport,
  dropUnsentInsertPatches,
  hasPartialRemoteApply,
  inversesFromCancelled,
  pendingChanges,
  resetOptimisticMutationState,
  type PendingOptimisticChange,
} from './optimisticTransport'

const change = (
  id: string,
  remoteApplied: number,
  inversePath: string,
  mutationCount = 1,
): PendingOptimisticChange => ({
  id,
  patches: [],
  inversePatches: [{ path: [inversePath], oldValue: 1, newValue: 0 }],
  cancelled: false,
  remoteApplied,
  mutationCount,
})

describe('optimisticTransport', () => {
  it('inversesFromCancelled skips changes that already POSTed', () => {
    expect(inversesFromCancelled([change('a', 0, 'x'), change('b', 1, 'y')])).toEqual([
      { path: ['x'], oldValue: 1, newValue: 0 },
    ])
  })

  it('hasPartialRemoteApply is true only when some bodies of a change landed', () => {
    expect(hasPartialRemoteApply([change('a', 1, 'x', 2)])).toBe(true)
    expect(hasPartialRemoteApply([change('a', 2, 'x', 2)])).toBe(false)
    expect(hasPartialRemoteApply([change('a', 0, 'x', 2)])).toBe(false)
    expect(hasPartialRemoteApply([change('a', 1, 'x', 1)])).toBe(false)
  })

  it('cancel marks entries cancelled and returns the same objects', () => {
    resetOptimisticMutationState()
    const live = change('a', 0, 'x')
    pendingChanges.set('k', [live])
    const cancelled = cancelOptimisticTransport('k')
    expect(live.cancelled).toBe(true)
    expect(cancelled).toEqual([live])
    expect(pendingChanges.has('k')).toBe(false)
    live.remoteApplied = 2
    live.mutationCount = 2
    expect(inversesFromCancelled(cancelled)).toEqual([])
    expect(hasPartialRemoteApply(cancelled)).toBe(false)
  })

  it('builds patches that drop unsent insert-row bodies', () => {
    const patches = dropUnsentInsertPatches(
      ['r1', 'r2', 'r3'],
      {
        r1: { id: 'r1', cells: { name: 'A' } },
        r2: { id: 'r2', cells: { name: 'B' } },
        r3: { id: 'r3', cells: { name: 'C' } },
      },
      [{ type: 'insert-row', rowId: 'r3', cells: { name: 'C' }, index: 0 }],
    )
    expect(patches[0]).toEqual({
      path: ['rowIds'],
      oldValue: ['r1', 'r2', 'r3'],
      newValue: ['r1', 'r2'],
    })
    expect(patches.some((patch) => patch.path[1] === 'r3' && patch.newValue === undefined)).toBe(
      true,
    )
  })

  it('skips insert-row bodies without a rowId', () => {
    const patches = dropUnsentInsertPatches(
      ['r1'],
      { r1: { id: 'r1', cells: { name: 'A' } } },
      [{ type: 'insert-row', cells: { name: 'X' }, index: 0 }],
    )
    expect(patches).toEqual([])
  })
})

