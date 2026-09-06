<script setup lang="ts">
import AppShell from '~/components/app/AppShell.vue'
import DatasetToolbar from '~/components/dataset/DatasetToolbar.vue'
import FilterBar from '~/components/dataset/FilterBar.vue'
import DatasetStatusBar from '~/components/dataset/DatasetStatusBar.vue'
import DataGrid from '~/components/grid/DataGrid.vue'
import ViewSelector from '~/components/views/ViewSelector.vue'
import HistoryPanel from '~/components/history/HistoryPanel.vue'
import PerformancePanel from '~/components/performance/PerformancePanel.vue'
import { useDataset } from '~/composables/useDataset'
import { useHistory } from '~/composables/useHistory'
import { useWorkspaceLoad } from '~/composables/useWorkspaceLoad'
import { useGridStore } from '~/stores/grid'
import { useSelectionStore } from '~/stores/selection'
import { useSessionStore } from '~/stores/session'
import { useViewsStore } from '~/stores/views'
import { useKeyboardShortcuts } from '~/composables/useKeyboardShortcuts'
import { virtualizeRows } from '@atlas/virtual-grid'
import { GRID_OVERSCAN, gridBodyViewportHeight } from '~/utils/gridLayout'

definePageMeta({
  ssr: false,
})

type MobilePane = 'grid' | 'insights'

const route = useRoute()
const dataset = useDataset()
const gridStore = useGridStore()
const selection = useSelectionStore()
const session = useSessionStore()
const views = useViewsStore()
const history = useHistory()
const { serverEntries, refreshServerHistory, load } = useWorkspaceLoad()
const mobilePane = ref<MobilePane>('grid')
useKeyboardShortcuts()

/** Match DataGrid virtualizer (overscan: 4) — status DOM rows ≡ rendered row count. */
const renderedCount = computed(() => {
  const count = (gridStore.visibleRowIds ?? dataset.rowIds.value).length
  const window = virtualizeRows({
    count,
    rowHeight: gridStore.rowHeight,
    viewportHeight: gridBodyViewportHeight(gridStore.viewportHeight),
    scrollTop: gridStore.scrollTop,
    overscan: GRID_OVERSCAN,
  })
  return Math.max(0, window.endIndex - window.startIndex)
})

const bulk = async () => {
  const ordered = gridStore.visibleRowIds ?? dataset.rowIds.value
  const ids = selection.selectedRowIds(ordered)
  if (!ids.length) {
    session.flash('Select a range first')
    return
  }
  await dataset.bulkUpdate(ids, 'priority', 'high')
}

const deleteSelected = async () => {
  const ordered = gridStore.visibleRowIds ?? dataset.rowIds.value
  const ids = selection.selectedRowIds(ordered)
  if (!ids.length) {
    session.flash('Select rows to delete')
    return
  }
  await dataset.deleteRows(ids)
  selection.clearSelection()
}

const insert = async () => {
  if (views.activeViewId !== 'all') {
    session.flash('Switch to All records to insert rows')
    return
  }
  await dataset.insertRow()
}

onMounted(() => {
  void load()
})

watch(
  () => route.params.id,
  () => void load(),
)
</script>

<template>
  <AppShell>
    <div class="workspace" :data-mobile-pane="mobilePane">
      <nav class="mobile-tabs" aria-label="Workspace panels">
        <button
          type="button"
          class="mobile-tab"
          :class="{ 'is-active': mobilePane === 'grid' }"
          @click="mobilePane = 'grid'"
        >
          Grid
        </button>
        <button
          type="button"
          class="mobile-tab"
          :class="{ 'is-active': mobilePane === 'insights' }"
          @click="mobilePane = 'insights'"
        >
          Insights
        </button>
      </nav>

      <aside class="sidebar sidebar-desktop">
        <ViewSelector :views="views.views" />
      </aside>

      <section class="dataset-page">
        <div class="views-inline">
          <ViewSelector :views="views.views" compact />
        </div>
        <DatasetToolbar
          :row-count="dataset.rowCount.value"
          :version="dataset.version.value"
          @load="load"
          @bulk="bulk"
          @delete="deleteSelected"
          @insert="insert"
        />
        <FilterBar :columns="dataset.columns.value" />
        <div v-if="dataset.loading.value" class="panel dataset-message">Loading dataset…</div>
        <div v-else-if="dataset.error.value" class="panel dataset-message">
          {{ dataset.error.value }}
        </div>
        <div v-else class="grid-pane">
          <DataGrid />
        </div>
        <DatasetStatusBar
          :row-count="(gridStore.visibleRowIds ?? dataset.rowIds.value).length"
          :rendered="renderedCount"
          :selected="selection.rangeCount"
          :processing="gridStore.processing"
        />
      </section>

      <aside class="rail">
        <PerformancePanel />
        <HistoryPanel
          :entries="history.entries.value"
          :server-entries="serverEntries"
          @server-restored="refreshServerHistory"
        />
      </aside>
    </div>
  </AppShell>
</template>
