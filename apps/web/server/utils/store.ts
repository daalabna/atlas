import type { Dataset, Row, View } from '@atlas/domain'
import type { MutationRequestDTO } from '@atlas/contracts'
import { applyPatches, type Patch } from '@atlas/history-engine'
import { DATASET_COLUMNS, generateDataset } from './generate'
import { DEFAULT_DATASET_SIZE } from './datasetSizes'

export interface ServerMutation {
  id: string
  version: number
  type: MutationRequestDTO['type']
  summary: string
  timestamp: string
  mutationId: string
  requestFingerprint: string
  patches: Patch[]
  inversePatches: Patch[]
}

export interface DatasetMemory {
  dataset: Dataset
  rowsById: Record<string, Row>
  mutations: ServerMutation[]
  views: View[]
}

const memories = new Map<string, DatasetMemory>()

const now = () => new Date().toISOString()

export const getOrCreateDataset = (id: string, sizeArg?: number): DatasetMemory => {
  const size = sizeArg ?? DEFAULT_DATASET_SIZE
  const key = JSON.stringify([id, size])
  const existing = memories.get(key)
  if (existing) return existing
  const generated = generateDataset(size)
  const createdAt = now()
  const memory: DatasetMemory = {
    dataset: {
      id,
      name: `Customers (${size.toLocaleString('en-US')} records)`,
      version: 1,
      columns: DATASET_COLUMNS,
      rowIds: generated.rowIds,
      createdAt,
      updatedAt: createdAt,
    },
    rowsById: generated.rowsById,
    mutations: [],
    views: defaultViews(DATASET_COLUMNS.map((c) => c.id)),
  }
  memories.set(key, memory)
  return memory
}

export const resetMemories = () => {
  memories.clear()
}

const defaultViews = (visibleColumns: string[]): View[] => [
  {
    id: 'all',
    name: 'All records',
    filters: [],
    sorting: [],
    visibleColumns,
    columnWidths: {},
  },
  {
    id: 'active',
    name: 'Active users',
    filters: [{ id: 'f-active', columnId: 'status', operator: 'equals', value: 'active' }],
    sorting: [{ columnId: 'score', direction: 'desc' }],
    visibleColumns,
    columnWidths: {},
  },
  {
    id: 'recent',
    name: 'Recently updated',
    filters: [],
    sorting: [{ columnId: 'joinedAt', direction: 'desc' }],
    visibleColumns,
    columnWidths: {},
  },
  {
    id: 'priority',
    name: 'High priority',
    filters: [{ id: 'f-priority', columnId: 'priority', operator: 'equals', value: 'high' }],
    sorting: [{ columnId: 'score', direction: 'desc' }],
    visibleColumns,
    columnWidths: {},
  },
]

export const restoreToVersion = (
  memory: DatasetMemory,
  targetVersion: number,
  expectedVersion: number,
) => {
  if (expectedVersion !== memory.dataset.version) {
    throw Object.assign(new Error('VERSION_CONFLICT'), {
      statusCode: 409,
      data: {
        code: 'VERSION_CONFLICT',
        currentVersion: memory.dataset.version,
        message: 'Cannot restore: version moved',
      },
    })
  }
  if (targetVersion < 1 || targetVersion >= memory.dataset.version) {
    throw Object.assign(new Error('VALIDATION_ERROR'), {
      statusCode: 400,
      data: { code: 'VALIDATION_ERROR', message: 'Invalid target version' },
    })
  }
  // Work on copies so applyPatches throw / short log cannot leave memory half-restored.
  let rowsById = memory.rowsById
  let rowIds = memory.dataset.rowIds
  let version = memory.dataset.version
  const log = memory.mutations.slice()
  while (version > targetVersion) {
    const entry = log.at(-1)
    if (!entry) {
      throw Object.assign(new Error(`Cannot restore to v${targetVersion}: mutation log is incomplete`), {
        statusCode: 500,
        data: {
          code: 'RESTORE_INCOMPLETE',
          message: `Cannot restore to v${targetVersion}: mutation log is incomplete`,
        },
      })
    }
    const next = applyPatches({ rowsById, rowIds }, entry.inversePatches)
    rowsById = next.rowsById as Record<string, Row>
    rowIds = next.rowIds as string[]
    version = entry.version - 1
    log.pop()
  }
  memory.rowsById = rowsById
  memory.dataset.rowIds = rowIds
  memory.dataset.version = version
  memory.mutations = log
  memory.dataset.updatedAt = now()
  return memory
}

export const snapshot = (memory: DatasetMemory) => {
  const rowIds = memory.dataset.rowIds.filter((id) => Boolean(memory.rowsById[id]))
  const rows = rowIds.map((id) => memory.rowsById[id]).filter((row): row is Row => Boolean(row))
  return {
    dataset:
      rowIds.length === memory.dataset.rowIds.length
        ? memory.dataset
        : { ...memory.dataset, rowIds },
    rows,
  }
}
