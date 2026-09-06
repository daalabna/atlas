import { computed } from 'vue'
import { toHistoryMeta } from '@atlas/domain'
import { useEditorStore } from '~/stores/editor'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { useOptimisticMutation } from './useOptimisticMutation'

const LOCK_NOTICE = 'Dataset is temporarily locked while a version is being restored.'
const LOAD_NOTICE = 'Wait for the dataset to finish loading.'

export const useHistory = () => {
  const historyStore = useHistoryStore()
  const session = useSessionStore()
  const editor = useEditorStore()
  const optimistic = useOptimisticMutation()

  const undo = async () => {
    if (session.writesBlocked) {
      session.flash(LOCK_NOTICE)
      return
    }
    if (session.workspaceLoading) {
      session.flash(LOAD_NOTICE)
      return
    }
    if (historyStore.pendingCount > 0) {
      session.flash('Wait for the current change to finish before undoing.')
      return
    }
    if (!historyStore.canUndo) return
    const entry = historyStore.peekPast()
    if (!entry) return
    if (!entry.revertMutations?.length) {
      session.flash('Cannot undo a local-only change — reload the dataset.')
      return
    }

    // Lock before moving the stack so execute/toolbar cannot clobber the undo.
    const lock = session.beginWriteLock()
    editor.cancelEditing()
    try {
      const moved = historyStore.undo()
      if (!moved) return
      let repaired = false
      const repair = () => {
        if (repaired) return
        repaired = true
        historyStore.redo()
      }
      try {
        await optimistic.syncRemote(
          {
            patches: entry.inversePatches,
            rollbackPatches: entry.patches,
            bodies: entry.revertMutations,
            onRemoteFailure: repair,
          },
          { allowWhileLocked: true },
        )
      } catch {
        // syncRemote already rolled back patches + flashed / aborted
      }
    } finally {
      session.endWriteLock(lock)
    }
  }
  const redo = async () => {
    if (session.writesBlocked) {
      session.flash(LOCK_NOTICE)
      return
    }
    if (session.workspaceLoading) {
      session.flash(LOAD_NOTICE)
      return
    }
    if (historyStore.pendingCount > 0) {
      session.flash('Wait for the current change to finish before redoing.')
      return
    }
    if (!historyStore.canRedo) return
    const entry = historyStore.peekFuture()
    if (!entry) return
    if (!entry.applyMutations?.length) {
      session.flash('Cannot redo a local-only change — reload the dataset.')
      return
    }

    const lock = session.beginWriteLock()
    editor.cancelEditing()
    try {
      const moved = historyStore.redo()
      if (!moved) return
      let repaired = false
      const repair = () => {
        if (repaired) return
        repaired = true
        historyStore.undo()
      }
      try {
        await optimistic.syncRemote(
          {
            patches: entry.patches,
            rollbackPatches: entry.inversePatches,
            bodies: entry.applyMutations,
            onRemoteFailure: repair,
          },
          { allowWhileLocked: true },
        )
      } catch {
        // handled in syncRemote
      }
    } finally {
      session.endWriteLock(lock)
    }
  }
  return {
    entries: computed(() => historyStore.entries.map(toHistoryMeta)),
    canUndo: computed(() => historyStore.canUndo),
    canRedo: computed(() => historyStore.canRedo),
    undo,
    redo,
  }
}
