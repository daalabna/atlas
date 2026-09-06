import { describe, expect, it } from 'vitest'
import { pendingReloadNote } from './optimisticReload'

describe('pendingReloadNote', () => {
  it('describes kept synced changes and dropped unsent inserts', () => {
    expect(pendingReloadNote([{ remoteApplied: 1, bodies: [{ type: 'update-cell' }] }])).toBe(
      ' — already-synced changes were kept',
    )
    expect(
      pendingReloadNote([
        { remoteApplied: 1, bodies: [{ type: 'insert-row' }, { type: 'insert-row' }] },
      ]),
    ).toBe(' — already-synced changes were kept; unsynced local rows were dropped')
  })

  it('describes a full local revert when nothing reached the server', () => {
    expect(pendingReloadNote([{ remoteApplied: 0 }])).toBe(
      ' — local optimistic changes were reverted',
    )
  })
})
