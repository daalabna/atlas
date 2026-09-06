# State management

Pinia is the global state and business-logic layer, not a container for everything.

## Stores

| Store | Owns | Does not own |
| --- | --- | --- |
| `dataset` | dataset meta, `rowsById`, `rowIds`, version | filters, selection, editor |
| `grid` | sort, filters, widths, scroll, worker flag | row documents |
| `selection` | range intervals, active/anchor cell | DOM |
| `editor` | the in-progress cell | persistence |
| `history` | patch stacks | Vue components |
| `views` | active view id + loaded view list | row data; save UI (list-only) |
| `session` | user, dataset id, size, simulated API mode | dataset contents |

## Normalized dataset

```ts
interface DatasetState {
  rowsById: Record<RowId, Row>
  rowIds: RowId[]
}
```

Cell edits clone the changed row and replace the `shallowRef` map. Other row identities stay stable.

## Selection

Selected rows are stored as `RowRange[]` (`{ start, end }`), not as a 50k-long `RowId[]`. Membership is a binary search over merged intervals.

## History

`history-engine` stores patches, not dataset snapshots. The Pinia history store is a thin adapter.
