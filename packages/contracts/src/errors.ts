import { z } from 'zod'
import { CellValueSchema } from './cell'

export const ConflictResponseSchema = z.object({
  code: z.literal('VERSION_CONFLICT'),
  currentVersion: z.number().int().nonnegative(),
  serverValue: CellValueSchema.optional(),
  message: z.string(),
})

export type ConflictResponseDTO = z.infer<typeof ConflictResponseSchema>

export const ApiErrorSchema = z.object({
  code: z.enum([
    'INTERNAL_ERROR',
    'NOT_FOUND',
    'VALIDATION_ERROR',
    'VERSION_CONFLICT',
    'RESTORE_INCOMPLETE',
  ]),
  message: z.string(),
  details: z.unknown().optional(),
})

export type ApiErrorDTO = z.infer<typeof ApiErrorSchema>
