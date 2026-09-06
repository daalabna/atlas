import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  peekFuture,
  peekPast,
  pushEntry,
  redo as redoHistory,
  undo as undoHistory,
  type HistoryState,
} from '@atlas/history-engine'
import type { AppHistoryEntry, RemoteMutationBody } from '~/utils/historyTypes'
export const useHistoryStore = defineStore('history', () => {
  const history = shallowRef<HistoryState<RemoteMutationBody>>(createHistory())
  const pendingCount = ref(0)
  const pendingTokens = new Set<symbol>()
  const canUndo = computed(() => pendingCount.value === 0 && historyCanUndo(history.value))
  const canRedo = computed(() => pendingCount.value === 0 && historyCanRedo(history.value))
  const entries = computed(() => [...history.value.past].reverse())
  const record = (entry: AppHistoryEntry) => {
    history.value = pushEntry(history.value, entry)
  }
  const undo = (): AppHistoryEntry | null => {
    const result = undoHistory(history.value)
    history.value = result.history
    return result.entry
  }
  const redo = (): AppHistoryEntry | null => {
    const result = redoHistory(history.value)
    history.value = result.history
    return result.entry
  }
  const beginPending = () => {
    const token = Symbol('history-pending')
    pendingTokens.add(token)
    pendingCount.value = pendingTokens.size
    return token
  }
  const endPending = (token: symbol) => {
    pendingTokens.delete(token)
    pendingCount.value = pendingTokens.size
  }
  /** Clears undo/redo stacks without touching in-flight pending tokens. */
  const resetStack = () => {
    history.value = createHistory()
  }
  /** Full reset for load/reload — drops stacks and pending bookkeeping. */
  const reset = () => {
    resetStack()
    pendingTokens.clear()
    pendingCount.value = 0
  }
  return {
    history,
    pendingCount,
    canUndo,
    canRedo,
    entries,
    record,
    undo,
    redo,
    beginPending,
    endPending,
    peekPast: () => peekPast(history.value),
    peekFuture: () => peekFuture(history.value),
    resetStack,
    reset,
  }
})
