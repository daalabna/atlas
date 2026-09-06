# Atlas — High-Performance Data Workspace

Vue 3, Nuxt, TypeScript, Pinia, Zod, Web Workers, Vitest, Playwright

Atlas is a data workspace for large structured datasets — a mix of Airtable, a high-performance data grid, and Figma-style views. The point is not a long technology list. The point is to show how a complex Vue frontend is designed: where state lives, where domain logic lives, where rendering becomes a bottleneck, and where the API boundary starts.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and then the workspace. Default load is **10,000 rows**. The size selector goes to **100,000**.

```bash
pnpm test
pnpm exec playwright install
pnpm test:e2e
pnpm storybook
pnpm bench
```

## What the demo covers

- 100,000 records loaded into normalized Pinia state
- Virtualized DataGrid (~30–80 DOM rows)
- Filtering, sorting, range selection, inline editing
- Optimistic mutations with rollback
- 409 version-conflict handling
- Patch-based undo/redo synced with compensating server mutations
- Server version history + restore (including insert/delete)
- Web Workers for filter/sort with cache sync after edits
- Performance panel (FPS, render, worker, memory)
- Zod contracts at the HTTP boundary

## Architecture

```
UI (Vue components / pages)
        ↓
Composables (useGrid, useSelection, useEditor, useHistory, useDataset, usePerformance)
        ↓
Application (Pinia stores, commands, use-cases)
        ↓
Domain (Dataset, Row, Cell, Mutation, Version, History, Selection, View)
        ↓
Infrastructure (Nitro API, Zod, Workers, persistence)
```

UI does not call the API. Undo/redo does not know about Vue. A DTO is not automatically a domain model.

See `docs/architecture/` and `docs/adr/` for the decisions.

## Architectural trade-offs

### Why Pinia instead of one global store?

One `useAtlasStore()` with rows, filters, selection, history, editor, user and performance would make almost every write a candidate for a large reactive invalidation. Pinia stores here follow bounded responsibility: `dataset` owns domain data, `grid` owns table chrome, `selection` owns ranges, `history` owns patches. Stores compose; they do not share one blob of state.

### Why normalized state?

A dataset of 100k+ rows cannot be treated as `Row[]` if cells change often. Rows live in `rowsById` with a separate `rowIds` order. Lookup is O(1), patches target a single path, and Vue does not need to clone the entire table to change one cell.

### Why patches instead of snapshots?

A snapshot of 100k rows per undo step is memory-hostile. History stores `{ path, oldValue, newValue }` plus inverse patches. Undo applies inverse patches; redo applies patches. The engine in `packages/history-engine` has no Vue dependency.

### Why virtualization?

`v-for` over 100k rows will create 100k DOM nodes. The virtualizer maps scroll position to a window of ~25 visible rows plus overscan. The dataset stays in memory; the DOM stays small.

### Why Web Workers?

Filter/sort over 100k rows on the main thread contends with rendering and input. Workers receive an `init` copy of the dataset once, then only the query. The UI thread renders the resulting id list.

### Why Zod?

Zod sits on the API boundary, not on every form. Incoming JSON is untrusted. Schemas produce TypeScript types and fail closed on malformed payloads, including `VERSION_CONFLICT`.

### Why not store everything reactively?

Deep reactivity over 100k nested objects is a hidden tax. `rowsById` is a `shallowRef`. Updates replace the map and the changed row, not every cell proxy.

### Why not optimize before measuring?

The performance panel exists so changes are hypothesized, measured, then kept or thrown away. There is no promised FPS number in this README. Run `pnpm bench` and the in-app panel for actual numbers on your machine.

## Monorepo

```
apps/web            Nuxt app: UI, stores, composables, Nitro mock API
packages/contracts  Zod schemas / DTOs
packages/domain     Dataset, selection, view, mutation models
packages/history-engine  Patch / command / undo-redo (Vue-free)
packages/data-engine     Filter / sort / aggregate
packages/virtual-grid    Row window math
packages/api-client      HTTP + Zod parse
packages/workers         Filter/sort/aggregate worker jobs
packages/ui              Reusable Vue primitives + Storybook
```

## API

Nitro keeps an in-memory dataset and can simulate failure modes:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/datasets/:id?size=` | Snapshot |
| `POST /api/datasets/:id/mutations?simulate=conflict\|error\|slow` | Mutate |
| `GET /api/datasets/:id/history` | Version log |
| `POST /api/datasets/:id/restore` | Restore version |
| `GET /api/datasets/:id/views` | Saved views |

## Tests

- **Unit:** history engine, patches, filter/sort, selection ranges, virtualizer, Zod contracts
- **Integration:** optimistic apply → 409 → inverse patch rollback
- **E2E:** load grid, edit cell, undo, filter, virtualized row count

## CV bullets this repo is built to support

- Designed and built a Vue 3/Nuxt data workspace for 100k+ records with normalized state, virtualized rendering, range selection and inline editing.
- Implemented a patch-based undo/redo engine, optimistic mutations, rollback and version-conflict resolution.
- Moved expensive filtering, sorting and aggregation to Web Workers and built a performance profiling layer to measure rendering and data-processing costs.
- Designed typed API contracts with Zod and separated UI, application, domain and infrastructure layers.
