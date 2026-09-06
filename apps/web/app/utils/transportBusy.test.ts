import { describe, expect, it } from 'vitest'
import { isTransportBusy } from './transportBusy'

describe('isTransportBusy', () => {
  it('matches toolbar / restore gating', () => {
    expect(
      isTransportBusy({ writesBlocked: false, workspaceLoading: false, pendingCount: 0 }),
    ).toBe(false)
    expect(
      isTransportBusy({ writesBlocked: true, workspaceLoading: false, pendingCount: 0 }),
    ).toBe(true)
    expect(
      isTransportBusy({ writesBlocked: false, workspaceLoading: true, pendingCount: 0 }),
    ).toBe(true)
    expect(
      isTransportBusy({ writesBlocked: false, workspaceLoading: false, pendingCount: 1 }),
    ).toBe(true)
  })
})
