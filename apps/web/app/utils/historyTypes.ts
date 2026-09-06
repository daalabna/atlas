import type { MutationDraft } from '@atlas/domain'
import type { HistoryEntry } from '@atlas/history-engine'

/** Alias — single source is `MutationDraft` in `@atlas/domain`. */
export type RemoteMutationBody = MutationDraft

export type AppHistoryEntry = HistoryEntry<RemoteMutationBody>
