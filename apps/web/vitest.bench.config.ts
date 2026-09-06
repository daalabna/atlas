import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const packages = fileURLToPath(new URL('../../packages', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['../../benchmarks/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@atlas/virtual-grid': `${packages}/virtual-grid/src/index.ts`,
      '@atlas/data-engine': `${packages}/data-engine/src/index.ts`,
      '@atlas/history-engine': `${packages}/history-engine/src/index.ts`,
      '@atlas/domain': `${packages}/domain/src/index.ts`,
    },
  },
})
