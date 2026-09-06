import { VersionConflictError } from '@atlas/api-client'
import type { MutationRequestDTO } from '@atlas/contracts'
import type { Patch } from '@atlas/history-engine'
import type { AppHistoryEntry, RemoteMutationBody } from '~/utils/historyTypes'
import { useDatasetStore } from '~/stores/dataset'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { atlasApi } from '~/utils/atlasApi'
import { resolveSimulateParam, toMutationRequest } from '~/utils/optimisticHelpers'
import {
  cancelOptimisticTransport,
  PartialRemoteSyncError,
  pendingChanges,
  RemoteAbortError,
  remoteVersions,
  type MutationScope,
  type OptimisticInput,
  type PendingOptimisticChange,
} from '~/utils/optimisticTransport'
import {
  enqueueForDataset,
  datasetQueueKey,
  runRemoteChain,
  withResolvedInsertIndex,
} from '~/utils/remoteMutations'
import { piniaHoldsScopeSnapshot, shouldRollbackLeftScopePatches } from '~/utils/workspaceLoad'
import { createOptimisticRemote } from './optimisticRemote'
import { notifyLocalPatches, syncWorker } from './optimisticWorkerSync'

interface SyncRemoteInput {
  patches: Patch[]
  rollbackPatches: Patch[]
  bodies: RemoteMutationBody[]
  onRemoteFailure: () => void
}

export const useOptimisticMutation = () => {
  const datasetStore = useDatasetStore()
  const historyStore = useHistoryStore()
  const session = useSessionStore()

  const currentScope = (): MutationScope => ({
    datasetId: session.activeDatasetId,
    size: session.datasetSize,
    key: datasetQueueKey(session.activeDatasetId, session.datasetSize),
    simulate: resolveSimulateParam(session.simulate, Boolean(import.meta.dev)),
    rowIds: datasetStore.rowIds.slice(),
  })

  const isActive = (scope: MutationScope) =>
    session.activeDatasetId === scope.datasetId && session.datasetSize === scope.size

  const send = async (mutation: MutationRequestDTO, scope: MutationScope) => {
    return atlasApi.mutations.apply(scope.datasetId, mutation, {
      simulate: scope.simulate,
      size: scope.size,
    })
  }

  const { reloadFromServer, sendAll, handleFailure } = createOptimisticRemote({ isActive, send })

  const createPendingChange = (
    id: string,
    patches: Patch[],
    inversePatches: Patch[],
    bodies: RemoteMutationBody[],
  ): PendingOptimisticChange => ({
    id,
    patches,
    inversePatches,
    cancelled: false,
    remoteApplied: 0,
    mutationCount: bodies.length,
    bodies,
  })

  const addPending = (scope: MutationScope, change: PendingOptimisticChange) => {
    const list = pendingChanges.get(scope.key) ?? []
    list.push(change)
    pendingChanges.set(scope.key, list)
    return list.length
  }

  const removePending = (scope: MutationScope, id: string) => {
    const remaining = (pendingChanges.get(scope.key) ?? []).filter((item) => item.id !== id)
    if (remaining.length) pendingChanges.set(scope.key, remaining)
    else pendingChanges.delete(scope.key)
  }

  const createHistoryEntry = (input: OptimisticInput, mutationId: string): AppHistoryEntry => ({
    id: mutationId,
    type: input.type,
    summary: input.summary,
    patches: input.patches,
    inversePatches: input.inversePatches,
    timestamp: Date.now(),
    mutationId,
    applyMutations: input.mutations,
    revertMutations: input.revertMutations,
  })

  const executeFailureMessage = (error: unknown, remoteApplied: number, discarded: number) => {
    if (error instanceof VersionConflictError) {
      return `Version conflict (409). ${discarded} pending change(s) discarded.`
    }
    return remoteApplied > 0
      ? `Mutation failed after partial remote apply. ${discarded} pending change(s) discarded.`
      : `Mutation failed. ${discarded} pending change(s) discarded.`
  }

  const sendExecuteMutations = async (
    input: OptimisticInput,
    scope: MutationScope,
    change: PendingOptimisticChange,
    mutationId: string,
    shouldAbort: () => boolean,
  ) => {
    let version = remoteVersions.get(scope.key) ?? datasetStore.version
    let applied = 0
    await runRemoteChain(input.mutations, async (body, index) => {
      if (shouldAbort()) throw new Error('Optimistic mutation aborted')
      const request = toMutationRequest(
        withResolvedInsertIndex(body, scope.rowIds),
        version,
        index === 0 ? mutationId : crypto.randomUUID(),
      )
      const expectedVersion = version
      const result = await send(request, scope)
      version = result.version
      applied += 1
      remoteVersions.set(scope.key, version)
      change.remoteApplied = applied
      change.lastRemoteVersion = version
      if (
        piniaHoldsScopeSnapshot({
          piniaDatasetId: datasetStore.dataset?.id,
          piniaVersion: datasetStore.version,
          scopeDatasetId: scope.datasetId,
          versionAtApply: expectedVersion,
        })
      ) {
        datasetStore.setVersion(version)
      }
    })
    return applied
  }

  const handleExecuteFailure = async (
    error: unknown,
    scope: MutationScope,
    change: PendingOptimisticChange,
    mutationId: string,
    remoteApplied: number,
  ) => {
    if (change.cancelled) return
    if (!isActive(scope)) {
      if (remoteApplied > 0) cancelOptimisticTransport(scope.key)
      return
    }
    const current = pendingChanges.get(scope.key) ?? []
    const index = current.findIndex((item) => item.id === mutationId)
    const later = index < 0 ? [] : current.slice(index + 1)
    for (const pending of later) pending.cancelled = true
    await reloadFromServer(executeFailureMessage(error, remoteApplied, later.length + 1), scope)
  }

  const runQueuedExecute = async (
    input: OptimisticInput,
    scope: MutationScope,
    change: PendingOptimisticChange,
    mutationId: string,
    pendingToken: symbol,
  ) => {
    const shouldAbort = () => change.cancelled || !isActive(scope)
    try {
      if (shouldAbort()) return
      await syncWorker(input.patches)
      if (shouldAbort()) return
      await sendExecuteMutations(input, scope, change, mutationId, shouldAbort)
      if (shouldAbort()) return
      historyStore.record(createHistoryEntry(input, mutationId))
      session.connectionStatus = 'online'
    } catch (error) {
      await handleExecuteFailure(error, scope, change, mutationId, change.remoteApplied)
    } finally {
      removePending(scope, mutationId)
      historyStore.endPending(pendingToken)
    }
  }

  const execute = async (input: OptimisticInput) => {
    if (session.writesBlocked) {
      session.flash('Dataset is temporarily locked while a version is being restored.')
      return
    }
    if (session.workspaceLoading) {
      session.flash('Wait for the dataset to finish loading.')
      return
    }
    if (!input.mutations.length) {
      throw new Error('Optimistic mutation requires at least one mutation body')
    }

    const scope = currentScope()
    const mutationId = crypto.randomUUID()
    const change = createPendingChange(
      mutationId,
      input.patches,
      input.inversePatches,
      input.mutations,
    )
    const pendingCount = addPending(scope, change)
    const pendingToken = historyStore.beginPending()
    if (pendingCount === 1) remoteVersions.set(scope.key, datasetStore.version)

    // Local state changes immediately; enqueue before any await so restore cannot
    // slip between apply and the dataset queue (same FIFO as restore).
    datasetStore.applyLocalPatches(input.patches)
    scope.rowIds = datasetStore.rowIds.slice()
    change.rowIdsAtApply = scope.rowIds
    notifyLocalPatches(input.patches)

    void enqueueForDataset(scope.key, () =>
      runQueuedExecute(input, scope, change, mutationId, pendingToken),
    )
  }

  const rejectSyncBeforeQueue = (input: SyncRemoteInput, message: string) => {
    input.onRemoteFailure()
    session.flash(message)
    return Promise.reject(new RemoteAbortError(message))
  }

  const abortQueuedSync = (input: SyncRemoteInput, message: string): never => {
    input.onRemoteFailure()
    if (session.writesBlocked) session.flash(message)
    throw new RemoteAbortError(message)
  }

  const stageSyncPatches = (
    input: SyncRemoteInput,
    scope: MutationScope,
    change: PendingOptimisticChange,
  ) => {
    const versionAtApply = datasetStore.version
    datasetStore.applyLocalPatches(input.patches)
    addPending(scope, change)
    scope.rowIds = datasetStore.rowIds.slice()
    change.rowIdsAtApply = scope.rowIds
    return versionAtApply
  }

  const rollbackInterruptedSync = async (
    input: SyncRemoteInput,
    scope: MutationScope,
    versionAtApply: number,
  ) => {
    const sameSnapshot = shouldRollbackLeftScopePatches({
      piniaDatasetId: datasetStore.dataset?.id,
      piniaVersion: datasetStore.version,
      scopeDatasetId: scope.datasetId,
      versionAtApply,
    })
    if (!isActive(scope) && !sameSnapshot) return
    datasetStore.applyLocalPatches(input.rollbackPatches)
    await syncWorker(input.rollbackPatches)
  }

  const runQueuedSync = async (
    input: SyncRemoteInput,
    scope: MutationScope,
    change: PendingOptimisticChange,
    mutationId: string,
    pendingToken: symbol,
    lockedOut: () => boolean,
  ) => {
    try {
      if (!isActive(scope) || lockedOut()) {
        const message = session.writesBlocked
          ? 'Dataset is temporarily locked while a version is being restored.'
          : 'Dataset scope is no longer active.'
        abortQueuedSync(input, message)
      }
      const versionAtApply = stageSyncPatches(input, scope, change)
      await syncWorker(input.patches)
      if (!isActive(scope) || lockedOut()) {
        await rollbackInterruptedSync(input, scope, versionAtApply)
        const message = session.writesBlocked
          ? 'Dataset is temporarily locked while a version is being restored.'
          : 'Dataset scope is no longer active.'
        abortQueuedSync(input, message)
      }
      await sendAll(input.bodies, scope)
      if (isActive(scope)) session.connectionStatus = 'online'
    } catch (error) {
      if (error instanceof PartialRemoteSyncError || error instanceof RemoteAbortError) throw error
      input.onRemoteFailure()
      await handleFailure(error, input.rollbackPatches, scope)
    } finally {
      removePending(scope, mutationId)
      historyStore.endPending(pendingToken)
    }
  }

  const syncRemote = (input: SyncRemoteInput, options?: { allowWhileLocked?: boolean }) => {
    const lockedOut = () => session.writesBlocked && !options?.allowWhileLocked
    if (session.workspaceLoading) {
      return rejectSyncBeforeQueue(input, 'Wait for the dataset to finish loading.')
    }
    if (lockedOut()) {
      return rejectSyncBeforeQueue(
        input,
        'Dataset is temporarily locked while a version is being restored.',
      )
    }

    const scope = currentScope()
    const mutationId = crypto.randomUUID()
    const change = createPendingChange(
      mutationId,
      input.patches,
      input.rollbackPatches,
      input.bodies,
    )
    remoteVersions.set(scope.key, datasetStore.version)
    const pendingToken = historyStore.beginPending()
    return enqueueForDataset(scope.key, () =>
      runQueuedSync(input, scope, change, mutationId, pendingToken, lockedOut),
    )
  }

  return { execute, syncRemote }
}
