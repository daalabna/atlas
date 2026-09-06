import { describe, expect, it } from 'vitest'
import {
  datasetQueueKey,
  enqueueForDataset,
  runRemoteChain,
  shouldReloadAfterChainFailure,
  withResolvedInsertIndex,
} from './remoteMutations'

describe('remoteMutations', () => {
  it('isolates mutation queues by dataset and generated size', () => {
    expect(datasetQueueKey('customers', 1_000)).not.toBe(datasetQueueKey('customers', 10_000))
  })

  it('resolves insert-row index from local rowIds', () => {
    const body = withResolvedInsertIndex(
      { type: 'insert-row', rowId: 'b', cells: { name: 'B' }, index: 0 },
      ['a', 'b', 'c'],
    )
    expect(body).toEqual({ type: 'insert-row', rowId: 'b', cells: { name: 'B' }, index: 1 })
  })

  it('resolves multi-delete undo inserts so server chain matches restored order', () => {
    const localRestored = ['a', 'b', 'c', 'd', 'e']
    const serverAfterDelete = ['a', 'c', 'e']

    const inserts = [
      withResolvedInsertIndex({ type: 'insert-row', rowId: 'b', cells: {}, index: 0 }, localRestored),
      withResolvedInsertIndex({ type: 'insert-row', rowId: 'd', cells: {}, index: 0 }, localRestored),
    ]

    expect(inserts).toEqual([
      { type: 'insert-row', rowId: 'b', cells: {}, index: 1 },
      { type: 'insert-row', rowId: 'd', cells: {}, index: 3 },
    ])

    const result = [...serverAfterDelete]
    for (const { rowId, index } of inserts) {
      if (rowId === undefined || index === undefined) {
        throw new Error('expected insert-row with rowId and index')
      }
      result.splice(index, 0, rowId)
    }
    expect(result).toEqual(localRestored)
  })

  it('runRemoteChain advances onApplied before a later failure', async () => {
    let applied = 0
    await expect(
      runRemoteChain(
        ['x', 'y', 'z'],
        async (id) => {
          if (id === 'z') throw new Error('fail')
        },
        (n) => {
          applied = n
        },
      ),
    ).rejects.toThrow('fail')
    expect(applied).toBe(2)
    expect(shouldReloadAfterChainFailure(applied)).toBe(true)
  })

  it('enqueueForDataset keeps workspace FIFO for the same queue key', async () => {
    const seen: number[] = []
    await Promise.all([
      enqueueForDataset('ds', async () => {
        await new Promise((r) => setTimeout(r, 10))
        seen.push(1)
      }),
      enqueueForDataset('ds', async () => {
        seen.push(2)
      }),
    ])
    expect(seen).toEqual([1, 2])
  })

  it('enqueueForDataset serializes across different queue keys (workspace FIFO)', async () => {
    const seen: string[] = []
    await Promise.all([
      enqueueForDataset('["a",1]', async () => {
        await new Promise((r) => setTimeout(r, 15))
        seen.push('a')
      }),
      enqueueForDataset('["b",2]', async () => {
        seen.push('b')
      }),
    ])
    expect(seen).toEqual(['a', 'b'])
  })
})
