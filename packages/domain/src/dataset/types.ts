import type { CellValueDTO, ColumnDTO, DatasetDTO, RowDTO } from '@atlas/contracts'

export type DatasetId = string
export type RowId = string
export type ColumnId = string

export type ColumnType = ColumnDTO['type']
export type CellValue = CellValueDTO
export type Column = ColumnDTO
export type Dataset = DatasetDTO
export type Row = RowDTO

export interface NormalizedDataset {
  dataset: Dataset
  rowsById: Record<RowId, Row>
}
