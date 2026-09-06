import { z } from 'zod'
import { CellValueSchema } from './cell'

export const MutationTypeSchema = z.enum([
  'update-cell',
  'update-cells',
  'insert-row',
  'delete-rows',
  'bulk-update',
])

export type MutationTypeDTO = z.infer<typeof MutationTypeSchema>

export const UpdateCellRequestSchema = z.object({
  type: z.literal('update-cell'),
  rowId: z.string().min(1),
  columnId: z.string().min(1),
  value: CellValueSchema,
  expectedVersion: z.number().int().nonnegative(),
  mutationId: z.string().min(1).optional(),
})

export const UpdateCellsRequestSchema = z.object({
  type: z.literal('update-cells'),
  cells: z.array(
    z.object({
      rowId: z.string().min(1),
      columnId: z.string().min(1),
      value: CellValueSchema,
    }),
  ).min(1),
  expectedVersion: z.number().int().nonnegative(),
  mutationId: z.string().min(1).optional(),
})

export const InsertRowRequestSchema = z.object({
  type: z.literal('insert-row'),
  rowId: z.string().min(1).optional(),
  cells: z.record(z.string(), CellValueSchema),
  index: z.number().int().nonnegative().optional(),
  expectedVersion: z.number().int().nonnegative(),
  mutationId: z.string().min(1).optional(),
})

export const DeleteRowsRequestSchema = z.object({
  type: z.literal('delete-rows'),
  rowIds: z.array(z.string().min(1)).min(1),
  expectedVersion: z.number().int().nonnegative(),
  mutationId: z.string().min(1).optional(),
})

export const BulkUpdateRequestSchema = z.object({
  type: z.literal('bulk-update'),
  rowIds: z.array(z.string().min(1)).min(1),
  columnId: z.string().min(1),
  value: CellValueSchema,
  expectedVersion: z.number().int().nonnegative(),
  mutationId: z.string().min(1).optional(),
})

const BaseMutationRequestSchema = z.discriminatedUnion('type', [
  UpdateCellRequestSchema,
  UpdateCellsRequestSchema,
  InsertRowRequestSchema,
  DeleteRowsRequestSchema,
  BulkUpdateRequestSchema,
])

export const MutationRequestSchema = BaseMutationRequestSchema.superRefine((request, context) => {
  const keys =
    request.type === 'update-cells'
      ? request.cells.map((cell) => `${cell.rowId}\0${cell.columnId}`)
      : request.type === 'delete-rows' || request.type === 'bulk-update'
        ? request.rowIds
        : null
  if (keys && new Set(keys).size !== keys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Mutation targets must be unique',
    })
  }
})

export type MutationRequestDTO = z.infer<typeof MutationRequestSchema>

export const MutationResponseSchema = z.object({
  version: z.number().int().nonnegative(),
  mutationId: z.string(),
  appliedAt: z.string().datetime(),
})

export type MutationResponseDTO = z.infer<typeof MutationResponseSchema>
