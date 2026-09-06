<script setup lang="ts">
import type { CellValue } from '@atlas/domain'

defineProps<{ modelValue: CellValue; ariaLabel?: string; invalid?: boolean }>()
const emit = defineEmits<{ update: [value: CellValue]; commit: []; cancel: [] }>()

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update', target.value)
}
</script>

<template>
  <input
    data-testid="cell-editor"
    :value="String(modelValue ?? '')"
    :aria-label="ariaLabel"
    :aria-invalid="invalid || undefined"
    autofocus
    @input="onInput"
    @keydown.enter.prevent="emit('commit')"
    @keydown.esc.prevent="emit('cancel')"
  />
</template>
