import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import {
  dropUnsentInsertPatches,
  inversesFromCancelled,
  pendingChanges,
  remoteVersions,
  unsentBodies,
  type MutationScope,
} from '~/utils/optimisticTransport'
import { applySnapshotSideEffects } from '~/composables/useSnapshotSync'

type PendingReload = { remoteApplied: number; bodies?: { type: string }[] }

export const pendingReloadNote = (pending: PendingReload[]) => {
  const unsynced = pending.some((change) => change.remoteApplied === 0)
  const synced = pending.some((change) => change.remoteApplied > 0)
  const droppedInserts = pending.some(
    (change) =>
      change.remoteApplied > 0 &&
      (change.bodies ?? []).slice(change.remoteApplied).some((body) => body.type === 'insert-row'),
  )
  if (synced && !unsynced) {
    return droppedInserts
      ? ' — already-synced changes were kept; unsynced local rows were dropped'
      : ' — already-synced changes were kept'
  }
  if (unsynced) return ' — local optimistic changes were reverted'
  return ''
}

export const dropScopeBookkeeping = (key: string) => {
  pendingChanges.delete(key)
  remoteVersions.delete(key)
}

const clearTransportState = (key: string) => {
  dropScopeBookkeeping(key)
  useHistoryStore().resetStack()
  const gridStore = useGridStore()
  gridStore.invalidateWorker()
  gridStore.requestSync()
}

const rollbackPendingLocally = (key: string) => {
  const datasetStore = useDatasetStore()
  const pending = pendingChanges.get(key) ?? []
  const inverses = inversesFromCancelled(pending)
  if (inverses.length) datasetStore.applyLocalPatches(inverses)
  for (const change of pending) {
    if (!change || change.remoteApplied === 0) continue
    const drop = dropUnsentInsertPatches(
      datasetStore.rowIds,
      datasetStore.rowsById,
      unsentBodies(change),
    )
    if (drop.length) datasetStore.applyLocalPatches(drop)
  }
  clearTransportState(key)
}

const hydrateAfterReload = async (stillActive: () => boolean) => {
  const session = useSessionStore()
  try {
    await applySnapshotSideEffects()
    if (stillActive()) session.connectionStatus = 'online'
  } catch {
    if (stillActive()) {
      useGridStore().invalidateWorker()
      useGridStore().requestSync()
    }
  }
}

const settleSupersededReload = (message: string, key: string, versionAtStart: number) => {
  const datasetStore = useDatasetStore()
  const session = useSessionStore()
  const pending = pendingChanges.get(key) ?? []
  if (pending.length && datasetStore.version === versionAtStart) {
    const note = pendingReloadNote(pending)
    rollbackPendingLocally(key)
    session.flash(`${message} Reload was superseded${note}.`)
    return
  }
  clearTransportState(key)
  remoteVersions.set(key, datasetStore.version)
  session.flash(message)
}

const settleFailedReload = (message: string, scope: MutationScope, stillActive: () => boolean, error: unknown) => {
  const session = useSessionStore()
  if (stillActive()) {
    const pending = pendingChanges.get(scope.key) ?? []
    const note = pendingReloadNote(pending)
    if (pending.length) rollbackPendingLocally(scope.key)
    else clearTransportState(scope.key)
    session.flash(
      error instanceof Error
        ? `${message} Reload failed${note}. (${error.message})`
        : `${message} Reload failed${note}.`,
    )
    return
  }
  dropScopeBookkeeping(scope.key)
}

const settleCommittedReload = async (
  message: string,
  scope: MutationScope,
  stillActive: () => boolean,
) => {
  const datasetStore = useDatasetStore()
  const session = useSessionStore()
  remoteVersions.set(scope.key, datasetStore.version)
  pendingChanges.delete(scope.key)
  useHistoryStore().resetStack()
  await hydrateAfterReload(stillActive)
  if (stillActive()) session.flash(message)
}

/** Reload snapshot after remote failure. On load failure, roll back pending optimistic patches. */
export const reloadOptimisticFromServer = async (
  message: string,
  scope: MutationScope,
  stillActive: () => boolean,
) => {
  if (!stillActive()) {
    dropScopeBookkeeping(scope.key)
    return
  }

  const datasetStore = useDatasetStore()
  const session = useSessionStore()
  session.connectionStatus = 'degraded'
  const versionAtStart = datasetStore.version

  try {
    const committed = await datasetStore.loadDataset(scope.datasetId, scope.size, {
      stillWanted: stillActive,
    })
    if (!stillActive()) {
      dropScopeBookkeeping(scope.key)
      return
    }
    if (!committed) {
      settleSupersededReload(message, scope.key, versionAtStart)
      return
    }
    await settleCommittedReload(message, scope, stillActive)
  } catch (error) {
    settleFailedReload(message, scope, stillActive, error)
  }
}
