import { describe, expect, it } from 'vitest'
import { createRestoreScope, shouldInvertStrandedAfterHeal } from './restoreScope'

describe('createRestoreScope', () => {
  it('latches inactive even if session later returns to the restoring dataset', () => {
    let current = true
    const { scopeIsActive } = createRestoreScope(() => current)
    expect(scopeIsActive()).toBe(true)
    current = false
    expect(scopeIsActive()).toBe(false)
    current = true
    expect(scopeIsActive()).toBe(false)
  })
})

describe('shouldInvertStrandedAfterHeal', () => {
  it('inverts only when heal never committed', () => {
    expect(shouldInvertStrandedAfterHeal('failed')).toBe(true)
    expect(shouldInvertStrandedAfterHeal('committed')).toBe(false)
    expect(shouldInvertStrandedAfterHeal('applied-snapshot')).toBe(false)
    expect(shouldInvertStrandedAfterHeal('left')).toBe(false)
  })
})
