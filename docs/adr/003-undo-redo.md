# ADR-003: Patch-based undo/redo

## Context

Snapshotting `Dataset` per edit would duplicate 100k rows in memory and make undo slow.

## Decision

Store patches and inverse patches in a Vue-free `history-engine`. Undo applies inverse patches to the current state.

## Consequences

- Memory stays proportional to the edit, not the table
- History can be unit-tested without Vue
- Undo after a failed optimistic mutation is the same code path as user undo
