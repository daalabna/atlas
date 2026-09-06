import { describe, expect, it } from 'vitest'
import { apiStatusMessage } from './httpError'

describe('apiStatusMessage', () => {
  it('maps known dataset error statuses', () => {
    expect(apiStatusMessage(404)).toBe('NOT_FOUND')
    expect(apiStatusMessage(400)).toBe('VALIDATION_ERROR')
    expect(apiStatusMessage(409)).toBe('VERSION_CONFLICT')
    expect(apiStatusMessage(500)).toBe('INTERNAL_ERROR')
    expect(apiStatusMessage(undefined)).toBe('INTERNAL_ERROR')
  })
})
