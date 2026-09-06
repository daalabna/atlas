import type { MutationRequestDTO } from '@atlas/contracts'
import type { Row } from '@atlas/domain'
import type { Patch } from '@atlas/history-engine'
import { isValidCalendarDate } from '#shared/utils/calendarDate'
import type { DatasetMemory, ServerMutation } from './store'

type MutationOf<T extends MutationRequestDTO['type']> = Extract<MutationRequestDTO, { type: T }>
export interface MutationMetadata {
  mutationId: string
  requestFingerprint: string
}
const cloneRow = (row: Row): Row => ({ id: row.id, cells: { ...row.cells } })

export const validationError = (message: string) =>
  Object.assign(new Error(message), {
    name: 'ValidationError',
    statusCode: 400,
    data: { code: 'VALIDATION_ERROR', message },
  })
const notFound = (id: string) =>
  Object.assign(new Error(`Row ${id} not found`), {
    statusCode: 404,
    data: { code: 'NOT_FOUND', message: `Row ${id} not found` },
  })
const validateCell = (memory: DatasetMemory, columnId: string, value: unknown) => {
  const column = memory.dataset.columns.find((item) => item.id === columnId)
  if (!column) throw validationError(`Unknown column ${columnId}`)
  if (value === null) return
  const valid =
    (column.type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (column.type === 'boolean' && typeof value === 'boolean') ||
    ((column.type === 'text' || column.type === 'date' || column.type === 'select') &&
      typeof value === 'string')
  if (!valid) throw validationError(`Invalid value for ${column.type} column ${columnId}`)
  if (column.type === 'select' && column.options && !column.options.includes(String(value))) {
    throw validationError(`Value is not an option for column ${columnId}`)
  }
  if (column.type === 'date' && value !== '' && !isValidCalendarDate(String(value))) {
    throw validationError(`Invalid date for column ${columnId}`)
  }
}
const record = (
  memory: DatasetMemory,
  body: MutationRequestDTO,
  meta: MutationMetadata,
  summary: string,
  patches: Patch[],
  inversePatches: Patch[],
) => {
  memory.dataset.version += 1
  memory.dataset.updatedAt = new Date().toISOString()
  memory.mutations.push({
    id: crypto.randomUUID(),
    type: body.type,
    summary,
    ...meta,
    patches,
    inversePatches,
    version: memory.dataset.version,
    timestamp: memory.dataset.updatedAt,
  } satisfies ServerMutation)
}

const updateCell = (
  memory: DatasetMemory,
  body: MutationOf<'update-cell'>,
  meta: MutationMetadata,
) => {
  const row = memory.rowsById[body.rowId]
  if (!row) throw notFound(body.rowId)
  validateCell(memory, body.columnId, body.value)
  const oldValue = row.cells[body.columnId] ?? null
  const path: Patch['path'] = ['rowsById', body.rowId, 'cells', body.columnId]
  const patches: Patch[] = [{ path, oldValue, newValue: body.value }]
  const inverse: Patch[] = [{ path, oldValue: body.value, newValue: oldValue }]
  memory.rowsById[body.rowId] = { ...row, cells: { ...row.cells, [body.columnId]: body.value } }
  record(
    memory,
    body,
    meta,
    `${body.rowId}.${body.columnId}: ${String(oldValue)} → ${String(body.value)}`,
    patches,
    inverse,
  )
}

const updateCells = (
  memory: DatasetMemory,
  body: MutationOf<'update-cells'> | MutationOf<'bulk-update'>,
  meta: MutationMetadata,
) => {
  const cells =
    body.type === 'bulk-update'
      ? body.rowIds.map((rowId) => ({ rowId, columnId: body.columnId, value: body.value }))
      : body.cells
  if (!cells.length) throw validationError('No cells to update')
  for (const cell of cells) {
    if (!memory.rowsById[cell.rowId]) throw notFound(cell.rowId)
    validateCell(memory, cell.columnId, cell.value)
  }
  const patches: Patch[] = []
  const inverse: Patch[] = []
  for (const cell of cells) {
    const row = memory.rowsById[cell.rowId]!
    const oldValue = row.cells[cell.columnId] ?? null
    const path: Patch['path'] = ['rowsById', cell.rowId, 'cells', cell.columnId]
    patches.push({ path, oldValue, newValue: cell.value })
    inverse.unshift({ path, oldValue: cell.value, newValue: oldValue })
    memory.rowsById[cell.rowId] = { ...row, cells: { ...row.cells, [cell.columnId]: cell.value } }
  }
  record(memory, body, meta, `Updated ${cells.length} cells`, patches, inverse)
}

const insertRow = (
  memory: DatasetMemory,
  body: MutationOf<'insert-row'>,
  meta: MutationMetadata,
) => {
  const rowId = body.rowId ?? `row-${crypto.randomUUID().slice(0, 8)}`
  if (memory.rowsById[rowId]) throw validationError(`Row ${rowId} already exists`)
  for (const [columnId, value] of Object.entries(body.cells)) validateCell(memory, columnId, value)
  const row: Row = { id: rowId, cells: body.cells }
  const previousIds = [...memory.dataset.rowIds]
  const index = Math.min(body.index ?? previousIds.length, previousIds.length)
  const nextIds = [...previousIds.slice(0, index), rowId, ...previousIds.slice(index)]
  const copy = cloneRow(row)
  const patches: Patch[] = [
    { path: ['rowIds'], oldValue: previousIds, newValue: nextIds },
    { path: ['rowsById', rowId], oldValue: undefined, newValue: copy },
  ]
  const inverse: Patch[] = [
    { path: ['rowsById', rowId], oldValue: copy, newValue: undefined },
    { path: ['rowIds'], oldValue: nextIds, newValue: previousIds },
  ]
  memory.rowsById[rowId] = row
  memory.dataset.rowIds = nextIds
  record(memory, body, meta, `Inserted ${rowId}`, patches, inverse)
}

const deleteRows = (
  memory: DatasetMemory,
  body: MutationOf<'delete-rows'>,
  meta: MutationMetadata,
) => {
  if (!body.rowIds.length) throw validationError('No rows to delete')
  const previousIds = [...memory.dataset.rowIds]
  const removed = body.rowIds.map((id) => {
    const row = memory.rowsById[id]
    if (!row) throw notFound(id)
    return cloneRow(row)
  })
  const removeSet = new Set(body.rowIds)
  const nextIds = previousIds.filter((id) => !removeSet.has(id))
  const patches: Patch[] = [{ path: ['rowIds'], oldValue: previousIds, newValue: nextIds }]
  const inverse: Patch[] = [{ path: ['rowIds'], oldValue: nextIds, newValue: previousIds }]
  memory.dataset.rowIds = nextIds
  for (const id of body.rowIds) delete memory.rowsById[id]
  for (const row of removed) {
    patches.push({ path: ['rowsById', row.id], oldValue: row, newValue: undefined })
    inverse.unshift({ path: ['rowsById', row.id], oldValue: undefined, newValue: row })
  }
  record(memory, body, meta, `Deleted ${removed.length} rows`, patches, inverse)
}

export const applyMutationIntent = (
  memory: DatasetMemory,
  body: MutationRequestDTO,
  meta: MutationMetadata,
) => {
  switch (body.type) {
    case 'update-cell':
      return updateCell(memory, body, meta)
    case 'update-cells':
    case 'bulk-update':
      return updateCells(memory, body, meta)
    case 'insert-row':
      return insertRow(memory, body, meta)
    case 'delete-rows':
      return deleteRows(memory, body, meta)
  }
}
