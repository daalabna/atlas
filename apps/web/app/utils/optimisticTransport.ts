import type { MutationDraft } from '@atlas/domain'
import type { Patch } from '@atlas/history-engine'

export interface OptimisticInput {
  type: MutationDraft['type']
  summary: string
  patches: Patch[]
  inversePatches: Patch[]
  mutations: MutationDraft[]
  revertMutations: MutationDraft[]
}

export class PartialRemoteSyncError extends Error {
  readonly reloaded = true
  constructor(message = 'Partial remote sync failed; reloaded from server') {
    super(message)
    this.name = 'PartialRemoteSyncError'
  }
}

/** Thrown after onRemoteFailure already repaired the undo/redo stack — do not repair again. */
export class RemoteAbortError extends Error {
  readonly aborted = true as const
  constructor(message: string) {
    super(message)
    this.name = 'RemoteAbortError'
  }
}

export interface PendingOptimisticChange {
  id: string
  patches: Patch[]
  inversePatches: Patch[]
  cancelled: boolean
  /** Successful remote steps — invert only when this is still 0. */
  remoteApplied: number
  mutationCount: number
  bodies?: MutationDraft[]
  /** Version after the last successful POST — needed to finish an abandoned chain. */
  lastRemoteVersion?: number
  /** Row order after local apply — resolve leftover insert-row indices. */
  rowIdsAtApply?: string[]
}

export interface MutationScope {
  datasetId: string
  size: number
  key: string
  simulate?: 'conflict' | 'error' | 'slow'
  rowIds: string[]
}

export const pendingChanges = new Map<string, PendingOptimisticChange[]>()
export const remoteVersions = new Map<string, number>()

/** Test / HMR helper — clears module-scoped optimistic transport state. */
export const resetOptimisticMutationState = () => {
  pendingChanges.clear()
  remoteVersions.clear()
}

/**
 * Cancel in-flight optimistic transport for a dataset queue key (restore / abandon).
 * Marks pending changes cancelled so queued tasks skip POST after a snapshot replace.
 * Returns the cancelled entries — invert later via `inversesFromCancelled` so a POST
 * that lands after cancel is not rolled back locally.
 */
export const cancelOptimisticTransport = (queueKey: string): PendingOptimisticChange[] => {
  const pending = pendingChanges.get(queueKey) ?? []
  for (const change of pending) {
    if (change) change.cancelled = true
  }
  pendingChanges.delete(queueKey)
  remoteVersions.delete(queueKey)
  return pending.filter((change): change is PendingOptimisticChange => Boolean(change))
}

/** Newest-first inverses for changes that never reached the server. */
export const inversesFromCancelled = (changes: PendingOptimisticChange[]): Patch[] => {
  const inverses: Patch[] = []
  for (let i = changes.length - 1; i >= 0; i--) {
    const change = changes[i]
    if (!change || change.remoteApplied > 0) continue
    inverses.push(...change.inversePatches)
  }
  return inverses
}

/** Some but not all bodies of a change POSTed — invert cannot heal; reload instead. */
export const hasPartialRemoteApply = (changes: PendingOptimisticChange[]) =>
  changes.some(
    (change) => change.remoteApplied > 0 && change.remoteApplied < change.mutationCount,
  )

export const unsentBodies = (change: PendingOptimisticChange): MutationDraft[] =>
  (change.bodies ?? []).slice(change.remoteApplied)

/** Drop locally restored rows whose insert-row bodies never reached the server. */
export const dropUnsentInsertPatches = (
  rowIds: string[],
  rowsById: Record<string, { id: string; cells: Record<string, unknown> }>,
  bodies: MutationDraft[],
): Patch[] => {
  const removeIds = new Set(
    bodies.flatMap((body) => {
      if (body.type !== 'insert-row' || !body.rowId || !rowsById[body.rowId]) return []
      return [body.rowId]
    }),
  )
  if (!removeIds.size) return []
  const nextIds = rowIds.filter((id) => !removeIds.has(id))
  const patches: Patch[] = [{ path: ['rowIds'], oldValue: rowIds, newValue: nextIds }]
  for (const id of removeIds) {
    const row = rowsById[id]
    if (!row) continue
    patches.push({
      path: ['rowsById', id],
      oldValue: { id: row.id, cells: { ...row.cells } },
      newValue: undefined,
    })
  }
  return patches
}
