import { ApiClientError, VersionConflictError } from '@atlas/api-client'
import type { MutationDraft } from '@atlas/domain'
import { atlasApi } from '~/utils/atlasApi'
import { toMutationRequest } from '~/utils/optimisticHelpers'
import {
  hasPartialRemoteApply,
  unsentBodies,
  type PendingOptimisticChange,
} from '~/utils/optimisticTransport'
import { datasetQueueKey, withResolvedInsertIndex } from '~/utils/remoteMutations'

const drains = new Map<string, Promise<void>>()

/** Test helper — drop in-flight abandoned drains between cases. */
export const resetAbandonedRemote = () => {
  drains.clear()
}

/** Wait until leftover POSTs for this dataset finish (no-op if none). */
export const waitForAbandonedRemote = (datasetId: string, size: number) =>
  drains.get(datasetQueueKey(datasetId, size)) ?? Promise.resolve()

const isDuplicateInsert = (error: unknown, body: MutationDraft) =>
  body.type === 'insert-row' &&
  error instanceof ApiClientError &&
  error.status === 400 &&
  /already exists/i.test(error.message)

const peekRemoteVersion = async (datasetId: string, size: number) => {
  const history = await atlasApi.datasets.getHistory(datasetId, size)
  return history.currentVersion
}

const sendAbandonedBody = async (
  datasetId: string,
  size: number,
  body: MutationDraft,
  rowIds: string[],
  version: number,
  mutationId?: string,
  retriedConflict = false,
): Promise<number> => {
  const id: string = mutationId ?? crypto.randomUUID()
  const request = toMutationRequest(withResolvedInsertIndex(body, rowIds), version, id)
  try {
    return (await atlasApi.mutations.apply(datasetId, request, { size })).version
  } catch (error) {
    if (isDuplicateInsert(error, body)) return peekRemoteVersion(datasetId, size)
    if (error instanceof VersionConflictError && !retriedConflict) {
      return sendAbandonedBody(datasetId, size, body, rowIds, error.currentVersion, id, true)
    }
    throw error
  }
}

const runAbandonedChain = async (
  changes: PendingOptimisticChange[],
  datasetId: string,
  size: number,
) => {
  if (!hasPartialRemoteApply(changes)) return
  for (const change of changes) {
    const remaining = unsentBodies(change)
    let version = change.lastRemoteVersion
    if (!remaining.length || version == null) continue
    const rowIds = change.rowIdsAtApply ?? []
    for (const body of remaining) {
      version = await sendAbandonedBody(datasetId, size, body, rowIds, version)
      change.remoteApplied += 1
      change.lastRemoteVersion = version
    }
  }
}

/**
 * Finish leftover POSTs for a dataset the user left. Must not touch Pinia and
 * must not use the workspace FIFO. Callers that load this dataset again must
 * `waitForAbandonedRemote` first so GET cannot outrun these POSTs.
 */
export const finishAbandonedRemote = (
  changes: PendingOptimisticChange[],
  datasetId: string,
  size: number,
) => {
  const key = datasetQueueKey(datasetId, size)
  const previous = drains.get(key) ?? Promise.resolve()
  const run = previous.then(
    () => runAbandonedChain(changes, datasetId, size),
    () => runAbandonedChain(changes, datasetId, size),
  )
  const tracked = run.then(
    () => undefined,
    () => undefined,
  )
  drains.set(key, tracked)
  void tracked.then(() => {
    if (drains.get(key) === tracked) drains.delete(key)
  })
  return run
}
