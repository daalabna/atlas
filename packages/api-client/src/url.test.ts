import { describe, expect, it } from 'vitest'
import { withSize } from './url'

describe('withSize', () => {
  it('leaves path unchanged when size is omitted', () => {
    expect(withSize('/api/datasets/x')).toBe('/api/datasets/x')
  })

  it('appends size with the correct separator', () => {
    expect(withSize('/api/datasets/x', 1000)).toBe('/api/datasets/x?size=1000')
    expect(withSize('/api/datasets/x?foo=1', 1000)).toBe('/api/datasets/x?foo=1&size=1000')
  })
})
