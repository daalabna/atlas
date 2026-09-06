import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { View } from '@atlas/domain'

const { listViews } = vi.hoisted(() => ({ listViews: vi.fn() }))

vi.mock('~/utils/atlasApi', () => ({
  atlasApi: { views: { list: listViews } },
}))

import { useViewsStore } from './views'

const view = (id: string): View => ({
  id,
  name: id,
  filters: [],
  sorting: [],
  visibleColumns: [],
  columnWidths: {},
})

describe('view loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listViews.mockReset()
  })

  it('does not let an older response replace newer views', async () => {
    let resolveOld!: (value: View[]) => void
    listViews
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValueOnce([view('new')])

    const store = useViewsStore()
    const oldLoad = store.loadViews('customers', 1_000)
    await expect(store.loadViews('customers', 100_000)).resolves.toBe(true)
    resolveOld([view('old')])

    await expect(oldLoad).resolves.toBe(false)
    expect(store.views.map((item) => item.id)).toEqual(['new'])
  })

  it('ignores an error from an obsolete request', async () => {
    let rejectOld!: (reason: Error) => void
    listViews
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOld = reject
          }),
      )
      .mockResolvedValueOnce([view('current')])

    const store = useViewsStore()
    const oldLoad = store.loadViews('customers', 1_000)
    await store.loadViews('customers', 100_000)
    rejectOld(new Error('obsolete failure'))

    await expect(oldLoad).resolves.toBe(false)
    expect(store.views.map((item) => item.id)).toEqual(['current'])
  })

  it('reset drops views and ignores an in-flight list', async () => {
    let resolveLate!: (value: View[]) => void
    listViews.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLate = resolve
        }),
    )
    const store = useViewsStore()
    const pending = store.loadViews('customers', 1_000)
    store.reset()
    resolveLate([view('stale')])
    await expect(pending).resolves.toBe(false)
    expect(store.views).toEqual([])
    expect(store.activeViewId).toBe('all')
  })
})
