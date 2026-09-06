import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import {
  addRange,
  collectSelectedIds,
  containsIndex,
  emptySelection,
  normalizeRange,
  selectedCount,
  toggleIndex,
  type GridSelection,
} from '@atlas/domain'
export const useSelectionStore = defineStore('selection', () => {
  const selection = shallowRef<GridSelection>(emptySelection())
  const rangeCount = computed(() => selectedCount(selection.value.ranges))
  const activeCell = computed(() => selection.value.activeCell)
  const clearSelection = () => {
    selection.value = emptySelection()
  }
  const selectRow = (index: number, rowId: string, columnId: string, additive = false) => {
    const range = { start: index, end: index }
    selection.value = {
      ranges: additive ? addRange(selection.value.ranges, range) : [range],
      activeCell: { rowId, columnId },
      anchorCell: { rowId, columnId },
    }
  }
  const selectRange = (from: number, to: number, rowId: string, columnId: string) => {
    selection.value = {
      ranges: [normalizeRange(from, to)],
      activeCell: { rowId, columnId },
      anchorCell: selection.value.anchorCell ?? { rowId, columnId },
    }
  }
  const toggleRow = (index: number, rowId: string, columnId: string) => {
    selection.value = {
      ranges: toggleIndex(selection.value.ranges, index),
      activeCell: { rowId, columnId },
      anchorCell: { rowId, columnId },
    }
  }
  const selectAll = (count: number, rowId: string | null, columnId: string) => {
    selection.value = {
      ranges: count > 0 ? [{ start: 0, end: count - 1 }] : [],
      activeCell: rowId ? { rowId, columnId } : null,
      anchorCell: rowId ? { rowId, columnId } : null,
    }
  }
  const isSelected = (index: number) => {
    return containsIndex(selection.value.ranges, index)
  }
  const selectedRowIds = <T>(orderedIds: readonly T[]): T[] => {
    return collectSelectedIds(selection.value.ranges, orderedIds)
  }
  return {
    selection,
    rangeCount,
    activeCell,
    clearSelection,
    selectRow,
    selectRange,
    toggleRow,
    selectAll,
    isSelected,
    selectedRowIds,
  }
})
