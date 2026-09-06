import { describe, expect, it } from 'vitest'
import { virtualizeRows } from './virtualizer'

describe('virtualizeRows', () => {
  it('renders a small window for 100k rows', () => {
    const window = virtualizeRows({
      count: 100_000,
      rowHeight: 32,
      viewportHeight: 800,
      scrollTop: 0,
      overscan: 8,
    })

    expect(window.totalHeight).toBe(3_200_000)
    expect(window.startIndex).toBe(0)
    expect(window.visibleCount).toBeLessThan(50)
    expect(window.endIndex).toBeLessThan(50)
  })

  it('returns an empty window when scroll is beyond a shortened dataset', () => {
    expect(
      virtualizeRows({ count: 10, rowHeight: 32, viewportHeight: 320, scrollTop: 10_000 }),
    ).toMatchObject({ startIndex: 10, endIndex: 10, visibleCount: 0 })
  })
})
