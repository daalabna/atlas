import { watch } from 'vue'
import { useEditorStore } from '~/stores/editor'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { applyRestoreOnQueue } from '~/utils/confirmRestore'
import { datasetQueueKey, enqueueForDataset } from '~/utils/remoteMutations'
import { createRestoreScope } from '~/utils/restoreScope'

export type ConfirmRestoreChrome = {
  targetVersion: number
  datasetId: string
  size: number
  isCurrent: () => boolean
  abandonChrome: () => void
  onServerCommitted?: () => void | Promise<void>
}

/** Locks, leave-scope watch, and FIFO around `applyRestoreOnQueue`. */
export const runConfirmRestore = async (input: ConfirmRestoreChrome) => {
  const session = useSessionStore()
  const historyStore = useHistoryStore()
  const { scopeIsActive } = createRestoreScope(input.isCurrent)
  const writeLockToken = session.beginWriteLock()
  const historyPendingToken = historyStore.beginPending()
  let guardsReleased = false
  const releaseGuards = () => {
    if (guardsReleased) return
    guardsReleased = true
    historyStore.endPending(historyPendingToken)
    session.endWriteLock(writeLockToken)
  }
  const abandonChrome = () => {
    releaseGuards()
    input.abandonChrome()
  }
  const leftScope = (serverRestored: boolean) => {
    abandonChrome()
    session.flash(
      serverRestored
        ? `Restored to version ${input.targetVersion} on the server. Re-open the dataset to load it.`
        : 'Restore cancelled — dataset changed.',
    )
    return true
  }
  const stopScopeWatch = watch(
    () => [session.activeDatasetId, session.datasetSize] as const,
    () => {
      if (!scopeIsActive()) abandonChrome()
    },
  )
  useEditorStore().cancelEditing()
  try {
    await enqueueForDataset(datasetQueueKey(input.datasetId, input.size), () =>
      applyRestoreOnQueue({
        targetVersion: input.targetVersion,
        datasetId: input.datasetId,
        size: input.size,
        scopeIsActive,
        leftScope,
        onServerCommitted: input.onServerCommitted,
      }),
    )
  } finally {
    stopScopeWatch()
    releaseGuards()
  }
}
