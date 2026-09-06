# ADR-005: Web Workers + Zod at the boundary

## Context

Filter/sort over 100k rows competes with input and rendering. HTTP JSON is untrusted.

## Decision

- Move filter, sort and aggregation into workers. Init the worker with a dataset copy; subsequent messages are queries.
- Validate every API payload with Zod at the client and at Nitro where a body is read. Domain types are mapped from DTOs, not inferred as the same object.

## Consequences

- Main thread keeps scrolling while a worker query runs
- Worker memory duplicates the dataset (accepted trade-off vs UI freeze)
- Contract changes fail at parse time, not as a mysterious `undefined` in a cell
