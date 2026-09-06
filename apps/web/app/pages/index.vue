<script setup lang="ts"></script>

<template>
  <div class="landing atlas-ui">
    <p class="landing-eyebrow">
      High-Performance Data Workspace
    </p>
    <h1>Atlas</h1>
    <p>
      A Vue 3 / Nuxt workspace for 100k+ structured records: virtualized grid, normalized Pinia
      state, patch-based undo/redo, optimistic mutations and Web Workers — without turning the UI
      into the domain.
    </p>
    <p class="landing-actions">
      <NuxtLink to="/datasets/customers" class="landing-cta" data-testid="open-workspace">
        Open workspace
      </NuxtLink>
    </p>
    <div class="cards">
      <div class="card">
        <h3>Rendering</h3>
        <p>100,000 rows become ~40 DOM nodes through a dedicated virtualizer.</p>
      </div>
      <div class="card">
        <h3>History</h3>
        <p>Undo/redo applies inverse patches and syncs compensating mutations to the server.</p>
      </div>
      <div class="card">
        <h3>API boundary</h3>
        <p>Zod validates DTOs. 409 conflicts roll back the optimistic state.</p>
      </div>
    </div>
  </div>
</template>
