import type { MutationDraft } from '@atlas/domain'

export const datasetQueueKey = (datasetId: string, size: number) =>
  JSON.stringify([datasetId, size])

/** insert-row draft — from the request DTO so `index` is always a known field. */
export type InsertRowDraft = Extract<MutationDraft, { type: 'insert-row' }>

/** After local restore, resolve insert index from the already-correct local order. */
export function withResolvedInsertIndex(body: InsertRowDraft, rowIds: string[]): InsertRowDraft
export function withResolvedInsertIndex(body: MutationDraft, rowIds: string[]): MutationDraft
export function withResolvedInsertIndex(body: MutationDraft, rowIds: string[]): MutationDraft {
  if (body.type !== 'insert-row') return body
  const rowId = body.rowId
  if (!rowId) return body
  const index = rowIds.indexOf(rowId)
  if (index < 0) return body
  return { ...body, index }
}

/** True when at least one remote step landed before the chain failed → must reload. */
export const shouldReloadAfterChainFailure = (applied: number): boolean => applied > 0

/**
 * Runs ordered remote steps. `onApplied` reports successful step count after each send,
 * so callers still know `applied` when a later step throws.
 */
export const runRemoteChain = async <T>(
  bodies: readonly T[],
  send: (body: T, index: number) => Promise<void>,
  onApplied?: (applied: number) => void,
): Promise<{ applied: number }> => {
  let applied = 0
  for (const [i, body] of bodies.entries()) {
    await send(body, i)
    applied += 1
    onApplied?.(applied)
  }
  return { applied }
}

/** Workspace-wide FIFO — Pinia holds one active dataset, so all transport shares one queue. */
const WORKSPACE_QUEUE = '__atlas_workspace__'
const queues = new Map<string, Promise<unknown>>()

/** Test helper — drop queue tails so suites do not leak hung tasks. */
export const resetDatasetQueues = () => {
  queues.clear()
}

/**
 * Enqueue work serialized against the shared workspace store.
 * `queueKey` is retained for cancelOptimisticTransport / pending bookkeeping identity;
 * all tasks run on one FIFO so size/id switches cannot overlap patches.
 */
export const enqueueForDataset = <T>(_queueKey: string, task: () => Promise<T>): Promise<T> => {
  const previous = queues.get(WORKSPACE_QUEUE) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  queues.set(WORKSPACE_QUEUE, tail)
  void tail.then(() => {
    if (queues.get(WORKSPACE_QUEUE) === tail) queues.delete(WORKSPACE_QUEUE)
  })
  return run
}
