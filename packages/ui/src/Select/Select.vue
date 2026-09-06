<script setup lang="ts">
defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    modelValue: string
    options: Array<{ value: string; label: string }>
    size?: 'sm' | 'md'
    disabled?: boolean
  }>(),
  { size: 'md', disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <select
    v-bind="$attrs"
    class="atlas-select"
    :class="`is-${size}`"
    :value="modelValue"
    :disabled="disabled"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>

<style scoped>
.atlas-select {
  width: 100%;
  min-width: 0;
  background: var(--atlas-bg-muted);
  border: 1px solid var(--atlas-border);
  color: var(--atlas-text);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  line-height: 1.2;
}
.atlas-select:focus {
  border-color: var(--atlas-accent);
  box-shadow: 0 0 0 3px var(--atlas-accent-soft);
  outline: none;
}
.atlas-select.is-sm {
  padding: 5px 22px 5px 8px;
  font-size: 12px;
  border-radius: 6px;
}
.atlas-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
