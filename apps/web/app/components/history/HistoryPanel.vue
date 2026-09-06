<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { HistoryMeta } from '@atlas/domain'
import { AtlasButton, AtlasDialog } from '@atlas/ui'
import { useDatasetStore } from '~/stores/dataset'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { restoreConfirmGate } from '~/utils/confirmRestore'
import { runConfirmRestore } from '~/utils/restoreChrome'
import { isTransportBusy } from '~/utils/transportBusy'

const props = defineProps<{
  entries: HistoryMeta[]
  serverEntries: Array<{
    version: number
    summary: string
    timestamp: string
  }>
}>()

const emit = defineEmits<{ 'server-restored': [] }>()

const dataset = useDatasetStore()
const historyStore = useHistoryStore()
const session = useSessionStore()
const restoring = ref(false)
const pending = ref<{
  entryVersion: number
  targetVersion: number
  summary: string
  datasetId: string
  size: number
} | null>(null)

/** Restore undoes this mutation (and everything after it) → land on entry.version - 1. */
const resolveTargetVersion = (entryVersion: number) => Math.max(1, entryVersion - 1)

const transportBusy = computed(() =>
  isTransportBusy({
    writesBlocked: session.writesBlocked,
    workspaceLoading: session.workspaceLoading,
    pendingCount: historyStore.pendingCount,
  }),
)

const snapshotMatchesSession =
  () =>
    Boolean(dataset.dataset) &&
    dataset.dataset?.id === session.activeDatasetId &&
    !session.workspaceLoading

const canRestore = (entryVersion: number) => {
  return (
    snapshotMatchesSession() &&
    !transportBusy.value &&
    resolveTargetVersion(entryVersion) < dataset.version &&
    entryVersion <= dataset.version
  )
}

const askRestore = (entryVersion: number, summary: string) => {
  if (!snapshotMatchesSession() || transportBusy.value) return
  const targetVersion = resolveTargetVersion(entryVersion)
  if (targetVersion >= dataset.version) return
  pending.value = {
    entryVersion,
    targetVersion,
    summary,
    datasetId: session.activeDatasetId,
    size: session.datasetSize,
  }
}

const cancelRestore = () => {
  if (restoring.value) return
  pending.value = null
}

watch(
  () => [session.activeDatasetId, session.datasetSize] as const,
  () => {
    if (restoring.value) return
    pending.value = null
  },
)

const confirmRestore = async () => {
  const request = pending.value
  const gate = restoreConfirmGate({
    pending: request,
    restoring: restoring.value,
    transportBusy: transportBusy.value,
    snapshotMatches: snapshotMatchesSession(),
    sessionId: session.activeDatasetId,
    sessionSize: session.datasetSize,
  })
  if (gate === 'skip') return
  if (gate === 'clear' || !request) {
    pending.value = null
    return
  }
  restoring.value = true
  try {
    await runConfirmRestore({
      targetVersion: request.targetVersion,
      datasetId: request.datasetId,
      size: request.size,
      isCurrent: () =>
        session.activeDatasetId === request.datasetId && session.datasetSize === request.size,
      abandonChrome: () => {
        pending.value = null
        restoring.value = false
      },
      onServerCommitted: () => emit('server-restored'),
    })
    pending.value = null
  } catch (error) {
    pending.value = null
    session.flash(error instanceof Error ? error.message : 'Restore failed')
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <div class="panel">
    <h3>Local history</h3>
    <div v-if="!props.entries.length" class="history-empty">
      No local patches yet
    </div>
    <div v-for="entry in props.entries" :key="entry.id" class="history-item">
      <b>{{ entry.summary }}</b>
      <div class="history-time">
        {{ new Date(entry.timestamp).toLocaleTimeString() }}
      </div>
    </div>
    <h3 class="history-section-title">Server versions</h3>
    <div v-if="!props.serverEntries.length" class="history-empty">
      No server mutations yet
    </div>
    <div v-for="entry in props.serverEntries" :key="entry.version" class="history-item">
      <div>v{{ entry.version }} · {{ entry.summary }}</div>
      <AtlasButton
        class="history-restore"
        size="sm"
        :disabled="restoring || !canRestore(entry.version)"
        data-testid="restore-version"
        @click="askRestore(entry.version, entry.summary)"
      >
        Restore
      </AtlasButton>
    </div>

    <AtlasDialog :open="Boolean(pending)" title="Restore version?" @close="cancelRestore">
      <p v-if="pending" class="restore-copy">
        Undo
        <b class="restore-version">v{{ pending.entryVersion }}</b>
        ({{ pending.summary }}) and every newer change. Dataset will return to
        <b class="restore-version">v{{ pending.targetVersion }}</b>
        (now at v{{ dataset.version }}). Local undo history will be cleared.
      </p>
      <div class="restore-actions">
        <AtlasButton size="sm" :disabled="restoring" @click="cancelRestore">Cancel</AtlasButton>
        <AtlasButton
          size="sm"
          variant="primary"
          data-testid="confirm-restore"
          :disabled="restoring || transportBusy"
          @click="confirmRestore"
        >
          {{ restoring ? 'Restoring…' : 'Restore' }}
        </AtlasButton>
      </div>
    </AtlasDialog>
  </div>
</template>
