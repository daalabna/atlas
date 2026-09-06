<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

const props = defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()

const titleId = useId()
const dialogRef = ref<HTMLElement | null>(null)
let lastFocus: HTMLElement | null = null

const focusables = () => {
  const root = dialogRef.value
  if (!root) return []
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ]
}

const onKeydown = (event: KeyboardEvent) => {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const nodes = focusables()
  if (!nodes.length) return
  const first = nodes[0]!
  const last = nodes[nodes.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
    return
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      window.addEventListener('keydown', onKeydown)
      await nextTick()
      const nodes = focusables()
      ;(nodes[0] ?? dialogRef.value)?.focus()
      return
    }
    window.removeEventListener('keydown', onKeydown)
    lastFocus?.focus()
    lastFocus = null
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="atlas-dialog-backdrop" @click.self="emit('close')">
      <div
        ref="dialogRef"
        class="atlas-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        tabindex="-1"
      >
        <header v-if="title" :id="titleId">{{ title }}</header>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.atlas-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 10, 0.72);
  display: grid;
  place-items: center;
  z-index: 80;
}
.atlas-dialog {
  width: min(520px, calc(100vw - 32px));
  background: var(--atlas-bg-elevated);
  border: 1px solid var(--atlas-border);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--atlas-shadow);
}
.atlas-dialog:focus {
  outline: none;
}
header {
  font-weight: 600;
  margin-bottom: 12px;
}
</style>
