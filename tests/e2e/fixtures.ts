import { expect, test as base } from '@playwright/test'

export { expect }

export const test = base.extend<{
  expectedRuntimeErrors: RegExp[]
  assertCleanBrowserRuntime: void
}>({
  expectedRuntimeErrors: async ({ browserName: _browserName }, use) => {
    await use([])
  },
  assertCleanBrowserRuntime: [
    async ({ page, expectedRuntimeErrors }, use) => {
      const runtimeErrors: string[] = []

      page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          runtimeErrors.push(`console.${message.type()}: ${message.text()}`)
        }
      })

      await use()

      const unexpectedErrors = runtimeErrors.filter(
        (error) => !expectedRuntimeErrors.some((pattern) => pattern.test(error)),
      )
      expect(unexpectedErrors, 'Browser runtime must not emit unexpected errors or warnings').toEqual(
        [],
      )
    },
    { auto: true },
  ],
})
