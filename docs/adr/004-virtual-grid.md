# ADR-004: Virtualized rendering

## Context

A normal `v-for` over 100k rows will freeze layout and paint.

## Decision

Virtualize rows with a small dedicated package. Render only the visible window plus overscan.

## Consequences

- DOM stays in the tens of nodes
- `scrollTop` becomes part of grid UI state
- Anything that needs "all rows" must go through ids + workers, never through the DOM
