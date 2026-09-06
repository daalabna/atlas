import type { Patch } from './patch'

export interface HistoryEntry<TCommand = unknown> {
  id: string
  type: string
  summary: string
  patches: Patch[]
  inversePatches: Patch[]
  timestamp: number
  mutationId?: string
  applyMutations?: TCommand[]
  revertMutations?: TCommand[]
}

export interface HistoryState<TCommand = unknown> {
  past: HistoryEntry<TCommand>[]
  future: HistoryEntry<TCommand>[]
}

export const createHistory = <TCommand = unknown>(): HistoryState<TCommand> => {
  return { past: [], future: [] }
}

export const pushEntry = <TCommand>(
  history: HistoryState<TCommand>,
  entry: HistoryEntry<TCommand>,
): HistoryState<TCommand> => {
  return {
    past: [...history.past, entry],
    future: [],
  }
}

export const undo = <TCommand>(
  history: HistoryState<TCommand>,
): {
  history: HistoryState<TCommand>
  entry: HistoryEntry<TCommand> | null
} => {
  if (history.past.length === 0) return { history, entry: null }
  const entry = history.past[history.past.length - 1]!
  return {
    entry,
    history: {
      past: history.past.slice(0, -1),
      future: [entry, ...history.future],
    },
  }
}

export const redo = <TCommand>(
  history: HistoryState<TCommand>,
): {
  history: HistoryState<TCommand>
  entry: HistoryEntry<TCommand> | null
} => {
  if (history.future.length === 0) return { history, entry: null }
  const entry = history.future[0]!
  return {
    entry,
    history: {
      past: [...history.past, entry],
      future: history.future.slice(1),
    },
  }
}

export const discardLast = <TCommand>(history: HistoryState<TCommand>): HistoryState<TCommand> => {
  if (history.past.length === 0) return history
  return {
    past: history.past.slice(0, -1),
    future: history.future,
  }
}

export const peekPast = <TCommand>(history: HistoryState<TCommand>): HistoryEntry<TCommand> | null => {
  if (history.past.length === 0) return null
  return history.past[history.past.length - 1]!
}

export const peekFuture = <TCommand>(history: HistoryState<TCommand>): HistoryEntry<TCommand> | null => {
  if (history.future.length === 0) return null
  return history.future[0]!
}

export const canUndo = <TCommand>(history: HistoryState<TCommand>): boolean => {
  return history.past.length > 0
}

export const canRedo = <TCommand>(history: HistoryState<TCommand>): boolean => {
  return history.future.length > 0
}
