<script setup lang="ts">
import { AtlasButton, AtlasCheckbox, AtlasSelect, AtlasTooltip } from '@atlas/ui'
import { useGridStore } from '~/stores/grid'
import { useHistory } from '~/composables/useHistory'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { useSelectionStore } from '~/stores/selection'
import { useViewsStore } from '~/stores/views'
import { isTransportBusy } from '~/utils/transportBusy'

const props = defineProps<{
  rowCount: number
  version: number
}>()

const emit = defineEmits<{
  load: [requestedSize?: number]
  bulk: []
  delete: []
  insert: []
}>()

const grid = useGridStore()
const history = useHistory()
const historyStore = useHistoryStore()
const session = useSessionStore()
const selection = useSelectionStore()
const views = useViewsStore()

const isAllRecords = computed(() => views.activeViewId === 'all')
/** Block size/reload/mutations while restore, snapshot load, or in-flight transport is active. */
const transportBusy = computed(() =>
  isTransportBusy({
    writesBlocked: session.writesBlocked,
    workspaceLoading: session.workspaceLoading,
    pendingCount: historyStore.pendingCount,
  }),
)
/** Fault-injection UI is local-dev only (server also ignores it in production). */
const showSimulate = import.meta.dev

const sizeOptions = [
  { value: '1000', label: '1k rows' },
  { value: '10000', label: '10k rows' },
  { value: '50000', label: '50k rows' },
  { value: '100000', label: '100k rows' },
]

const simulateOptions = [
  { value: 'none', label: 'API normal' },
  { value: 'conflict', label: 'API 409' },
  { value: 'error', label: 'API 500' },
  { value: 'slow', label: 'API slow' },
]

const onSize = (value: string) => {
  emit('load', Number(value))
}

const onInsert = () => {
  if (!isAllRecords.value) return
  emit('insert')
}
</script>

<template>
  <div class="toolbar">
    <AtlasSelect
      size="sm"
      class="toolbar-size"
      :model-value="String(session.datasetSize)"
      :options="sizeOptions"
      :disabled="transportBusy"
      @update:model-value="onSize"
    />
    <AtlasTooltip label="Reload dataset from server">
      <AtlasButton
        variant="primary"
        size="sm"
        data-testid="reload"
        :disabled="transportBusy"
        @click="emit('load')"
        >Load dataset</AtlasButton
      >
    </AtlasTooltip>
    <AtlasTooltip label="Undo last change (Ctrl+Z)">
      <AtlasButton
        size="sm"
        data-testid="undo"
        :disabled="!history.canUndo.value || transportBusy"
        @click="history.undo()"
        >Undo</AtlasButton
      >
    </AtlasTooltip>
    <AtlasTooltip label="Redo (Ctrl+Y)">
      <AtlasButton
        size="sm"
        data-testid="redo"
        :disabled="!history.canRedo.value || transportBusy"
        @click="history.redo()"
        >Redo</AtlasButton
      >
    </AtlasTooltip>
    <AtlasTooltip
      :label="isAllRecords ? 'Insert a new empty row' : 'Switch to All records to insert rows'"
    >
      <AtlasButton
        size="sm"
        data-testid="insert-row"
        :disabled="!isAllRecords || transportBusy"
        @click="onInsert"
        >Insert row</AtlasButton
      >
    </AtlasTooltip>
    <AtlasTooltip label="Set priority=high on selected rows (checkbox / Ctrl+click / Shift+click)">
      <AtlasButton size="sm" :disabled="transportBusy" @click="emit('bulk')">
        Bulk update selected
      </AtlasButton>
    </AtlasTooltip>
    <AtlasTooltip label="Delete selected rows (can be undone)">
      <AtlasButton
        size="sm"
        data-testid="delete-rows"
        :disabled="selection.rangeCount === 0 || transportBusy"
        @click="emit('delete')"
      >
        Delete selected
      </AtlasButton>
    </AtlasTooltip>
    <AtlasTooltip label="Run filter/sort in a background thread">
      <AtlasCheckbox v-model="grid.useWorker" size="sm" label="Web Worker" />
    </AtlasTooltip>
    <AtlasTooltip
      v-if="showSimulate"
      label="Dev only: next edit will get 409 conflict, 500 error, or 1.2s delay"
    >
      <AtlasSelect
        v-model="session.simulate"
        size="sm"
        class="toolbar-api"
        :options="simulateOptions"
      />
    </AtlasTooltip>
    <span class="toolbar-meta">
      {{ props.rowCount.toLocaleString('en-US') }} records · v{{ props.version }}
    </span>
  </div>
</template>
