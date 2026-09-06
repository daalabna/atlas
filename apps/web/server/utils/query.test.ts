import { describe, expect, it } from 'vitest'
import { parseDatasetQuery } from './query'
import { DATASET_SIZES } from './datasetSizes'

describe('parseDatasetQuery', () => {
  it('normalizes allowed sizes to numbers', () => {
    for (const size of DATASET_SIZES) {
      expect(parseDatasetQuery({ size: String(size) }).size).toBe(size)
      expect(parseDatasetQuery({ size }).size).toBe(size)
    }
  })

  it('rejects unknown sizes with 400', () => {
    expect(() => parseDatasetQuery({ size: '999' })).toThrow()
  })

  it('keeps only known simulate modes', () => {
    expect(parseDatasetQuery({ simulate: 'conflict' }).simulate).toBe('conflict')
    expect(parseDatasetQuery({ simulate: 'nope' }).simulate).toBeUndefined()
  })

  it('rejects non-primitive size', () => {
    expect(() => parseDatasetQuery({ size: { bad: true } })).toThrow()
  })
})
