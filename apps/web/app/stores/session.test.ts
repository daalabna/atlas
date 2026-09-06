// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from './session'

describe('session write lock', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.useRealTimers())

  it('remains locked until every owner releases its own token', () => {
    const session = useSessionStore()
    const restore = session.beginWriteLock()
    const other = session.beginWriteLock()
    expect(session.writesBlocked).toBe(true)

    session.endWriteLock(restore)
    expect(session.writesBlocked).toBe(true)
    session.endWriteLock(other)
    expect(session.writesBlocked).toBe(false)
  })

  it('workspaceLoading stays true until every load token is released', () => {
    const session = useSessionStore()
    const first = session.beginWorkspaceLoad()
    const second = session.beginWorkspaceLoad()
    expect(session.workspaceLoading).toBe(true)
    session.endWorkspaceLoad(first)
    expect(session.workspaceLoading).toBe(true)
    session.endWorkspaceLoad(second)
    expect(session.workspaceLoading).toBe(false)
  })

  it('gives a repeated identical notice a fresh display interval', () => {
    vi.useFakeTimers()
    const session = useSessionStore()

    session.flash('Still working')
    vi.advanceTimersByTime(2_000)
    session.flash('Still working')
    vi.advanceTimersByTime(1_200)

    expect(session.notice).toBe('Still working')

    vi.advanceTimersByTime(2_000)
    expect(session.notice).toBeNull()
  })
})
