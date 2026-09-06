import { describe, expect, it } from 'vitest'
import { addRange, collectSelectedIds, containsIndex, selectedCount, toggleIndex } from './types'

describe('range selection', () => {
  it('represents 50k selected rows as a single interval', () => {
    const ranges = addRange([], { start: 0, end: 49_999 })
    expect(ranges).toEqual([{ start: 0, end: 49_999 }])
    expect(selectedCount(ranges)).toBe(50_000)
    expect(containsIndex(ranges, 12_345)).toBe(true)
  })

  it('toggles a single index out of a dense range', () => {
    const next = toggleIndex([{ start: 0, end: 4 }], 2)
    expect(next).toEqual([
      { start: 0, end: 1 },
      { start: 3, end: 4 },
    ])
  })

  it('collects row ids from ranges without a separate index array API', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    expect(collectSelectedIds([{ start: 1, end: 3 }], ids)).toEqual(['b', 'c', 'd'])
  })
})
