import type { CellValue } from '@atlas/domain'

export const parseNumberInput = (raw: string): CellValue => {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}
