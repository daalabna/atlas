import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'

const packagesRoot = fileURLToPath(new URL('../../packages', import.meta.url))

export default defineNuxtConfig({
  // Bind IPv4: on Windows Nuxt otherwise listens on ::1 and the browser cannot connect.
  devServer: {
    host: '127.0.0.1',
    port: 3000,
  },
  css: [
    fileURLToPath(new URL('../../packages/ui/src/styles/tokens.css', import.meta.url)),
    '~/assets/app.css',
  ],
  modules: ['@pinia/nuxt', '@nuxt/fonts'],
  routeRules: {
    '/datasets/**': { ssr: false },
  },
  fonts: {
    processCSSVariables: true,
    families: [
      { name: 'IBM Plex Sans', weights: [400, 500, 600], global: true },
      { name: 'IBM Plex Mono', weights: [400, 500], global: true },
    ],
  },
  alias: {
    '@atlas/contracts': `${packagesRoot}/contracts/src/index.ts`,
    '@atlas/domain': `${packagesRoot}/domain/src/index.ts`,
    '@atlas/history-engine': `${packagesRoot}/history-engine/src/index.ts`,
    '@atlas/data-engine': `${packagesRoot}/data-engine/src/index.ts`,
    '@atlas/virtual-grid': `${packagesRoot}/virtual-grid/src/index.ts`,
    '@atlas/api-client': `${packagesRoot}/api-client/src/index.ts`,
    '@atlas/workers': `${packagesRoot}/workers/src/index.ts`,
    '@atlas/ui': `${packagesRoot}/ui/src/index.ts`,
    '@atlas/ui/styles.css': `${packagesRoot}/ui/src/styles/tokens.css`,
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  app: {
    head: {
      title: 'Atlas — High-Performance Data Workspace',
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  nitro: {
    esbuild: {
      options: {
        target: 'es2022',
      },
    },
  },
  vite: {
    optimizeDeps: {
      include: ['zod'],
    },
    worker: {
      format: 'es',
    },
  },
  spaLoadingTemplate: fileURLToPath(new URL('./app/spa-loading-template.html', import.meta.url)),
  compatibilityDate: '2026-09-05',
  devtools: { enabled: true },
})
