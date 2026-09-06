/** UI list row for local history — subset of a full history entry. */
export type HistoryMeta = {
  id: string
  type: string
  timestamp: number
  summary: string
}

/** Narrow any history-like entry to the fields the history panel displays. */
export const toHistoryMeta = (entry: HistoryMeta): HistoryMeta => ({
  id: entry.id,
  type: entry.type,
  timestamp: entry.timestamp,
  summary: entry.summary,
})
