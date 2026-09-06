type IdleScheduler = {
  requestIdleCallback?: (callback: () => void) => number
  cancelIdleCallback?: (handle: number) => void
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}

/** Schedule low-priority work and return a cleanup that prevents it from running. */
export const scheduleIdleTask = (callback: () => void): (() => void) => {
  const idleGlobal = globalThis as typeof globalThis & IdleScheduler
  let active = true

  const run = () => {
    if (!active) return
    active = false
    callback()
  }

  if (typeof idleGlobal.requestIdleCallback === 'function') {
    const handle = idleGlobal.requestIdleCallback(run)
    return () => {
      active = false
      idleGlobal.cancelIdleCallback?.(handle)
    }
  }

  const handle = idleGlobal.setTimeout(run, 1)
  return () => {
    active = false
    idleGlobal.clearTimeout(handle)
  }
}
