import { MutationRequestSchema, type MutationRequestDTO } from '@atlas/contracts'
import type { Patch } from '@atlas/history-engine'
import type { MutationDraft } from '@atlas/domain'
import type { SimulateMode } from '~/stores/session'

export const toMutationRequest = (
  body: MutationDraft,
  expectedVersion: number,
  mutationId: string,
): MutationRequestDTO =>
  MutationRequestSchema.parse({
    ...body,
    expectedVersion,
    mutationId,
  })

export const isStructuralPatches = (patches: Patch[]) =>
  patches.some(
    (patch) =>
      patch.path[0] === 'rowIds' || (patch.path[0] === 'rowsById' && patch.path.length === 2),
  )

export const collectTouchIds = (patches: Patch[]) => {
  const touched = new Set<string>()
  const removed = new Set<string>()
  for (const patch of patches) {
    if (patch.path[0] === 'rowsById' && typeof patch.path[1] === 'string') {
      if (patch.newValue === undefined) removed.add(patch.path[1])
      else touched.add(patch.path[1])
    }
  }
  return { touchedIds: [...touched], removedIds: [...removed] }
}

/** Fault injection is a local-demo tool — never send outside development. */
export const resolveSimulateParam = (
  mode: SimulateMode,
  isDev: boolean,
): 'conflict' | 'error' | 'slow' | undefined => {
  if (!isDev || mode === 'none') return undefined
  return mode
}
