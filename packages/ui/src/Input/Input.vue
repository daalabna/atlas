<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    size?: 'sm' | 'md'
    disabled?: boolean
  }>(),
  { size: 'md', disabled: false, placeholder: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <input
    class="atlas-input"
    :class="`is-${size}`"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="onInput"
  />
</template>

<style scoped>
.atlas-input {
  width: 100%;
  min-width: 0;
  background: var(--atlas-bg-muted);
  border: 1px solid var(--atlas-border);
  color: var(--atlas-text);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  line-height: 1.2;
  outline: none;
}
.atlas-input.is-sm {
  padding: 5px 8px;
  font-size: 12px;
  border-radius: 6px;
}
.atlas-input:focus {
  border-color: var(--atlas-accent);
  box-shadow: 0 0 0 3px var(--atlas-accent-soft);
}
.atlas-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
