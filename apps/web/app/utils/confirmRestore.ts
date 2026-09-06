import { snapshotToNormalized } from '@atlas/domain'
import type { DatasetSnapshotDTO } from '@atlas/contracts'
import type { Patch } from '@atlas/history-engine'
import { applySnapshotSideEffects } from '~/composables/useSnapshotSync'
import { useDatasetStore } from '~/stores/dataset'
import { useGridStore } from '~/stores/grid'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { atlasApi } from '~/utils/atlasApi'
import { cancelOptimisticTransport, inversesFromCancelled } from '~/utils/optimisticTransport'
import { datasetQueueKey } from '~/utils/remoteMutations'
import { shouldInvertStrandedAfterHeal } from '~/utils/restoreScope'

export type RestorePending = {
  targetVersion: number
  datasetId: string
  size: number
}

export const restoreConfirmGate = (input: {
  pending: RestorePending | null
  restoring: boolean
  transportBusy: boolean
  snapshotMatches: boolean
  sessionId: string
  sessionSize: number
}): 'run' | 'clear' | 'skip' => {
  if (!input.pending || input.restoring || input.transportBusy || !input.snapshotMatches) {
    return 'skip'
  }
  if (input.pending.datasetId !== input.sessionId || input.pending.size !== input.sessionSize) {
    return 'clear'
  }
  return 'run'
}

export type RestoreOnQueueInput = {
  targetVersion: number
  datasetId: string
  size: number
  scopeIsActive: () => boolean
  leftScope: (serverRestored: boolean) => boolean
  /** Server restore landed but Pinia version may not have changed — refresh the rail. */
  onServerCommitted?: () => void | Promise<void>
}

type HealOutcome = 'left' | 'committed' | 'applied-snapshot' | 'failed'

const applyRestoredSnapshot = (snapshot: DatasetSnapshotDTO) => {
  const normalized = snapshotToNormalized(snapshot.dataset, snapshot.rows)
  useDatasetStore().replaceDataset(normalized.dataset, normalized.rowsById)
  useHistoryStore().resetStack()
}

const loadRestoredSnapshot = async (input: RestoreOnQueueInput) => {
  const committed = await useDatasetStore().loadDataset(input.datasetId, input.size, {
    stillWanted: input.scopeIsActive,
  })
  if (committed) useHistoryStore().resetStack()
  return committed
}

const healLocalSnapshot = async (
  input: RestoreOnQueueInput,
  snapshot: DatasetSnapshotDTO,
): Promise<HealOutcome> => {
  if (!input.scopeIsActive()) return 'left'
  try {
    const committed = await loadRestoredSnapshot(input)
    if (!input.scopeIsActive()) return 'left'
    if (committed) return 'committed'
  } catch {
    if (!input.scopeIsActive()) return 'left'
  }
  try {
    applyRestoredSnapshot(snapshot)
    return 'applied-snapshot'
  } catch {
    return 'failed'
  }
}

const invalidateGridAcceleration = () => {
  const grid = useGridStore()
  grid.invalidateWorker()
  grid.requestSync()
}

const hydrateRestoredSnapshot = async (
  input: RestoreOnQueueInput,
  failureMessage: string,
): Promise<'ok' | 'failed' | 'left'> => {
  try {
    await applySnapshotSideEffects()
  } catch {
    if (!input.scopeIsActive()) return 'left'
    invalidateGridAcceleration()
    const session = useSessionStore()
    session.connectionStatus = 'degraded'
    session.flash(failureMessage)
    return 'failed'
  }
  return input.scopeIsActive() ? 'ok' : 'left'
}

const recoverStrandedInverses = async (
  input: RestoreOnQueueInput,
  outcome: HealOutcome,
  strandedInverses: Patch[],
): Promise<boolean | null> => {
  if (!shouldInvertStrandedAfterHeal(outcome)) return null
  if (!input.scopeIsActive()) return input.leftScope(true)
  if (strandedInverses.length) useDatasetStore().applyLocalPatches(strandedInverses)

  try {
    const committed = await loadRestoredSnapshot(input)
    if (input.scopeIsActive() && committed) {
      const hydration = await hydrateRestoredSnapshot(
        input,
        `Restored to version ${input.targetVersion} after a local apply failure — please verify the grid.`,
      )
      if (hydration === 'left') return input.leftScope(true)
      const session = useSessionStore()
      session.connectionStatus = 'degraded'
      if (hydration === 'ok') {
        session.flash(
          `Restored to version ${input.targetVersion} after a local apply failure — please verify the grid.`,
        )
      }
      return true
    }
  } catch {
    // Report the committed server restore below.
  }
  if (!input.scopeIsActive()) return input.leftScope(true)
  useSessionStore().connectionStatus = 'degraded'
  await input.onServerCommitted?.()
  throw new Error(
    'Restore applied on server but failed to update the local workspace — reload required',
  )
}

/**
 * Queue body of HistoryPanel.confirmRestore — replace / heal / stranded inverses.
 */
export const applyRestoreOnQueue = async (input: RestoreOnQueueInput): Promise<boolean> => {
  const { targetVersion, datasetId, size, scopeIsActive, leftScope } = input
  const dataset = useDatasetStore()
  const session = useSessionStore()

  if (!scopeIsActive()) return leftScope(false)
  const expectedVersion = dataset.version
  if (targetVersion < 1 || targetVersion >= expectedVersion) {
    throw new Error(`Cannot restore to v${targetVersion} from v${expectedVersion}`)
  }
  const snap = await atlasApi.datasets.restore(datasetId, targetVersion, expectedVersion, size)
  const cancelled = cancelOptimisticTransport(datasetQueueKey(datasetId, size))
  const strandedInverses = inversesFromCancelled(cancelled)

  if (!scopeIsActive()) return leftScope(true)

  try {
    applyRestoredSnapshot(snap)
  } catch {
    if (!scopeIsActive()) return leftScope(true)
    const outcome = await healLocalSnapshot(input, snap)
    if (outcome === 'left') return leftScope(true)
    const recovered = await recoverStrandedInverses(input, outcome, strandedInverses)
    if (recovered !== null) return recovered
  }

  if (!scopeIsActive()) return leftScope(true)
  const hydration = await hydrateRestoredSnapshot(
    input,
    `Restored to version ${targetVersion} — grid acceleration failed, please verify the workspace.`,
  )
  if (hydration === 'left') return leftScope(true)
  if (hydration === 'failed') return true
  session.connectionStatus = 'online'
  session.flash(`Restored to version ${targetVersion}`)
  return true
}
