<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger' | 'subtle'
    size?: 'sm' | 'md'
    disabled?: boolean
  }>(),
  { variant: 'ghost', size: 'md', disabled: false },
)
</script>

<template>
  <button
    type="button"
    class="atlas-btn"
    :class="[`is-${variant}`, `is-${size}`]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.atlas-btn {
  border: 1px solid var(--atlas-border);
  background: var(--atlas-bg-muted);
  color: var(--atlas-text);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  transition: 0.15s ease;
}
.atlas-btn:hover:not(:disabled) {
  background: var(--atlas-bg-hover);
}
.atlas-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.is-sm {
  padding: 6px 10px;
  font-size: 12px;
}
.is-md {
  padding: 8px 12px;
  font-size: 13px;
}
.is-primary {
  background: var(--atlas-accent);
  border-color: transparent;
  color: #fff;
}
.is-primary:hover:not(:disabled) {
  filter: brightness(1.08);
}
.is-danger {
  color: var(--atlas-danger);
}
.is-subtle {
  background: transparent;
}
</style>
