import type { Row, RowId } from '@atlas/domain'

export const WORKER_CHUNK = 2_500

const yieldToMain = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 32 })
      return
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })

export type ChunkedHydrateInput = {
  rowIds: RowId[]
  getRow: (id: RowId) => Row | undefined
  init: (rowIds: RowId[], rows: Row[]) => Promise<unknown>
  patchRows: (rows: Row[]) => Promise<unknown>
  shouldAbort?: () => boolean
  /**
   * Called when row membership may have changed mid-hydrate.
   * Prefer pairing with `getLiveRowIds` + `rowIdsAtStart` (array identity).
   */
  onRowCountChange?: (expected: number, actual: number) => boolean
  /** Live row count (e.g. Pinia). Defaults to the snapshot `rowIds.length`. */
  getLiveRowCount?: () => number
  /**
   * Live `rowIds` array from the store. Compared by reference to `rowIdsAtStart`
   * so delete+insert with the same length still aborts hydrate.
   */
  getLiveRowIds?: () => RowId[]
  /** Store `rowIds` reference captured when hydrate started (not a sliced copy). */
  rowIdsAtStart?: RowId[]
  expectedRowCount?: number
}

const collectChunk = (
  rowIds: RowId[],
  start: number,
  end: number,
  getRow: (id: RowId) => Row | undefined,
): Row[] => {
  const chunk: Row[] = []
  for (let i = start; i < end; i++) {
    const id = rowIds[i]
    if (id === undefined) continue
    const row = getRow(id)
    if (row) chunk.push(row)
  }
  return chunk
}

const membershipIntact = (input: ChunkedHydrateInput, expectedCount: number): boolean => {
  const liveIds = input.getLiveRowIds?.()
  if (input.rowIdsAtStart && liveIds && liveIds !== input.rowIdsAtStart) {
    input.onRowCountChange?.(expectedCount, liveIds.length)
    return false
  }
  const liveCount = input.getLiveRowCount?.() ?? liveIds?.length ?? input.rowIds.length
  if (liveCount !== expectedCount) {
    input.onRowCountChange?.(expectedCount, liveCount)
    return false
  }
  if (input.onRowCountChange && !input.onRowCountChange(expectedCount, liveCount)) return false
  return true
}

/** Progressive worker cache fill shared by grid mount and snapshot reload. */
export const chunkedWorkerHydrate = async (input: ChunkedHydrateInput): Promise<boolean> => {
  const expectedCount = input.expectedRowCount ?? input.rowIds.length

  const first = collectChunk(input.rowIds, 0, Math.min(WORKER_CHUNK, input.rowIds.length), input.getRow)
  await input.init(input.rowIds, first)
  if (input.shouldAbort?.()) return false
  if (!membershipIntact(input, expectedCount)) return false

  for (let offset = WORKER_CHUNK; offset < input.rowIds.length; offset += WORKER_CHUNK) {
    if (input.shouldAbort?.()) return false
    if (!membershipIntact(input, expectedCount)) return false
    const end = Math.min(offset + WORKER_CHUNK, input.rowIds.length)
    await input.patchRows(collectChunk(input.rowIds, offset, end, input.getRow))
    if (input.shouldAbort?.()) return false
    await yieldToMain()
  }
  return !input.shouldAbort?.()
}

type SharedHydrate = {
  generation: number
  promise: Promise<boolean>
}

let inFlight: SharedHydrate | null = null
let hydrateGate: Promise<void> = Promise.resolve()

/** Test helper — drop the module-level hydrate join between cases. */
export const resetSharedWorkerHydrate = () => {
  inFlight = null
  hydrateGate = Promise.resolve()
}

/**
 * One hydrate per worker generation. Snapshot reload and useGrid join the same
 * promise so restore/409 cannot interleave two init/patch-rows streams.
 * A newer generation waits for the previous run to abort before calling init.
 */
export const joinChunkedWorkerHydrate = (
  generation: number,
  input: ChunkedHydrateInput,
): Promise<boolean> => {
  if (inFlight && inFlight.generation === generation) return inFlight.promise

  const previous = hydrateGate
  let release = () => {}
  hydrateGate = new Promise<void>((resolve) => {
    release = resolve
  })
  const run = (async () => {
    try {
      await previous
      if (input.shouldAbort?.()) return false
      return await chunkedWorkerHydrate(input)
    } finally {
      if (inFlight?.generation === generation) inFlight = null
      release()
    }
  })()
  inFlight = { generation, promise: run }
  return run
}
