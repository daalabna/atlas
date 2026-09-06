<script setup lang="ts">
import type { NuxtError } from '#app'
import { AtlasButton } from '@atlas/ui'

const props = defineProps<{ error: NuxtError }>()
const status = computed(() => props.error.status ?? props.error.statusCode ?? 500)
const message = computed(() => props.error.message ?? 'Something went wrong')

const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="landing atlas-ui">
    <h1 id="error-title">{{ status }}</h1>
    <p id="error-message" role="alert" aria-live="assertive">{{ message }}</p>
    <p class="landing-actions">
      <AtlasButton variant="primary" aria-describedby="error-title error-message" @click="handleError">
        Back to Atlas
      </AtlasButton>
    </p>
  </div>
</template>
