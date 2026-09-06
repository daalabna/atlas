import { describe, expect, it } from 'vitest'
import { isValidCalendarDate } from '#shared/utils/calendarDate'

describe('isValidCalendarDate', () => {
  it('accepts real calendar days in YYYY-MM-DD', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true)
    expect(isValidCalendarDate('2023-01-31')).toBe(true)
  })

  it('rejects non-existent calendar days that Date.parse would accept', () => {
    expect(isValidCalendarDate('2023-02-29')).toBe(false)
    expect(isValidCalendarDate('2024-02-30')).toBe(false)
    expect(isValidCalendarDate('2024-13-01')).toBe(false)
  })

  it('rejects non ISO-date shapes', () => {
    expect(isValidCalendarDate('02/29/2024')).toBe(false)
    expect(isValidCalendarDate('not-a-date')).toBe(false)
  })
})
