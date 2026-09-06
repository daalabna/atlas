import { describe, expect, it } from 'vitest'
import { GRID_HEADER_HEIGHT, gridBodyViewportHeight } from './gridLayout'

describe('gridBodyViewportHeight', () => {
  it('subtracts the sticky header and never goes negative', () => {
    expect(gridBodyViewportHeight(640)).toBe(640 - GRID_HEADER_HEIGHT)
    expect(gridBodyViewportHeight(GRID_HEADER_HEIGHT)).toBe(0)
    expect(gridBodyViewportHeight(10)).toBe(0)
  })
})
