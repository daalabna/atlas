<script setup lang="ts">
import { AtlasButton, AtlasDialog } from '@atlas/ui'
import { useSessionStore } from '~/stores/session'

const session = useSessionStore()
</script>

<template>
  <div class="app-shell atlas-ui">
    <header class="app-header">
      <div class="brand">
        <div class="brand-mark">A</div>
        Atlas
      </div>
      <div class="header-meta">
        <span>{{ session.user.name }}</span>
        <span>{{ session.workspaceId }}</span>
        <span>status: {{ session.connectionStatus }}</span>
      </div>
    </header>
    <slot />
    <AtlasDialog
      :open="Boolean(session.notice)"
      title="Workspace notice"
      @close="session.notice = null"
    >
      <p data-testid="notice">{{ session.notice }}</p>
      <div class="notice-actions">
        <AtlasButton variant="primary" size="sm" @click="session.notice = null">OK</AtlasButton>
      </div>
    </AtlasDialog>
  </div>
</template>
