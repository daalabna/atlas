import { VersionConflictError } from '@atlas/api-client'
import type { MutationRequestDTO } from '@atlas/contracts'
import type { Patch } from '@atlas/history-engine'
import { useDatasetStore } from '~/stores/dataset'
import { useSessionStore } from '~/stores/session'
import type { RemoteMutationBody } from '~/utils/historyTypes'
import { toMutationRequest } from '~/utils/optimisticHelpers'
import { reloadOptimisticFromServer } from '~/utils/optimisticReload'
import {
  PartialRemoteSyncError,
  pendingChanges,
  remoteVersions,
  type MutationScope,
} from '~/utils/optimisticTransport'
import {
  runRemoteChain,
  shouldReloadAfterChainFailure,
  withResolvedInsertIndex,
} from '~/utils/remoteMutations'
import { piniaHoldsScopeSnapshot } from '~/utils/workspaceLoad'
import { syncWorker } from './optimisticWorkerSync'

export interface OptimisticRemoteDeps {
  isActive: (scope: MutationScope) => boolean
  send: (mutation: MutationRequestDTO, scope: MutationScope) => Promise<{ version: number }>
}

export const createOptimisticRemote = (deps: OptimisticRemoteDeps) => {
  const datasetStore = useDatasetStore()
  const session = useSessionStore()
  const { isActive, send } = deps

  const reloadFromServer = (message: string, scope: MutationScope) =>
    reloadOptimisticFromServer(message, scope, () => isActive(scope))

  const sendAll = async (bodies: RemoteMutationBody[], scope: MutationScope) => {
    let lastVersion = remoteVersions.get(scope.key) ?? datasetStore.version
    let applied = 0
    try {
      await runRemoteChain(
        bodies,
        async (body) => {
          const resolved = withResolvedInsertIndex(body, scope.rowIds)
          const expectedVersion = lastVersion
          const response = await send(
            toMutationRequest(resolved, lastVersion, crypto.randomUUID()),
            scope,
          )
          lastVersion = response.version
          remoteVersions.set(scope.key, response.version)
          if (
            piniaHoldsScopeSnapshot({
              piniaDatasetId: datasetStore.dataset?.id,
              piniaVersion: datasetStore.version,
              scopeDatasetId: scope.datasetId,
              versionAtApply: expectedVersion,
            })
          ) {
            datasetStore.setVersion(response.version)
          }
        },
        (count) => {
          applied = count
          const last = pendingChanges.get(scope.key)?.at(-1)
          if (last) {
            last.remoteApplied = count
            last.lastRemoteVersion = lastVersion
          }
        },
      )
      return lastVersion
    } catch (error) {
      if (shouldReloadAfterChainFailure(applied)) {
        await reloadFromServer(
          'Remote sync partially failed; workspace reloaded from the server.',
          scope,
        )
        throw new PartialRemoteSyncError(
          error instanceof Error ? error.message : 'Partial remote sync failed',
        )
      }
      throw error
    }
  }

  const handleFailure = async (error: unknown, rollbackPatches: Patch[], scope: MutationScope) => {
    if (error instanceof PartialRemoteSyncError) {
      throw error
    }

    if (isActive(scope)) {
      datasetStore.applyLocalPatches(rollbackPatches)
      await syncWorker(rollbackPatches)
    }

    if (error instanceof VersionConflictError) {
      await reloadFromServer(
        `Version conflict (409). Server is at v${error.currentVersion}. Local change rolled back.`,
        scope,
      )
      throw error
    }

    if (isActive(scope)) {
      session.connectionStatus = 'degraded'
      session.flash(error instanceof Error ? error.message : 'Mutation failed and was rolled back.')
    }
    throw error
  }

  return { reloadFromServer, sendAll, handleFailure }
}
