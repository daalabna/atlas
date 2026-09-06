import { z } from 'zod'
import { MutationTypeSchema } from './mutation'

export const VersionEntrySchema = z.object({
  id: z.string(),
  version: z.number().int().nonnegative(),
  type: MutationTypeSchema,
  summary: z.string(),
  timestamp: z.string(),
  mutationId: z.string(),
})

export type VersionEntryDTO = z.infer<typeof VersionEntrySchema>

export const VersionHistorySchema = z.object({
  datasetId: z.string(),
  currentVersion: z.number().int().nonnegative(),
  entries: z.array(VersionEntrySchema),
})

export type VersionHistoryDTO = z.infer<typeof VersionHistorySchema>

export const RestoreRequestSchema = z.object({
  targetVersion: z.number().int().min(1),
  expectedVersion: z.number().int().nonnegative(),
})

export type RestoreRequestDTO = z.infer<typeof RestoreRequestSchema>
