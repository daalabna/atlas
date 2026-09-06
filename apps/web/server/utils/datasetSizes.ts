export const DATASET_SIZES = [1_000, 10_000, 50_000, 100_000] as const

export type DatasetSize = (typeof DATASET_SIZES)[number]

export const DEFAULT_DATASET_SIZE: DatasetSize = 100_000

const datasetSizeSet = new Set<number>(DATASET_SIZES)

export const isDatasetSize = (value: number): value is DatasetSize => datasetSizeSet.has(value)
