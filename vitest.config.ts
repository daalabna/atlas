import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@atlas/history-engine': fileURLToPath(new URL('packages/history-engine/src/index.ts', import.meta.url)),
      '@atlas/contracts': fileURLToPath(new URL('packages/contracts/src/index.ts', import.meta.url)),
      '@atlas/domain': fileURLToPath(new URL('packages/domain/src/index.ts', import.meta.url)),
      zod: fileURLToPath(new URL('node_modules/zod/index.js', import.meta.url)),
      '#shared': fileURLToPath(new URL('apps/web/shared', import.meta.url)),
    },
  },
})
