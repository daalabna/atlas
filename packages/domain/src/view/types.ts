import type {
  FilterDTO,
  FilterOperatorDTO,
  SortRuleDTO,
  ViewDTO,
} from '@atlas/contracts'

/** Domain aliases — single source of truth is Zod in `@atlas/contracts`. */
export type FilterOperator = FilterOperatorDTO
export type Filter = FilterDTO
export type SortRule = SortRuleDTO
export type View = ViewDTO

export {
  FilterOperatorSchema,
  FilterSchema,
  SortRuleSchema,
  ViewSchema,
} from '@atlas/contracts'
