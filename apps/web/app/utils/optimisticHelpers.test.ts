import { describe, expect, it } from 'vitest'
import {
  collectTouchIds,
  isStructuralPatches,
  resolveSimulateParam,
  toMutationRequest,
} from './optimisticHelpers'

describe('optimisticHelpers', () => {
  it('rebuilds MutationRequestDTO with version and id', () => {
    const request = toMutationRequest(
      { type: 'delete-rows', rowIds: ['r1'] },
      4,
      'mut-9',
    )
    expect(request).toMatchObject({
      type: 'delete-rows',
      rowIds: ['r1'],
      expectedVersion: 4,
      mutationId: 'mut-9',
    })
  })

  it('detects structural row-order patches', () => {
    expect(
      isStructuralPatches([
        { path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'a', newValue: 'b' },
      ]),
    ).toBe(false)
    expect(isStructuralPatches([{ path: ['rowIds'], oldValue: ['r1'], newValue: [] }])).toBe(true)
    expect(
      isStructuralPatches([{ path: ['rowsById', 'r1'], oldValue: { id: 'r1' }, newValue: undefined }]),
    ).toBe(true)
  })

  it('collects touched and removed row ids from patches', () => {
    expect(
      collectTouchIds([
        { path: ['rowsById', 'a', 'cells', 'name'], oldValue: 'x', newValue: 'y' },
        { path: ['rowsById', 'b'], oldValue: { id: 'b' }, newValue: undefined },
        { path: ['rowIds'], oldValue: [], newValue: [] },
      ]),
    ).toEqual({ touchedIds: ['a'], removedIds: ['b'] })
  })

  it('resolveSimulateParam is disabled outside development', () => {
    expect(resolveSimulateParam('conflict', false)).toBeUndefined()
    expect(resolveSimulateParam('none', true)).toBeUndefined()
    expect(resolveSimulateParam('slow', true)).toBe('slow')
  })
})
