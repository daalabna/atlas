import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHistoryStore } from './history'

describe('history pending operations', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('clears pending tokens on reset so undo is not stuck', () => {
    const history = useHistoryStore()
    history.beginPending()
    history.beginPending()
    expect(history.pendingCount).toBe(2)

    history.reset()
    expect(history.pendingCount).toBe(0)
  })

  it('resetStack clears entries but keeps pending tokens', () => {
    const history = useHistoryStore()
    history.beginPending()
    history.resetStack()
    expect(history.pendingCount).toBe(1)
    expect(history.entries).toHaveLength(0)
  })

  it('ignores endPending for tokens issued before reset', () => {
    const history = useHistoryStore()
    const oldToken = history.beginPending()
    history.reset()
    const newToken = history.beginPending()

    history.endPending(oldToken)
    expect(history.pendingCount).toBe(1)
    expect(history.canUndo).toBe(false)

    history.endPending(newToken)
    expect(history.pendingCount).toBe(0)
  })
})
