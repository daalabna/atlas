import type { DatasetDTO, RowDTO } from '@atlas/contracts'
import type { Dataset, NormalizedDataset, Row, RowId } from './types'
export const datasetFromDTO = (dto: DatasetDTO): Dataset => {
  return {
    id: dto.id,
    name: dto.name,
    version: dto.version,
    columns: dto.columns.map((column) => ({
      id: column.id,
      name: column.name,
      type: column.type,
      width: column.width,
      options: column.options,
    })),
    rowIds: [...dto.rowIds],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}
export const normalizeRows = (rows: RowDTO[]): Record<RowId, Row> => {
  const rowsById: Record<RowId, Row> = Object.create(null)
  for (const row of rows) {
    rowsById[row.id] = {
      id: row.id,
      cells: { ...row.cells },
    }
  }
  return rowsById
}
export const snapshotToNormalized = (dataset: DatasetDTO, rows: RowDTO[]): NormalizedDataset => {
  return {
    dataset: datasetFromDTO(dataset),
    rowsById: normalizeRows(rows),
  }
}
export const emptyCellValue = (type: Dataset['columns'][number]['type']): Row['cells'][string] => {
  switch (type) {
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'select':
      return null
    default:
      return ''
  }
}
