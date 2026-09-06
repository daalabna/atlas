import { useSelectionStore } from '~/stores/selection'
export const useSelection = () => {
  const store = useSelectionStore()
  return {
    selection: computed(() => store.selection),
    selectedCount: computed(() => store.rangeCount),
    activeCell: computed(() => store.activeCell),
    selectRow: store.selectRow,
    selectRange: store.selectRange,
    toggleRow: store.toggleRow,
    selectAll: store.selectAll,
    clearSelection: store.clearSelection,
    isSelected: store.isSelected,
    selectedRowIds: store.selectedRowIds,
  }
}
