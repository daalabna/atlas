import { ref, watch } from 'vue'
import { atlasApi } from '~/utils/atlasApi'
import { useDataset } from '~/composables/useDataset'
import { useGridStore } from '~/stores/grid'
import { useHistoryStore } from '~/stores/history'
import { useSelectionStore } from '~/stores/selection'
import { useSessionStore } from '~/stores/session'
import { useViewsStore } from '~/stores/views'
import { useEditorStore } from '~/stores/editor'
import {
  cancelOptimisticTransport,
  hasPartialRemoteApply,
  inversesFromCancelled,
  type PendingOptimisticChange,
} from '~/utils/optimisticTransport'
import { finishAbandonedRemote, waitForAbandonedRemote } from '~/utils/abandonedRemote'
import { datasetQueueKey, enqueueForDataset } from '~/utils/remoteMutations'
import {
  createLoadGeneration,
  shouldRevertFailedSwitchRoute,
  shouldRunSwitchAbort,
} from '~/utils/workspaceLoad'
import { useDatasetStore } from '~/stores/dataset'

interface WorkspaceLoadContext {
  previousId: string
  previousSize: number
  requestedId: string
  requestedSize: number
  isSwitch: boolean
  versionBefore: number
  isStale: () => boolean
  loadToken: symbol
  cancelled: PendingOptimisticChange[]
}

export const useWorkspaceLoad = () => {
  const route = useRoute()
  const dataset = useDataset()
  const datasetStore = useDatasetStore()
  const gridStore = useGridStore()
  const historyStore = useHistoryStore()
  const selection = useSelectionStore()
  const session = useSessionStore()
  const views = useViewsStore()

  const serverEntries = ref<
    Array<{
      version: number
      summary: string
      timestamp: string
    }>
  >([])
  let historyRequestToken = 0
  const loadGeneration = createLoadGeneration()

  const refreshServerHistory = async () => {
    const token = ++historyRequestToken
    const datasetId = session.activeDatasetId
    const size = session.datasetSize
    try {
      const historyPayload = await atlasApi.datasets.getHistory(datasetId, size)
      if (
        token !== historyRequestToken ||
        session.activeDatasetId !== datasetId ||
        session.datasetSize !== size
      )
        return
      serverEntries.value = historyPayload.entries
    } catch (error) {
      if (
        token === historyRequestToken &&
        session.activeDatasetId === datasetId &&
        session.datasetSize === size
      ) {
        session.flash(error instanceof Error ? error.message : 'Failed to load server history')
      }
    }
  }

  /** Cell edits / undo / redo bump version but don't go through toolbar handlers. */
  watch(
    () => dataset.version.value,
    (version, previous) => {
      if (previous == null || version === previous) return
      void refreshServerHistory()
    },
  )

  const resetGridQuery = (resetViews = true) => {
    if (resetViews) views.reset()
    gridStore.applyView({
      filters: [],
      sorting: [],
      visibleColumns: dataset.columns.value.map((column) => column.id),
      columnWidths: {},
    })
    gridStore.requestSync()
  }

  const switchAbortAllowed = (context: WorkspaceLoadContext) =>
    shouldRunSwitchAbort({
      isStale: context.isStale(),
      isSwitch: context.isSwitch,
      sessionId: session.activeDatasetId,
      sessionSize: session.datasetSize,
      requestedId: context.requestedId,
      requestedSize: context.requestedSize,
    })

  const healCancelledSwitch = async (context: WorkspaceLoadContext) => {
    const { cancelled, previousId, previousSize, isStale } = context
    if (!hasPartialRemoteApply(cancelled) && !inversesFromCancelled(cancelled).length) return
    await enqueueForDataset(datasetQueueKey(previousId, previousSize), async () => {
      if (isStale() || datasetStore.dataset?.id !== previousId) return
      if (hasPartialRemoteApply(cancelled)) {
        try {
          const committed = await datasetStore.loadDataset(previousId, previousSize, {
            stillWanted: () => !isStale() && datasetStore.dataset?.id === previousId,
          })
          if (committed) historyStore.resetStack()
        } catch {
          // Session revert still runs; next edit will 409-reload if Pinia drifted.
        }
      } else {
        const inversePatches = inversesFromCancelled(cancelled)
        if (inversePatches.length) {
          datasetStore.applyLocalPatches(inversePatches)
          historyStore.resetStack()
        }
      }
      gridStore.invalidateWorker()
      gridStore.requestSync()
    })
  }

  const restorePreviousScope = async (context: WorkspaceLoadContext) => {
    if (!switchAbortAllowed(context)) return
    await healCancelledSwitch(context)
    if (!switchAbortAllowed(context)) return
    session.activeDatasetId = context.previousId
    session.datasetSize = context.previousSize
    if (
      shouldRevertFailedSwitchRoute({
        previousId: context.previousId,
        requestedId: context.requestedId,
        routeId: String(route.params.id ?? ''),
      })
    ) {
      await navigateTo(`/datasets/${context.previousId}`, { replace: true })
    }
  }

  const registerAbandonedDrain = (context: WorkspaceLoadContext, committed: boolean) => {
    if (!committed || !context.isSwitch || !hasPartialRemoteApply(context.cancelled)) return
    void finishAbandonedRemote(context.cancelled, context.previousId, context.previousSize).catch(
      () => {
        // Next visit loadDataset is the source of truth if leftover POSTs fail.
      },
    )
  }

  const requestedScopeIsActive = (context: WorkspaceLoadContext) =>
    !context.isStale() &&
    session.activeDatasetId === context.requestedId &&
    session.datasetSize === context.requestedSize

  const loadViewsForScope = async (context: WorkspaceLoadContext) => {
    try {
      const committed = await views.loadViews(context.requestedId, context.requestedSize)
      if (context.isStale()) return false
      if (committed && requestedScopeIsActive(context)) {
        if (views.activeView) gridStore.applyView(views.activeView)
      } else if (requestedScopeIsActive(context)) {
        // Superseded list — drop previous filters without invalidating the newer views load.
        resetGridQuery(false)
      }
    } catch (error) {
      if (context.isStale()) return false
      if (requestedScopeIsActive(context)) {
        resetGridQuery()
        session.flash(error instanceof Error ? error.message : 'Failed to load views')
      }
    }
    return true
  }

  const prepareLoad = (nextSize?: number): WorkspaceLoadContext | null => {
    const previousId = session.activeDatasetId
    const previousSize = session.datasetSize
    const requestedId = String(route.params.id ?? 'customers')
    const requestedSize = nextSize ?? previousSize
    const isSwitch = previousId !== requestedId || previousSize !== requestedSize
    // Same-dataset reload must not race restore/undo heal; switches may cancel the old queue.
    if (
      !isSwitch &&
      (session.writesBlocked || session.workspaceLoading || historyStore.pendingCount > 0)
    ) {
      session.flash('Wait for the current change to finish before reloading.')
      return null
    }
    const versionBefore = dataset.version.value
    const { isStale } = loadGeneration.next()
    const loadToken = session.beginWorkspaceLoad()
    useEditorStore().cancelEditing()
    selection.clearSelection()
    const cancelled = isSwitch
      ? cancelOptimisticTransport(datasetQueueKey(previousId, previousSize))
      : []
    if (isSwitch) datasetStore.invalidateInFlightLoads()
    session.activeDatasetId = requestedId
    session.datasetSize = requestedSize
    return {
      previousId,
      previousSize,
      requestedId,
      requestedSize,
      isSwitch,
      versionBefore,
      isStale,
      loadToken,
      cancelled,
    }
  }

  const load = async (nextSize?: number) => {
    const context = prepareLoad(nextSize)
    if (!context) return
    try {
      // Drain leftover POSTs for the dataset we are entering — not the one we left.
      await waitForAbandonedRemote(context.requestedId, context.requestedSize)
      const committed = await dataset.load(context.requestedId, context.requestedSize, {
        stillWanted: () => requestedScopeIsActive(context),
        preserveExistingOnError: context.isSwitch,
      })
      // Register before views so a quick switch-back can wait for the drain.
      registerAbandonedDrain(context, committed)
      if (!committed || !requestedScopeIsActive(context)) {
        await restorePreviousScope(context)
        return
      }
      gridStore.setVisibleColumns(dataset.columns.value.map((column) => column.id))
      gridStore.scrollTop = 0
      if (!(await loadViewsForScope(context)) || context.isStale()) return
      // Version watch already refreshes when hydrate changed the integer.
      if (dataset.version.value === context.versionBefore) await refreshServerHistory()
    } catch (error) {
      await restorePreviousScope(context)
      if (!context.isStale()) {
        session.flash(error instanceof Error ? error.message : 'Failed to load workspace')
      }
    } finally {
      session.endWorkspaceLoad(context.loadToken)
    }
  }

  return { serverEntries, refreshServerHistory, load }
}
