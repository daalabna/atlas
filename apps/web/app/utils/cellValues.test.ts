import { describe, expect, it } from 'vitest'
import { parseNumberInput } from './cellValues'

describe('parseNumberInput', () => {
  it('preserves valid numbers and maps an empty input to null', () => {
    expect(parseNumberInput('42.5')).toBe(42.5)
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('   ')).toBeNull()
  })
})
