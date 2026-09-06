import { onMounted, onUnmounted } from 'vue'
import { useHistory } from './useHistory'
import { useCellEditor } from './useCellEditor'

/** Window-level undo/redo — uses event.code so RU/EN layouts both work. */
export const useKeyboardShortcuts = () => {
  const history = useHistory()
  const editor = useCellEditor()

  const onKeydown = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return
    if (editor.isEditing.value) return

    const target = event.target as HTMLElement | null
    const tag = target?.tagName?.toLowerCase()
    const typing =
      tag === 'input' ||
      tag === 'textarea' ||
      Boolean(target?.isContentEditable)
    // Allow shortcuts from selects/buttons; only block real text fields.
    if (typing) return

    // Physical keys — works on Russian layout (Ctrl+Я → KeyZ).
    if (event.code === 'KeyZ') {
      event.preventDefault()
      event.stopPropagation()
      if (event.shiftKey) void history.redo()
      else void history.undo()
      return
    }
    if (event.code === 'KeyY') {
      event.preventDefault()
      event.stopPropagation()
      void history.redo()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown, true)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown, true)
  })
}
