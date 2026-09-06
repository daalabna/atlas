import { createError } from 'h3'
import { z } from 'zod'
import { DATASET_SIZES, isDatasetSize, type DatasetSize } from './datasetSizes'

/** Shared dataset query params at the Nitro HTTP boundary. */
export const DatasetQuerySchema = z.object({
  size: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, ctx): DatasetSize | undefined => {
      if (value === undefined) return undefined
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n) || !isDatasetSize(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `size must be one of ${DATASET_SIZES.join(', ')}`,
        })
        return z.NEVER
      }
      return n
    }),
  simulate: z
    .string()
    .optional()
    .transform((value) =>
      value === 'conflict' || value === 'error' || value === 'slow' ? value : undefined,
    ),
})

export type DatasetQuery = z.infer<typeof DatasetQuerySchema>

export const parseDatasetQuery = (query: unknown): DatasetQuery => {
  const result = DatasetQuerySchema.safeParse(query)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'VALIDATION_ERROR',
      data: {
        code: 'VALIDATION_ERROR',
        message: result.error.issues[0]?.message ?? 'Invalid query',
      },
    })
  }
  return result.data
}
