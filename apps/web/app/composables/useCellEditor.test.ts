import { describe, expect, it } from 'vitest'
import type { Column } from '@atlas/domain'
import { validateCellValue } from './useCellEditor'

const selectCol: Column = {
  id: 'status',
  name: 'Status',
  type: 'select',
  width: 100,
  options: ['active', 'churned'],
}

const dateCol: Column = { id: 'joinedAt', name: 'Joined', type: 'date', width: 120 }

describe('validateCellValue', () => {
  it('rejects empty string for select columns', () => {
    expect(validateCellValue(selectCol, '')).toMatch(/select options/)
  })

  it('accepts listed select options', () => {
    expect(validateCellValue(selectCol, 'active')).toBeNull()
  })

  it('rejects non-calendar dates', () => {
    expect(validateCellValue(dateCol, '2023-02-29')).toMatch(/valid date/)
  })

  it('accepts real calendar dates', () => {
    expect(validateCellValue(dateCol, '2024-02-29')).toBeNull()
  })
})
