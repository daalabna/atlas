# Architecture overview

Atlas is split by responsibility, not by file type.

## Layers

1. **UI** — Vue components, pages, layouts. They render and dispatch intent. They do not own HTTP, patches, or filter algorithms.
2. **Composables** — `useDataset`, `useGrid`, `useSelection`, `useCellEditor`, `useHistory`, `useOptimisticMutation`, `useDataWorker`, `useSnapshotSync`, `useKeyboardShortcuts`, `usePerformance`. These are the application-facing API of the UI. A composable may use stores; it is not a dumping ground for domain code.
3. **Application** — Pinia stores and use-cases. Global state lives here. Local hover/focus state stays in components.
4. **Domain** — Dataset, Row, Cell, Mutation, Version, History metadata, Selection ranges, Views. Pure TypeScript (view types alias Zod DTOs from `@atlas/contracts`).
5. **Infrastructure** — Nitro handlers, Zod, workers, fetch client (`requestValidated`).

## Data flow

```
HTTP → Zod → DTO → domain aliases → Pinia → Vue
Vue → command → domain mutation → DTO → Zod → API
```

## Threat model (demo workspace)

- Auth is intentionally out of scope: the Nitro store is an in-memory local demo.
- Fault-injection (`?simulate=`) is honored only outside production builds and only shown in the toolbar when `import.meta.dev` is true. A production binary with a mis-set `NODE_ENV` would still honor simulate — keep `NODE_ENV=production` in real deploys.
- Zod validates mutation / restore / view payloads and dataset query params (`size` must be an allowed size, unknown `simulate` is ignored) at the HTTP boundary.

## Why this split

- Undo/redo can be tested without mounting Vue.
- The grid can be replaced without rewriting mutation contracts.
- A backend swap does not leak into components.
- Interview conversations can walk the diagram instead of a list of libraries.
