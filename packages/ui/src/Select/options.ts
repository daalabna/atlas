export type SelectOption = { value: string; label: string }

export const selectOptions = (values: string[]): SelectOption[] =>
  values.map((value) => ({ value, label: value }))

export const booleanSelectOptions = (): SelectOption[] => [
  { value: 'true', label: 'true' },
  { value: 'false', label: 'false' },
]
