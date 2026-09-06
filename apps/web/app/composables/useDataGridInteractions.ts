import type { useCellEditor } from '~/composables/useCellEditor'
import type { useGrid } from '~/composables/useGrid'
import type { useSelection } from '~/composables/useSelection'
import type { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { GRID_HEADER_HEIGHT } from '~/utils/gridLayout'

export const scrollRowIntoView = (input: {
  rowIndex: number
  rowHeight: number
  viewportHeight: number
  scrollTop: number
  headerHeight?: number
}) => {
  const headerHeight = input.headerHeight ?? 0
  const visibleHeight = Math.max(0, input.viewportHeight - headerHeight)
  const rowTop = input.rowIndex * input.rowHeight
  const rowBottom = rowTop + input.rowHeight
  if (rowTop < input.scrollTop) return rowTop
  if (rowBottom > input.scrollTop + visibleHeight) {
    return Math.max(0, rowBottom - visibleHeight)
  }
  return input.scrollTop
}

export const useDataGridInteractions = (deps: {
  grid: ReturnType<typeof useGrid>
  selection: ReturnType<typeof useSelection>
  editor: ReturnType<typeof useCellEditor>
  datasetStore: ReturnType<typeof useDatasetStore>
}) => {
  const { grid, selection, editor, datasetStore } = deps

  const beginEdit = (rowId: string, columnId: string) => {
    const row = datasetStore.rowsById[rowId]
    if (!row) return
    editor.startEditing(rowId, columnId, row.cells[columnId] ?? null)
  }

  const onCellClick = async (event: MouseEvent, index: number, rowId: string, columnId: string) => {
    if (editor.isEditing.value) {
      const current = editor.editing.value
      if (current && current.rowId === rowId && current.columnId === columnId) return
      await editor.commitEditing()
      // Validation failure keeps the editor open — do not steal focus.
      if (editor.isEditing.value) return
    }

    if (event.shiftKey && selection.selection.value.anchorCell) {
      const anchorId = selection.selection.value.anchorCell.rowId
      const anchorIndex = grid.displayRowIds.value.indexOf(anchorId)
      selection.selectRange(anchorIndex < 0 ? index : anchorIndex, index, rowId, columnId)
      return
    }
    if (event.metaKey || event.ctrlKey) {
      selection.toggleRow(index, rowId, columnId)
      return
    }
    selection.selectRow(index, rowId, columnId)
  }

  const onToggleRow = (event: MouseEvent, index: number, rowId: string) => {
    const columnId = grid.visibleColumns.value[0]?.id ?? 'name'
    if (event.shiftKey && selection.selection.value.anchorCell) {
      const anchorId = selection.selection.value.anchorCell.rowId
      const anchorIndex = grid.displayRowIds.value.indexOf(anchorId)
      selection.selectRange(anchorIndex < 0 ? index : anchorIndex, index, rowId, columnId)
      return
    }
    selection.toggleRow(index, rowId, columnId)
  }

  const onCellDblClick = (rowId: string, columnId: string) => {
    const index = grid.displayRowIds.value.indexOf(rowId)
    selection.selectRow(index, rowId, columnId)
    beginEdit(rowId, columnId)
  }

  const focusNeighbor = (deltaRow: number, deltaCol: number, extend: boolean) => {
    const active = selection.activeCell.value
    if (!active) return
    const rowIndex = grid.displayRowIds.value.indexOf(active.rowId)
    const colIndex = grid.visibleColumns.value.findIndex((column) => column.id === active.columnId)
    const nextRow = Math.max(0, Math.min(grid.displayRowIds.value.length - 1, rowIndex + deltaRow))
    const nextCol = Math.max(0, Math.min(grid.visibleColumns.value.length - 1, colIndex + deltaCol))
    const rowId = grid.displayRowIds.value[nextRow]
    const column = grid.visibleColumns.value[nextCol]
    if (!rowId || !column) return
    if (extend) selection.selectRange(rowIndex, nextRow, rowId, column.id)
    else selection.selectRow(nextRow, rowId, column.id)
    const gridStore = useGridStore()
    gridStore.scrollTop = scrollRowIntoView({
      rowIndex: nextRow,
      rowHeight: gridStore.rowHeight,
      viewportHeight: gridStore.viewportHeight,
      scrollTop: gridStore.scrollTop,
      headerHeight: GRID_HEADER_HEIGHT,
    })
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (editor.isEditing.value) {
      if (event.key === 'Escape') {
        event.preventDefault()
        editor.cancelEditing()
      }
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      const first = grid.displayRowIds.value[0]
      selection.selectAll(
        grid.displayRowIds.value.length,
        first ?? null,
        grid.visibleColumns.value[0]?.id ?? 'name',
      )
      return
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      const active = selection.activeCell.value
      if (!active) return
      event.preventDefault()
      beginEdit(active.rowId, active.columnId)
      return
    }
    if (event.key === 'Escape') {
      selection.clearSelection()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusNeighbor(1, 0, event.shiftKey)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusNeighbor(-1, 0, event.shiftKey)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusNeighbor(0, 1, event.shiftKey)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusNeighbor(0, -1, event.shiftKey)
    }
  }

  return { onCellClick, onToggleRow, onCellDblClick, onKeydown }
}
