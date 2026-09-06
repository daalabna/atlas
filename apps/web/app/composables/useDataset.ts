import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import {
  emptyCellValue,
  type CellValue,
  type ColumnId,
  type MutationDraft,
  type Row,
  type RowId,
} from '@atlas/domain'
import {
  addToTransaction,
  beginTransaction,
  getAtPath,
  invertPatches,
  transactionToEntryFields,
  type Patch,
} from '@atlas/history-engine'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { datasetQueueKey, enqueueForDataset } from '~/utils/remoteMutations'
import { useOptimisticMutation } from './useOptimisticMutation'
import { applySnapshotSideEffects } from './useSnapshotSync'

export const useDataset = () => {
  const datasetStore = useDatasetStore()
  const historyStore = useHistoryStore()
  const optimistic = useOptimisticMutation()
  const { dataset, rowsById, rowIds, columns, version, loading, error } = storeToRefs(datasetStore)

  const load = async (
    id: string,
    size: number,
    options: { stillWanted?: () => boolean; preserveExistingOnError?: boolean } = {},
  ) => {
    return enqueueForDataset(datasetQueueKey(id, size), async () => {
      const committed = await datasetStore.loadDataset(id, size, options)
      if (!committed) return false
      historyStore.resetStack()
      const session = useSessionStore()
      const stillWanted = () => options.stillWanted?.() !== false
      try {
        await applySnapshotSideEffects()
        if (stillWanted()) session.connectionStatus = 'online'
      } catch {
        if (stillWanted()) {
          const gridStore = useGridStore()
          gridStore.invalidateWorker()
          gridStore.requestSync()
          session.connectionStatus = 'degraded'
        }
      }
      return true
    })
  }

  const cellPatches = (
    rowId: RowId,
    columnId: ColumnId,
    oldValue: CellValue,
    newValue: CellValue,
  ): Patch[] => [
    {
      path: ['rowsById', rowId, 'cells', columnId],
      oldValue,
      newValue,
    },
  ]

  const updateCell = async (rowId: RowId, columnId: ColumnId, value: CellValue) => {
    const row = datasetStore.rowsById[rowId]
    if (!row) return
    const oldValue = (getAtPath(row, ['cells', columnId]) as CellValue | undefined) ?? null
    if (oldValue === value) return

    const patches = cellPatches(rowId, columnId, oldValue, value)
    const inversePatches = invertPatches(patches)
    const applyDraft: MutationDraft = { type: 'update-cell', rowId, columnId, value }
    const revertDraft: MutationDraft = { type: 'update-cell', rowId, columnId, value: oldValue }

    await optimistic.execute({
      type: 'update-cell',
      summary: `${rowId}.${columnId}: ${String(oldValue)} → ${String(value)}`,
      patches,
      inversePatches,
      mutations: [applyDraft],
      revertMutations: [revertDraft],
    })
  }

  const bulkUpdate = async (ids: RowId[], columnId: ColumnId, value: CellValue) => {
    let tx = beginTransaction(crypto.randomUUID())
    const revertCells: Array<{ rowId: RowId; columnId: ColumnId; value: CellValue }> = []

    for (const rowId of ids) {
      const row = datasetStore.rowsById[rowId]
      if (!row) continue
      const oldValue = row.cells[columnId] ?? null
      const patches = cellPatches(rowId, columnId, oldValue, value)
      tx = addToTransaction(tx, patches, invertPatches(patches))
      revertCells.push({ rowId, columnId, value: oldValue })
    }

    const patchedIds = revertCells.map((cell) => cell.rowId)
    if (!patchedIds.length) return

    const applyDraft: MutationDraft = { type: 'bulk-update', rowIds: patchedIds, columnId, value }
    const firstRevert = revertCells[0]
    const revertDraft: MutationDraft =
      revertCells.length === 1 && firstRevert
        ? {
            type: 'update-cell',
            rowId: firstRevert.rowId,
            columnId,
            value: firstRevert.value,
          }
        : { type: 'update-cells', cells: revertCells }

    await optimistic.execute({
      type: 'bulk-update',
      summary: `Bulk update ${patchedIds.length} rows`,
      ...transactionToEntryFields(tx),
      mutations: [applyDraft],
      revertMutations: [revertDraft],
    })
  }

  const deleteRows = async (ids: RowId[]) => {
    const existingIds = ids.filter((id) => datasetStore.rowsById[id])
    if (!existingIds.length) return
    const previousIds = [...datasetStore.rowIds]
    const removed: Row[] = existingIds
      .map((id) => datasetStore.rowsById[id])
      .filter((row): row is Row => Boolean(row))
      .map((row) => ({ id: row.id, cells: { ...row.cells } }))
    const removeSet = new Set(existingIds)
    const nextIds = previousIds.filter((id) => !removeSet.has(id))

    const patches: Patch[] = [{ path: ['rowIds'], oldValue: previousIds, newValue: nextIds }]
    const inversePatches: Patch[] = [{ path: ['rowIds'], oldValue: nextIds, newValue: previousIds }]
    for (const row of removed) {
      patches.push({ path: ['rowsById', row.id], oldValue: row, newValue: undefined })
      inversePatches.unshift({ path: ['rowsById', row.id], oldValue: undefined, newValue: row })
    }

    // Indices are resolved at send time from local row order after undo patches apply.
    const previousIndex = new Map(previousIds.map((id, index) => [id, index]))
    const revertMutations: MutationDraft[] = [...removed]
      .sort((a, b) => (previousIndex.get(a.id) ?? 0) - (previousIndex.get(b.id) ?? 0))
      .map((row) => ({
        type: 'insert-row' as const,
        rowId: row.id,
        cells: row.cells,
        index: 0,
      }))

    await optimistic.execute({
      type: 'delete-rows',
      summary: `Delete ${existingIds.length} rows`,
      patches,
      inversePatches,
      mutations: [{ type: 'delete-rows', rowIds: existingIds }],
      revertMutations,
    })
  }

  const insertRow = async () => {
    const id = `row-${crypto.randomUUID().slice(0, 8)}`
    const cells: Row['cells'] = {}
    for (const column of datasetStore.columns) {
      cells[column.id] = emptyCellValue(column.type)
    }
    const row: Row = { id, cells }
    const previousIds = [...datasetStore.rowIds]
    const nextIds = [id, ...previousIds]
    const patches: Patch[] = [
      { path: ['rowIds'], oldValue: previousIds, newValue: nextIds },
      { path: ['rowsById', id], oldValue: undefined, newValue: row },
    ]

    await optimistic.execute({
      type: 'insert-row',
      summary: `Insert ${id}`,
      patches,
      inversePatches: invertPatches(patches),
      mutations: [{ type: 'insert-row', rowId: id, cells, index: 0 }],
      revertMutations: [{ type: 'delete-rows', rowIds: [id] }],
    })
  }

  return {
    dataset,
    rowsById,
    rowIds,
    columns,
    version,
    loading,
    error,
    rowCount: computed(() => rowIds.value.length),
    load,
    updateCell,
    bulkUpdate,
    deleteRows,
    insertRow,
  }
}
