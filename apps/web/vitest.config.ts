import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'

const alias = {
  '~': fileURLToPath(new URL('./app', import.meta.url)),
  '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
  '@atlas/history-engine': fileURLToPath(
    new URL('../../packages/history-engine/src/index.ts', import.meta.url),
  ),
  '@atlas/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
  '@atlas/domain': fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url)),
  '@atlas/api-client': fileURLToPath(new URL('../../packages/api-client/src/index.ts', import.meta.url)),
  '@atlas/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
}

const setupFiles = ['./test-utils/vitest.setup.ts']
const plugins = [vue()]

export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          setupFiles,
          include: [
            'app/utils/**/*.test.ts',
            'app/composables/**/*.test.ts',
            'app/stores/**/*.test.ts',
            'server/utils/**/*.test.ts',
          ],
          exclude: ['app/stores/session.test.ts', 'app/composables/useGrid.workerRecovery.test.ts'],
        },
      },
      {
        plugins,
        resolve: { alias },
        test: {
          name: 'components',
          environment: 'happy-dom',
          setupFiles,
          include: [
            'app/components/**/*.test.ts',
            'app/stores/session.test.ts',
            'app/composables/useGrid.workerRecovery.test.ts',
          ],
        },
      },
    ],
  },
})
