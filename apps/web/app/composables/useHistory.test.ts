import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const syncRemote = vi.fn()

vi.mock('./useOptimisticMutation', () => ({
  useOptimisticMutation: () => ({ execute: vi.fn(), syncRemote }),
}))

import { useHistory } from './useHistory'
import { useDatasetStore } from '~/stores/dataset'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import type { AppHistoryEntry } from '~/utils/historyTypes'

const entry = (id: string): AppHistoryEntry => ({
  id,
  type: 'update-cell',
  summary: 'A → B',
  patches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'A', newValue: 'B' }],
  inversePatches: [{ path: ['rowsById', 'r1', 'cells', 'name'], oldValue: 'B', newValue: 'A' }],
  timestamp: 1,
  mutationId: id,
  applyMutations: [{ type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'B' }],
  revertMutations: [{ type: 'update-cell', rowId: 'r1', columnId: 'name', value: 'A' }],
})

describe('useHistory', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    syncRemote.mockReset()
    syncRemote.mockResolvedValue(undefined)
    const dataset = useDatasetStore()
    dataset.replaceDataset(
      {
        id: 'customers',
        name: 'Customers',
        version: 2,
        columns: [{ id: 'name', name: 'Name', type: 'text', width: 120 }],
        rowIds: ['r1'],
        createdAt: 't',
        updatedAt: 't',
      },
      { r1: { id: 'r1', cells: { name: 'B' } } },
    )
    useHistoryStore().record(entry('m1'))
  })

  it('undo moves the stack then syncRemote with revert mutations', async () => {
    await useHistory().undo()
    expect(useHistoryStore().canUndo).toBe(false)
    expect(useHistoryStore().canRedo).toBe(true)
    expect(syncRemote).toHaveBeenCalledOnce()
    const arg = syncRemote.mock.calls[0]?.[0]
    expect(arg?.bodies[0]).toEqual({
      type: 'update-cell',
      rowId: 'r1',
      columnId: 'name',
      value: 'A',
    })
    expect(arg?.patches).toEqual(entry('m1').inversePatches)
    expect(syncRemote.mock.calls[0]?.[1]).toEqual({ allowWhileLocked: true })
  })

  it('holds the write lock while undo syncRemote is in flight', async () => {
    let release!: () => void
    syncRemote.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const pending = useHistory().undo()
    await vi.waitFor(() => expect(useSessionStore().writesBlocked).toBe(true))

    release()
    await pending
    expect(useSessionStore().writesBlocked).toBe(false)
  })

  it('restores the stack via onRemoteFailure when syncRemote fails', async () => {
    syncRemote.mockImplementationOnce(async (input: { onRemoteFailure: () => void }) => {
      input.onRemoteFailure()
      input.onRemoteFailure()
      throw new Error('remote undo failed')
    })

    await useHistory().undo()
    // Idempotent repair: double onRemoteFailure must not pull a second future entry.
    expect(useHistoryStore().canUndo).toBe(true)
    expect(useHistoryStore().canRedo).toBe(false)
    expect(useHistoryStore().entries).toHaveLength(1)
  })

  it('idempotent repair does not redo twice when future has multiple entries', () => {
    const history = useHistoryStore()
    history.reset()
    history.record(entry('a'))
    history.record(entry('b'))
    history.record(entry('c'))
    history.undo()
    history.undo()
    // past [a], future [b, c]
    expect(history.peekPast()?.id).toBe('a')
    expect(history.peekFuture()?.id).toBe('b')

    let repaired = false
    const repair = () => {
      if (repaired) return
      repaired = true
      history.redo()
    }
    repair()
    repair()
    expect(history.peekPast()?.id).toBe('b')
    expect(history.peekFuture()?.id).toBe('c')
    expect(history.entries.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('redo syncRemote uses applyMutations', async () => {
    useHistoryStore().undo()
    await useHistory().redo()
    const arg = syncRemote.mock.calls[0]?.[0]
    expect(arg?.bodies[0]?.type).toBe('update-cell')
    expect(arg?.bodies[0]).toMatchObject({ value: 'B' })
  })

  it('does not move the stack while a workspace load is in flight', async () => {
    const token = useSessionStore().beginWorkspaceLoad()
    await useHistory().undo()
    expect(syncRemote).not.toHaveBeenCalled()
    expect(useHistoryStore().peekPast()?.id).toBe('m1')
    expect(useSessionStore().notice).toMatch(/finish loading/)
    useSessionStore().endWorkspaceLoad(token)
  })

  it('does not move the stack while write lock is held', async () => {
    const lock = useSessionStore().beginWriteLock()
    await useHistory().undo()
    expect(syncRemote).not.toHaveBeenCalled()
    expect(useHistoryStore().canUndo).toBe(true)
    expect(useSessionStore().notice).toMatch(/locked/)
    useSessionStore().endWriteLock(lock)
  })

  it('does not move the stack while transport pendingCount is active', async () => {
    const token = useHistoryStore().beginPending()
    expect(useHistoryStore().canUndo).toBe(false)
    await useHistory().undo()
    expect(syncRemote).not.toHaveBeenCalled()
    expect(useHistoryStore().peekPast()?.id).toBe('m1')
    expect(useSessionStore().notice).toMatch(/current change/)
    useHistoryStore().endPending(token)
  })

  it('refuses local-only undo without remote mutation bodies', async () => {
    const history = useHistoryStore()
    history.reset()
    history.record({
      id: 'local',
      type: 'update-cell',
      summary: 'local only',
      patches: entry('local').patches,
      inversePatches: entry('local').inversePatches,
      timestamp: 1,
    })
    await useHistory().undo()
    expect(syncRemote).not.toHaveBeenCalled()
    expect(history.peekPast()?.id).toBe('local')
    expect(useSessionStore().notice).toMatch(/local-only/)
  })

  it('refuses local-only redo without remote mutation bodies', async () => {
    const history = useHistoryStore()
    history.reset()
    history.record({
      id: 'local',
      type: 'update-cell',
      summary: 'local only',
      patches: entry('local').patches,
      inversePatches: entry('local').inversePatches,
      timestamp: 1,
    })
    history.undo()
    await useHistory().redo()
    expect(syncRemote).not.toHaveBeenCalled()
    expect(history.peekFuture()?.id).toBe('local')
    expect(useSessionStore().notice).toMatch(/local-only/)
  })
})
