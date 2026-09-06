import { z } from 'zod'

export const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export type CellValueDTO = z.infer<typeof CellValueSchema>

export const ColumnTypeSchema = z.enum(['text', 'number', 'boolean', 'date', 'select'])

export type ColumnTypeDTO = z.infer<typeof ColumnTypeSchema>

export const ColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: ColumnTypeSchema,
  width: z.number().positive(),
  options: z.array(z.string()).optional(),
})

export type ColumnDTO = z.infer<typeof ColumnSchema>
