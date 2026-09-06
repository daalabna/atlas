export const createLoadGeneration = () => {
  let current = 0
  const next = () => {
    current += 1
    const generation = current
    return {
      generation,
      isStale: () => generation !== current,
    }
  }
  return { next }
}

/** Abort side effects only if this load still owns the failed switch target. */
export const shouldRunSwitchAbort = (input: {
  isStale: boolean
  isSwitch: boolean
  sessionId: string
  sessionSize: number
  requestedId: string
  requestedSize: number
}) =>
  !input.isStale &&
  input.isSwitch &&
  input.sessionId === input.requestedId &&
  input.sessionSize === input.requestedSize

/** Revert the URL only while it still shows the failed target — never yank a later route. */
export const shouldRevertFailedSwitchRoute = (input: {
  previousId: string
  requestedId: string
  routeId: string
}) => input.previousId !== input.requestedId && input.routeId === input.requestedId

/**
 * Pinia still holds the snapshot this scope mutated — safe to bump version or
 * invert leave-scope patches. Never write onto a newer committed dataset.
 */
export const piniaHoldsScopeSnapshot = (input: {
  piniaDatasetId: string | undefined
  piniaVersion: number
  scopeDatasetId: string
  versionAtApply: number
}) =>
  input.piniaDatasetId === input.scopeDatasetId && input.piniaVersion === input.versionAtApply

export const shouldRollbackLeftScopePatches = piniaHoldsScopeSnapshot
