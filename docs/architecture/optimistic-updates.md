# Optimistic updates

User edits must not wait for the network.

```
user action
  → create MutationDraft + patches + inverse patches
  → apply locally
  → enqueue POST /mutations (workspace FIFO; before any await)
       → sync worker cache inside the queue task
       200 → record history (applyMutations + revertMutations), bump version
       any remote failure on execute → cancel later pending, reload snapshot, history.resetStack()
         (if reload itself fails → invert all pending local patches, clear history stack, flash)
```

`useOptimisticMutation` is the state machine. Components call `useDataset().updateCell()` and never `$fetch`.

History is recorded **after** a successful remote commit (not before). While transport is in flight, undo/redo stay blocked via `pendingCount`.

All dataset transport (load / restore / execute / undo) shares one **workspace FIFO** so size/id switches cannot overlap Pinia patches. Pending bookkeeping remains keyed by `(datasetId, size)`.

Server restore (`HistoryPanel`) takes a write lock (refuses while already locked), cancels optimistic transport for the dataset key, then:

1. Applies the restore response via `replaceDataset` + `history.resetStack()` (separate from worker hydrate).
2. If replace fails while the scope is still active: `loadDataset` only when `committed === true`; if the load is superseded or throws, retries the in-memory restore payload (same snap — useful after a race, not after a normalize failure).
3. If replace + heal both fail (`HealOutcome === 'failed'`): invert cancelled pendings, attempt one more load + worker invalidate, else mark `degraded` and flash reload-required. A committed heal is trusted even when `version !== targetVersion` — stranded inverses are not applied onto that snapshot.
4. Worker hydrate (`applySnapshotSideEffects`) is best-effort — failure only invalidates/requests sync; it does not trigger a full heal. The last-resort reload path also invalidates the worker.
5. Navigating away latches the restore scope inactive (it does not become active again if session later reverts), releases the write lock / pending, and closes the restore dialog immediately.

Same-dataset route `load()` is gated on `writesBlocked` / `workspaceLoading` / `pendingCount`. Each proceeding `load()` takes a generation token and a `workspaceLoading` token (toolbar, cell editor, `execute`, undo/redo, and Restore stay blocked until commit/abort). Stale loads skip abort/session/route side effects. Dataset switches cancel the previous queue key and invalidate in-flight loads. Invert + `resetStack` run on the workspace FIFO only if this switch still owns the session and Pinia still holds the previous dataset; invert also invalidates the worker. Invert skips changes that already landed remotely (`remoteApplied > 0`) so a failed switch does not undo a committed POST. A POST still bumps Pinia version when the store holds that snapshot (even if the session already moved). A partial multi-body apply reloads the previous dataset instead of inverting. Restore refreshes server history via the version watch, not a separate event. Failed id switches `navigateTo` the previous dataset only while the URL is still the failed target. A views fetch failure after a committed dataset load is soft — session stays on the new id and the grid resets to All records. Restore is disabled while `workspaceLoading` or `dataset.id !== session.activeDatasetId`.

Toolbar + keyboard undo/redo stay blocked while `transportBusy` (`writesBlocked || pendingCount > 0`). Undo/redo refuse local-only stack entries (no remote mutation bodies).

Failure reload / successful `useDataset.load` use `history.resetStack()` so in-flight pending tokens from another operation are not cleared.

Undo/redo after a successful commit (`useHistory`):

```
undo → write lock → move stack → syncRemote(allowWhileLocked):
         apply inverse patches → POST revertMutations
redo → write lock → move stack → syncRemote(allowWhileLocked):
         apply patches → POST applyMutations
```

`onRemoteFailure` repair callbacks are idempotent. Lock/inactive aborts throw typed `RemoteAbortError` after a single repair so the catch path does not redo the stack twice. If the session left after undo/redo patches were applied, those patches are rolled back when Pinia still holds the same dataset+version; a newer committed snapshot is left untouched.

The Restore confirm dialog is cleared when `activeDatasetId` / `datasetSize` change (unless a restore is already running).

Write lock (`session.writesBlocked`) blocks **new** `execute` / `syncRemote` / cell editing / toolbar mutations. In-flight `execute` tasks already on the FIFO are not aborted solely because the lock is held — restore cancels them via `cancelOptimisticTransport` after a successful restore response.

Structural local edits (rowIds / row insert-delete) only **invalidate** the worker generation. Cell patches call `patch-rows` only when `workerHydrated`; otherwise they only `requestSync` (no generation bump) so in-flight hydrate is not aborted. Hydrate aborts when live `rowIds` identity or length diverges from the start snapshot.

Version is an integer on the dataset. The client sends `expectedVersion`. The Nitro handler rejects mismatches with `VERSION_CONFLICT`.

Fault injection (`simulate=conflict|error|slow`) is **dev-only**:
- toolbar control renders only when `import.meta.dev`
- client sends the query param only in development
- server ignores simulate when `NODE_ENV=production` (misconfigured prod with a non-production `NODE_ENV` would still honor it)

`discardLast` remains in `@atlas/history-engine` as a library helper for “drop last past entry without redo”, but the web app’s execute failure path uses snapshot reload instead.
