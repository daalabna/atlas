# Rendering

The grid never renders the dataset. It renders a window.

```
100,000 rows
    → virtualize(scrollTop, rowHeight, viewportHeight, overscan)
    → ~25 visible + overscan
    → ~40 DOM rows
```

`packages/virtual-grid` is UI-agnostic: it returns `{ startIndex, endIndex, offsetTop, totalHeight }`. Vue only mounts that slice.

## Vue-specific choices

- `rowsById` is a `shallowRef` so 100k objects are not deeply proxied.
- Row components receive stable `rowId` keys.
- `v-memo` is available as a next step; it is not applied until the performance panel shows a real cost.
- Measure in the panel / Chrome Performance, change one thing, measure again.

## Horizontal layout

Columns use CSS grid with explicit pixel tracks. Resizing writes into `gridStore.columnWidths` and rebuilds the template string. Frozen-column count is stored; a full freeze overlay is a follow-up, not a fake CSS trick.
