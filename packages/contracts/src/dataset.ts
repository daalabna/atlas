import { z } from 'zod'
import { CellValueSchema, ColumnSchema } from './cell'

export const DatasetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().nonnegative(),
  columns: z.array(ColumnSchema),
  rowIds: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length, {
    message: 'rowIds must be unique',
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type DatasetDTO = z.infer<typeof DatasetSchema>

export const RowSchema = z.object({
  id: z.string().min(1),
  cells: z.record(z.string(), CellValueSchema),
})

export type RowDTO = z.infer<typeof RowSchema>

export const DatasetSnapshotSchema = z
  .object({
    dataset: DatasetSchema,
    rows: z.array(RowSchema),
  })
  .superRefine(({ dataset, rows }, ctx) => {
    const rowIds = new Set(rows.map((row) => row.id))
    if (rowIds.size !== rows.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows'],
        message: 'Row ids must be unique',
      })
    }
    if (dataset.rowIds.some((id) => !rowIds.has(id)) || rowIds.size !== dataset.rowIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataset', 'rowIds'],
        message: 'dataset.rowIds and rows must describe the same rows',
      })
    }
  })

export type DatasetSnapshotDTO = z.infer<typeof DatasetSnapshotSchema>
