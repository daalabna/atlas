<script setup lang="ts">
import { AtlasButton } from '@atlas/ui'
import type { View } from '@atlas/domain'
import { useViewsStore } from '~/stores/views'
import { useGridStore } from '~/stores/grid'
import { useEditorStore } from '~/stores/editor'
import { useSelectionStore } from '~/stores/selection'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { isTransportBusy } from '~/utils/transportBusy'

const props = defineProps<{
  views: View[]
  /** Compact horizontal strip above the grid (narrow layouts). */
  compact?: boolean
}>()

const viewsStore = useViewsStore()
const grid = useGridStore()
const editor = useEditorStore()
const selection = useSelectionStore()
const session = useSessionStore()
const historyStore = useHistoryStore()
const transportBusy = computed(() =>
  isTransportBusy({
    writesBlocked: session.writesBlocked,
    workspaceLoading: session.workspaceLoading,
    pendingCount: historyStore.pendingCount,
  }),
)

const activate = (view: View) => {
  if (transportBusy.value) return
  if (viewsStore.activeViewId === view.id) return
  editor.cancelEditing()
  selection.clearSelection()
  grid.scrollTop = 0
  grid.scrollLeft = 0
  viewsStore.setActiveView(view.id)
  grid.applyView(view)
}
</script>

<template>
  <div class="view-list" :class="{ 'is-compact': compact }">
    <h3 v-if="!compact">Views</h3>
    <span v-else class="view-list-label">Views</span>
    <AtlasButton
      v-for="view in props.views"
      :key="view.id"
      size="sm"
      :variant="viewsStore.activeViewId === view.id ? 'primary' : 'ghost'"
      :disabled="transportBusy && viewsStore.activeViewId !== view.id"
      @click="activate(view)"
    >
      {{ view.name }}
    </AtlasButton>
  </div>
</template>
