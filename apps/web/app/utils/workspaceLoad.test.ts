import { describe, expect, it } from 'vitest'
import {
  createLoadGeneration,
  shouldRevertFailedSwitchRoute,
  shouldRollbackLeftScopePatches,
  shouldRunSwitchAbort,
} from './workspaceLoad'

describe('createLoadGeneration', () => {
  it('marks an older load stale after a newer one starts', () => {
    const gen = createLoadGeneration()
    const first = gen.next()
    expect(first.isStale()).toBe(false)
    const second = gen.next()
    expect(first.isStale()).toBe(true)
    expect(second.isStale()).toBe(false)
  })
})

describe('shouldRunSwitchAbort', () => {
  const base = {
    isStale: false,
    isSwitch: true,
    sessionId: 'orders',
    sessionSize: 10_000,
    requestedId: 'orders',
    requestedSize: 10_000,
  }

  it('runs only while this switch still owns the session', () => {
    expect(shouldRunSwitchAbort(base)).toBe(true)
    expect(shouldRunSwitchAbort({ ...base, isStale: true })).toBe(false)
    expect(shouldRunSwitchAbort({ ...base, sessionId: 'customers' })).toBe(false)
    expect(shouldRunSwitchAbort({ ...base, isSwitch: false })).toBe(false)
  })
})

describe('shouldRevertFailedSwitchRoute', () => {
  it('reverts only when the URL is still the failed target', () => {
    expect(
      shouldRevertFailedSwitchRoute({
        previousId: 'customers',
        requestedId: 'orders',
        routeId: 'orders',
      }),
    ).toBe(true)
    expect(
      shouldRevertFailedSwitchRoute({
        previousId: 'customers',
        requestedId: 'orders',
        routeId: 'invoices',
      }),
    ).toBe(false)
    expect(
      shouldRevertFailedSwitchRoute({
        previousId: 'customers',
        requestedId: 'customers',
        routeId: 'customers',
      }),
    ).toBe(false)
  })
})

describe('shouldRollbackLeftScopePatches', () => {
  it('rolls back only while Pinia still holds the undo snapshot', () => {
    expect(
      shouldRollbackLeftScopePatches({
        piniaDatasetId: 'customers',
        piniaVersion: 2,
        scopeDatasetId: 'customers',
        versionAtApply: 2,
      }),
    ).toBe(true)
    expect(
      shouldRollbackLeftScopePatches({
        piniaDatasetId: 'orders',
        piniaVersion: 2,
        scopeDatasetId: 'customers',
        versionAtApply: 2,
      }),
    ).toBe(false)
    expect(
      shouldRollbackLeftScopePatches({
        piniaDatasetId: 'customers',
        piniaVersion: 5,
        scopeDatasetId: 'customers',
        versionAtApply: 2,
      }),
    ).toBe(false)
  })
})
