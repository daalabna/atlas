<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    /** Prefer below for toolbars under a sticky header. */
    placement?: 'top' | 'bottom'
  }>(),
  { placement: 'bottom' },
)
</script>

<template>
  <span class="atlas-tooltip" :data-placement="placement">
    <slot />
    <span class="atlas-tooltip-label" role="tooltip">{{ label }}</span>
  </span>
</template>

<style scoped>
.atlas-tooltip {
  position: relative;
  display: inline-flex;
  z-index: 1;
}
.atlas-tooltip-label {
  display: none;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background: #0a0c11;
  border: 1px solid var(--atlas-border, #2a3142);
  color: var(--atlas-text, #e8ecf4);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  z-index: 60;
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.atlas-tooltip[data-placement='top'] .atlas-tooltip-label {
  bottom: calc(100% + 8px);
}
.atlas-tooltip[data-placement='bottom'] .atlas-tooltip-label {
  top: calc(100% + 8px);
}
.atlas-tooltip:hover,
.atlas-tooltip:focus-within {
  z-index: 60;
}
.atlas-tooltip:hover .atlas-tooltip-label,
.atlas-tooltip:focus-within .atlas-tooltip-label {
  display: block;
}
</style>
