# ADR-001: Pinia as bounded stores

## Context

Atlas has several kinds of state that change at different frequencies: 100k row documents, grid chrome, selection ranges, in-progress edits, patch history, saved views, and session/debug flags. A single `useAtlasStore()` would make unrelated writes share one reactive graph.

## Decision

Use Pinia, but split stores by bounded responsibility (`dataset`, `grid`, `selection`, `editor`, `history`, `views`, `session`). Pinia is the application layer for global state and use-cases. Component-local UI state stays in components.

## Consequences

- Stores can be composed without one mega-object
- Dataset updates do not automatically dirty selection UI
- More wiring between stores, which is an acceptable cost for isolation
