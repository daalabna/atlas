import { describe, expect, it } from 'vitest'
import { resolveMutationSimulate } from '../../apps/web/server/utils/simulate'

describe('resolveMutationSimulate', () => {
  it('allows known modes outside production', () => {
    expect(resolveMutationSimulate('conflict', false)).toBe('conflict')
    expect(resolveMutationSimulate('error', false)).toBe('error')
    expect(resolveMutationSimulate('slow', false)).toBe('slow')
    expect(resolveMutationSimulate('nope', false)).toBe('')
  })

  it('ignores all modes in production', () => {
    expect(resolveMutationSimulate('conflict', true)).toBe('')
    expect(resolveMutationSimulate('error', true)).toBe('')
    expect(resolveMutationSimulate('slow', true)).toBe('')
  })
})
