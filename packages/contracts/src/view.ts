import { z } from 'zod'

export const FilterOperatorSchema = z.enum([
  'equals',
  'not-equals',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'is-true',
  'is-false',
  'is-empty',
])

export type FilterOperatorDTO = z.infer<typeof FilterOperatorSchema>

export const FilterSchema = z.object({
  id: z.string().min(1),
  columnId: z.string().min(1),
  operator: FilterOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
})

export const SortRuleSchema = z.object({
  columnId: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
})

export const ViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  filters: z.array(FilterSchema),
  sorting: z.array(SortRuleSchema),
  visibleColumns: z.array(z.string().min(1)),
  columnWidths: z.record(z.string().min(1), z.number().finite().min(0)),
})

export type FilterDTO = z.infer<typeof FilterSchema>
export type SortRuleDTO = z.infer<typeof SortRuleSchema>
export type ViewDTO = z.infer<typeof ViewSchema>
