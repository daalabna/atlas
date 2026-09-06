import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, ref } from 'vue'
import { useGridStore } from '~/stores/grid'
import { GRID_HEADER_HEIGHT } from '~/utils/gridLayout'
import { scrollRowIntoView, useDataGridInteractions } from './useDataGridInteractions'

describe('scrollRowIntoView', () => {
  it('scrolls up when the row is above the viewport', () => {
    expect(
      scrollRowIntoView({ rowIndex: 2, rowHeight: 32, viewportHeight: 320, scrollTop: 200 }),
    ).toBe(64)
  })

  it('scrolls down when the row is below the viewport', () => {
    expect(
      scrollRowIntoView({ rowIndex: 20, rowHeight: 32, viewportHeight: 320, scrollTop: 0 }),
    ).toBe(352)
  })

  it('leaves scrollTop unchanged when the row is already visible', () => {
    expect(
      scrollRowIntoView({ rowIndex: 3, rowHeight: 32, viewportHeight: 320, scrollTop: 80 }),
    ).toBe(80)
  })

  it('reserves the sticky header when scrolling a row up from below the fold', () => {
    expect(
      scrollRowIntoView({
        rowIndex: 20,
        rowHeight: 32,
        viewportHeight: 320,
        scrollTop: 0,
        headerHeight: GRID_HEADER_HEIGHT,
      }),
    ).toBe(388)
  })
})

describe('useDataGridInteractions arrows', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('prevents default and scrolls the selected row into view', () => {
    const gridStore = useGridStore()
    gridStore.rowHeight = 32
    gridStore.viewportHeight = 32 + GRID_HEADER_HEIGHT
    gridStore.scrollTop = 0
    const displayRowIds = ref(['r1', 'r2', 'r3'])
    const visibleColumns = ref([{ id: 'name', name: 'Name', type: 'text' as const, width: 120 }])
    const activeCell = ref({ rowId: 'r1', columnId: 'name' })
    const selectRow = vi.fn((index: number, rowId: string) => {
      const id = displayRowIds.value[index] ?? rowId
      activeCell.value = { rowId: id, columnId: 'name' }
    })
    const interactions = useDataGridInteractions({
      grid: {
        displayRowIds,
        visibleColumns,
        virtualWindow: computed(() => ({ startIndex: 0, endIndex: 3 })),
      } as never,
      selection: {
        activeCell,
        selectRow,
        selectRange: vi.fn(),
        selectAll: vi.fn(),
        clearSelection: vi.fn(),
        selection: computed(() => ({ anchorCell: null })),
      } as never,
      editor: {
        isEditing: computed(() => false),
        editing: computed(() => null),
        startEditing: vi.fn(),
        commitEditing: vi.fn(),
        cancelEditing: vi.fn(),
      } as never,
      datasetStore: { rowsById: {} } as never,
    })

    const event = { key: 'ArrowDown', preventDefault: vi.fn(), shiftKey: false } as unknown as KeyboardEvent
    interactions.onKeydown(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(selectRow).toHaveBeenCalledWith(1, 'r2', 'name')
    expect(gridStore.scrollTop).toBe(32)
  })
})
