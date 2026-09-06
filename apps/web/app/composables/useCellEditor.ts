import type { CellValue, Column } from '@atlas/domain'
import { useDataset } from './useDataset'
import { useEditorStore } from '~/stores/editor'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { isTransportBusy } from '~/utils/transportBusy'
import { isValidCalendarDate } from '#shared/utils/calendarDate'

export const validateCellValue = (
  column: Column | undefined,
  value: CellValue,
): string | null => {
  if (!column) return 'Unknown column'
  if (column.type === 'number' && value !== null && Number.isNaN(Number(value)))
    return 'Expected a number'
  if (column.type === 'select' && column.options && value !== null) {
    if (!column.options.includes(String(value))) {
      return 'Value is not in the select options'
    }
  }
  if (
    column.type === 'date' &&
    value !== null &&
    value !== '' &&
    !isValidCalendarDate(String(value))
  ) {
    return 'Expected a valid date (YYYY-MM-DD)'
  }
  return null
}

export const useCellEditor = () => {
  const editor = useEditorStore()
  const dataset = useDataset()
  const session = useSessionStore()
  const historyStore = useHistoryStore()
  const blocked = () =>
    isTransportBusy({
      writesBlocked: session.writesBlocked,
      workspaceLoading: session.workspaceLoading,
      pendingCount: historyStore.pendingCount,
    })
  const startEditing = (rowId: string, columnId: string, initialValue: CellValue) => {
    if (blocked()) return
    editor.startEditing(rowId, columnId, initialValue)
  }
  const cancelEditing = () => {
    editor.cancelEditing()
  }
  const commitEditing = async () => {
    const current = editor.editing
    if (!current) return
    if (blocked()) {
      editor.cancelEditing()
      session.flash(
        session.writesBlocked
          ? 'Dataset is temporarily locked while a version is being restored.'
          : session.workspaceLoading
            ? 'Wait for the dataset to finish loading.'
            : 'Wait for the current change to finish.',
      )
      return
    }
    const column = dataset.columns.value.find((item) => item.id === current.columnId)
    const message = validateCellValue(column, current.value)
    if (message) {
      editor.setError(message)
      return
    }
    await dataset.updateCell(current.rowId, current.columnId, current.value)
    editor.cancelEditing()
  }
  return {
    editing: computed(() => editor.editing),
    error: computed(() => editor.error),
    isEditing: computed(() => editor.isEditing),
    startEditing,
    cancelEditing,
    commitEditing,
    setValue: editor.setValue,
  }
}
