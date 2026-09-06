<script setup lang="ts">
defineProps<{
  rowCount: number
  rendered: number
  selected: number
  processing: boolean
}>()
</script>

<template>
  <footer class="status-bar">
    <span>{{ rowCount.toLocaleString('en-US') }} visible rows</span>
    <span>{{ rendered }} DOM rows</span>
    <span>{{ selected }} selected</span>
    <span>{{ processing ? 'query running…' : 'idle' }}</span>
    <span class="status-hint"
      >checkbox / Ctrl+click / Shift+click · dblclick to edit · Ctrl+Z undo</span
    >
  </footer>
</template>
