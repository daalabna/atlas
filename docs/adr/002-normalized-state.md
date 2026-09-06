# ADR-002: Normalized rows, not `Row[]`

## Context

Array-of-rows state makes every cell edit a potential copy of a huge list and an O(n) scan for the target.

## Decision

Normalize. `rowIds` is the order; `rowsById` is the document map.

## Consequences

- Patch paths look like `['rowsById', rowId, 'cells', columnId]`
- Filters/sorts return id lists, not cloned row objects
- Join-style selectors are required for rendering
