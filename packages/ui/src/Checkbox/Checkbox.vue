<script setup lang="ts">
withDefaults(
  defineProps<{ modelValue: boolean; label?: string; size?: 'sm' | 'md' }>(),
  { size: 'md', label: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="atlas-check" :class="`is-${size}`">
    <input
      type="checkbox"
      :checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span v-if="label">{{ label }}</span>
  </label>
</template>

<style scoped>
.atlas-check {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  line-height: 1.2;
  white-space: nowrap;
}
.atlas-check.is-sm {
  gap: 6px;
  font-size: 12px;
}
.atlas-check.is-sm input {
  width: 13px;
  height: 13px;
}
</style>
