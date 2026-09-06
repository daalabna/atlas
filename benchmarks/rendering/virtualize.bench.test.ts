import { describe, expect, it } from 'vitest'
import { virtualizeRows } from '@atlas/virtual-grid'
import { filterRowIds } from '@atlas/data-engine'
import { applyPatches } from '@atlas/history-engine'
import type { Row } from '@atlas/domain'
const rows = (count: number): Record<string, Row> => {
  const rowsById: Record<string, Row> = Object.create(null)
  for (let i = 0; i < count; i++) {
    rowsById[`row-${i}`] = { id: `row-${i}`, cells: { name: `n${i}`, score: i } }
  }
  return rowsById
}
describe('benchmarks', () => {
  it('virtualizes 100k rows to a small window', () => {
    const started = performance.now()
    const window = virtualizeRows({
      count: 100000,
      rowHeight: 32,
      viewportHeight: 800,
      scrollTop: 48000,
      overscan: 8,
    })
    const duration = performance.now() - started
    expect(window.visibleCount).toBeLessThan(50)
    expect(duration).toBeLessThan(20)
    console.log(`virtualize 100k: ${duration.toFixed(2)}ms, rendered=${window.visibleCount}`)
  })
  it('filters 100k rows', () => {
    const rowsById = rows(100000)
    const ids = Object.keys(rowsById)
    const started = performance.now()
    const result = filterRowIds(ids, rowsById, [
      { id: 'f', columnId: 'score', operator: 'gt', value: 99000 },
    ])
    const duration = performance.now() - started
    expect(result.length).toBeGreaterThan(0)
    console.log(`filter 100k: ${duration.toFixed(2)}ms, matches=${result.length}`)
  })
  it('applies a cell patch on a 100k map', () => {
    const rowsById = rows(100000)
    const started = performance.now()
    applyPatches({ rowsById }, [
      { path: ['rowsById', 'row-12', 'cells', 'name'], oldValue: 'n12', newValue: 'patched' },
    ])
    const duration = performance.now() - started
    expect(duration).toBeLessThan(250)
    console.log(`patch 100k map: ${duration.toFixed(2)}ms`)
  })
})
