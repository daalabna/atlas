import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@atlas/domain': fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
      '@atlas/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
})
