import { beforeEach, describe, expect, it } from 'vitest'
import { resetWorkerCache, runWorkerJob } from './engine'

describe('worker engine', () => {
  beforeEach(() => {
    resetWorkerCache()
  })

  it('echoes requestId and updates cache via patch-rows', () => {
    runWorkerJob({
      kind: 'init',
      requestId: 'init-1',
      rowIds: ['a', 'b'],
      rows: [
        { id: 'a', cells: { name: 'Ann' } },
        { id: 'b', cells: { name: 'Bob' } },
      ],
    })

    const patched = runWorkerJob({
      kind: 'patch-rows',
      requestId: 'patch-1',
      rows: [{ id: 'a', cells: { name: 'Ada' } }],
      removeIds: ['b'],
    })
    expect(patched.requestId).toBe('patch-1')

    const filtered = runWorkerJob({
      kind: 'filter-sort',
      requestId: 'q-1',
      filters: [{ id: 'f', columnId: 'name', operator: 'equals', value: 'Ada' }],
      sorting: [],
    })
    expect(filtered.requestId).toBe('q-1')
    expect(filtered.rowIds).toEqual(['a'])
  })
})
