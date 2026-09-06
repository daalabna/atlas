import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { CellValue, ColumnId, RowId } from '@atlas/domain'
export interface EditingCell {
  rowId: RowId
  columnId: ColumnId
  initialValue: CellValue
  value: CellValue
}
export const useEditorStore = defineStore('editor', () => {
  const editing = shallowRef<EditingCell | null>(null)
  const error = shallowRef<string | null>(null)
  const isEditing = computed(() => editing.value !== null)
  const dirty = computed(
    () => editing.value !== null && editing.value.value !== editing.value.initialValue,
  )
  const startEditing = (rowId: RowId, columnId: ColumnId, initialValue: CellValue) => {
    editing.value = { rowId, columnId, initialValue, value: initialValue }
    error.value = null
  }
  const setValue = (value: CellValue) => {
    if (!editing.value) return
    editing.value = { ...editing.value, value }
  }
  const cancelEditing = () => {
    editing.value = null
    error.value = null
  }
  const setError = (message: string | null) => {
    error.value = message
  }
  return {
    editing,
    error,
    isEditing,
    dirty,
    startEditing,
    setValue,
    cancelEditing,
    setError,
  }
})
