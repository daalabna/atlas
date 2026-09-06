// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduleIdleTask } from './idleTask'

describe('scheduleIdleTask', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('runs the timeout fallback when idle callbacks are unavailable', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    scheduleIdleTask(callback)
    expect(callback).not.toHaveBeenCalled()
    vi.runAllTimers()

    expect(callback).toHaveBeenCalledOnce()
  })

  it('cancels the timeout fallback before the task runs', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    const cancel = scheduleIdleTask(callback)
    cancel()
    vi.runAllTimers()

    expect(callback).not.toHaveBeenCalled()
  })

  it('cancels a pending idle callback and ignores a stale invocation', () => {
    let pending: (() => void) | undefined
    const cancelIdleCallback = vi.fn()
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => {
      pending = callback
      return 42
    }))
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback)
    const callback = vi.fn()

    const cancel = scheduleIdleTask(callback)
    cancel()
    pending?.()

    expect(cancelIdleCallback).toHaveBeenCalledWith(42)
    expect(callback).not.toHaveBeenCalled()
  })
})
