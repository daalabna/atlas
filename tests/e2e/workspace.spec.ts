import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'

const runId = Date.now().toString(36)
const datasetPath = (scenario: string) => `/datasets/e2e-${runId}-${scenario}`

const visibleCount = async (status: Locator) => {
  const text = await status.innerText()
  const match = text.match(/([\d,]+)\s+visible/)
  return match ? Number(match[1]!.replace(/,/g, '')) : 0
}

test('loads the workspace and keeps the grid virtualized', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByTestId('open-workspace').click()
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('performance-panel')).toBeVisible()

  const renderedRows = await page.locator('.grid-row').count()
  expect(renderedRows).toBeGreaterThan(5)
  expect(renderedRows).toBeLessThan(80)
})

test('failed size switch restores the committed dataset scope', async ({
  page,
  expectedRuntimeErrors,
}) => {
  test.setTimeout(120_000)
  expectedRuntimeErrors.push(/console\.error: Failed to load resource: net::ERR_FAILED/)
  await page.goto(datasetPath('size-failure'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.toolbar-size')).toHaveValue('10000')

  await page.route(`**/api/datasets/e2e-${runId}-size-failure?size=1000`, (route) => route.abort())
  await page.locator('.toolbar-size').selectOption('1000')

  await expect(page.locator('.toolbar-size')).toHaveValue('10000')
  await expect(page.locator('.toolbar')).toContainText('10,000 records')
  await expect(page.getByTestId('grid-viewport')).toBeVisible()
})

test('edits a cell, then undo restores the previous value', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(datasetPath('cell-undo'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })

  const cell = page.locator('.grid-row').nth(1).locator('.grid-cell').nth(1)
  const before = await cell.innerText()
  await cell.dblclick()
  const editor = page.getByTestId('cell-editor')
  await editor.fill('Atlas User')
  await editor.press('Enter')
  await expect(cell).toContainText('Atlas User')
  await page.getByTestId('undo').click()
  await expect(cell).toContainText(before)
})

test('filter narrows visible rows', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(datasetPath('filter'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('add-filter').click()
  await page.getByTestId('filter-value').fill('zzz-no-match')
  await expect(page.locator('.status-bar')).toContainText('0 visible rows', {
    timeout: 15_000,
  })
})

test('switching views applies pinned filters', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(datasetPath('views'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })

  await page.getByRole('button', { name: 'Active users' }).click()
  await expect(page.locator('.filter-row.is-pinned')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.getByLabel('View filter (locked)')).toBeVisible()
})

test('server restore rolls back a cell edit', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(datasetPath('restore'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })

  const cell = page.locator('.grid-row').nth(2).locator('.grid-cell').nth(1)
  const before = await cell.innerText()
  await cell.dblclick()
  const editor = page.getByTestId('cell-editor')
  await editor.fill('Restore Probe')
  await editor.press('Enter')
  await expect(cell).toContainText('Restore Probe')

  const restoreButton = page.getByTestId('restore-version').first()
  await expect(restoreButton).toBeEnabled({ timeout: 15_000 })
  await restoreButton.click()
  await page.getByTestId('confirm-restore').click()
  await expect(cell).toContainText(before, { timeout: 30_000 })
})

test('restore write-lock blocks edit/insert/delete/reload until restore finishes', async ({
  page,
}) => {
  test.setTimeout(120_000)

  let releaseRestore!: () => void
  const restoreGate = new Promise<void>((resolve) => {
    releaseRestore = resolve
  })
  await page.route('**/api/datasets/*/restore**', async (route) => {
    await restoreGate
    await route.continue()
  })

  await page.goto(datasetPath('restore-lock'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })

  const cell = page.locator('.grid-row').nth(2).locator('.grid-cell').nth(1)
  const before = await cell.innerText()
  await cell.dblclick()
  await page.getByTestId('cell-editor').fill('Restore Lock Probe')
  await page.getByTestId('cell-editor').press('Enter')
  await expect(cell).toContainText('Restore Lock Probe')

  await page.getByRole('checkbox', { name: 'Select row 1', exact: true }).click()
  await expect(page.getByTestId('delete-rows')).toBeEnabled()
  await expect(page.getByTestId('insert-row')).toBeEnabled()
  await expect(page.getByTestId('reload')).toBeEnabled()

  const restoreButton = page.getByTestId('restore-version').first()
  await expect(restoreButton).toBeEnabled({ timeout: 15_000 })
  await restoreButton.click()
  await page.getByTestId('confirm-restore').click()

  await expect(page.getByTestId('insert-row')).toBeDisabled()
  await expect(page.getByTestId('delete-rows')).toBeDisabled()
  await expect(page.getByTestId('reload')).toBeDisabled()

  // Dialog stays open while restore is in flight; force past the overlay to
  // assert the write-lock (not just the modal) blocks the cell editor.
  await cell.dblclick({ force: true })
  await expect(page.getByTestId('cell-editor')).toHaveCount(0)

  releaseRestore()
  await expect(cell).toContainText(before, { timeout: 30_000 })
  await expect(page.getByTestId('insert-row')).toBeEnabled()
  await expect(page.getByTestId('reload')).toBeEnabled()
  // Selection is cleared by snapshot restore; re-select to prove delete unlocks.
  await page.getByRole('checkbox', { name: 'Select row 1', exact: true }).click()
  await expect(page.getByTestId('delete-rows')).toBeEnabled()
})

test('insert then undo removes the row from the grid', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(datasetPath('insert-undo'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })

  const status = page.locator('.status-bar')
  const beforeCount = await visibleCount(status)

  await page.getByTestId('insert-row').click()
  await expect.poll(async () => visibleCount(status), { timeout: 15_000 }).toBe(beforeCount + 1)

  await page.getByTestId('undo').click()
  await expect.poll(async () => visibleCount(status), { timeout: 15_000 }).toBe(beforeCount)
})

test('deletes a selected row and undo restores it', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(datasetPath('delete-undo'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })

  const status = page.locator('.status-bar')
  const beforeCount = await visibleCount(status)
  await page.getByRole('checkbox', { name: 'Select row 1', exact: true }).click()
  await page.getByTestId('delete-rows').click()
  await expect.poll(async () => visibleCount(status), { timeout: 15_000 }).toBe(beforeCount - 1)

  await page.getByTestId('undo').click()
  await expect.poll(async () => visibleCount(status), { timeout: 15_000 }).toBe(beforeCount)
})

test('web worker toggle stays interactive', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(datasetPath('worker'))
  await expect(page.getByTestId('grid-viewport')).toBeVisible({ timeout: 60_000 })

  const worker = page.getByLabel('Web Worker')
  await expect(worker).toBeVisible()
  await worker.click()
  await page.getByTestId('add-filter').click()
  await page.getByTestId('filter-value').fill('zzz-no-match')
  await expect(page.locator('.status-bar')).toContainText('0 visible rows', {
    timeout: 15_000,
  })
})
