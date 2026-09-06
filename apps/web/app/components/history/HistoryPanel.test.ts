import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { snapshot } from '../../../test-utils/optimisticMutation.harness'
import { useDatasetStore } from '~/stores/dataset'
import { useHistoryStore } from '~/stores/history'
import { useSessionStore } from '~/stores/session'
import { enqueueForDataset, resetDatasetQueues } from '~/utils/remoteMutations'

const { applyRestoreOnQueue } = vi.hoisted(() => ({
  applyRestoreOnQueue: vi.fn().mockResolvedValue(true),
}))

vi.mock('~/utils/confirmRestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/confirmRestore')>()
  return { ...actual, applyRestoreOnQueue }
})

import HistoryPanel from './HistoryPanel.vue'

const serverEntries = [
  { version: 3, summary: 'Rename Ada', timestamp: new Date(0).toISOString() },
]

const seedWorkspace = () => {
  const dataset = useDatasetStore()
  const initial = snapshot('Ada', 3)
  const row = initial.rows[0]
  if (!row) throw new Error('fixture missing row')
  dataset.replaceDataset(initial.dataset, { r1: row })
  const session = useSessionStore()
  session.activeDatasetId = 'customers'
  session.datasetSize = 10_000
  session.notice = null
}

let pinia: ReturnType<typeof createPinia>

const mountPanel = () =>
  mount(HistoryPanel, {
    attachTo: document.body,
    props: { entries: [], serverEntries },
    global: { plugins: [pinia] },
  })

const confirmButton = () =>
  document.querySelector<HTMLButtonElement>('[data-testid="confirm-restore"]')

const dialog = () => document.querySelector('[role="dialog"]')

const cancelButton = () =>
  [...(dialog()?.querySelectorAll('button') ?? [])].find((el) => el.textContent === 'Cancel')

const clickRestore = async (wrapper: VueWrapper) => {
  await wrapper.get('[data-testid="restore-version"]').trigger('click')
}

describe('HistoryPanel restore dialog', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    resetDatasetQueues()
    applyRestoreOnQueue.mockReset()
    applyRestoreOnQueue.mockResolvedValue(true)
    seedWorkspace()
    document.body.innerHTML = ''
  })

  it('opens the dialog on Restore and closes it on Cancel', async () => {
    const wrapper = mountPanel()
    expect(dialog()).toBeNull()

    await clickRestore(wrapper)
    expect(dialog()?.textContent).toMatch(/Undo\s+v3/)
    expect(confirmButton()).not.toBeNull()

    cancelButton()?.click()
    await wrapper.vm.$nextTick()
    expect(dialog()).toBeNull()
    wrapper.unmount()
  })

  it('disables Restore and ignores ask while transportBusy', async () => {
    useHistoryStore().beginPending()
    const wrapper = mountPanel()
    const button = wrapper.get('[data-testid="restore-version"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    await button.trigger('click')
    expect(dialog()).toBeNull()
    wrapper.unmount()
  })

  it('disables confirm after the dialog opens if a write starts', async () => {
    const wrapper = mountPanel()
    await clickRestore(wrapper)
    expect(confirmButton()?.disabled).toBe(false)

    useHistoryStore().beginPending()
    await wrapper.vm.$nextTick()
    expect(confirmButton()?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('waits on the workspace FIFO before applyRestoreOnQueue', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    void enqueueForDataset('hold', () => gate)

    const wrapper = mountPanel()
    await clickRestore(wrapper)
    confirmButton()?.click()
    await wrapper.vm.$nextTick()

    expect(confirmButton()?.textContent).toMatch(/Restoring/)
    expect(confirmButton()?.disabled).toBe(true)
    expect(cancelButton()?.disabled).toBe(true)
    expect(applyRestoreOnQueue).not.toHaveBeenCalled()

    release()
    await flushPromises()
    expect(applyRestoreOnQueue).toHaveBeenCalledOnce()
    expect(applyRestoreOnQueue.mock.calls[0]![0]).toMatchObject({
      targetVersion: 2,
      datasetId: 'customers',
      size: 10_000,
    })
    expect(dialog()).toBeNull()
    wrapper.unmount()
  })

  it('closes the dialog after applyRestoreOnQueue throws so notice is the only modal', async () => {
    applyRestoreOnQueue.mockRejectedValueOnce(new Error('reload required'))
    const wrapper = mountPanel()
    await clickRestore(wrapper)
    confirmButton()?.click()
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(useSessionStore().notice).toMatch(/reload required/)
    wrapper.unmount()
  })
})
