# @moritzbrantner/tables

React table components and headless utilities for large tabular data sets,
backed by `@moritzbrantner/viz-engine` for table querying.

`tables` sits alongside `charts`, `maps`, and `diagrams`: it focuses on one
data shape, exposes small typed primitives, and keeps the heavy part of the UI
virtualized.

## Install

```sh
bun add @moritzbrantner/tables @moritzbrantner/viz-engine
```

```tsx
import { useState } from "react";
import {
  VirtualTable,
  type TableColumn,
  type TableState,
} from "@moritzbrantner/tables";
import "@moritzbrantner/tables/styles.css";

type Order = {
  customer: string;
  id: string;
  region: string;
  total: number;
};

const columns: TableColumn<Order>[] = [
  { accessor: "id", header: "Order", id: "id", sortable: true, sticky: "left", width: 120 },
  { accessor: "customer", header: "Customer", id: "customer", sortable: true, width: 220 },
  { accessor: "region", header: "Region", id: "region", width: 160 },
  {
    accessor: "total",
    align: "end",
    cell: (value) => `$${Number(value).toLocaleString()}`,
    header: "Total",
    id: "total",
    sortable: true,
    width: 140,
  },
];

export function OrdersTable({ rows }: { rows: Order[] }) {
  const [state, setState] = useState<Partial<TableState<Order>>>({
    filter: { query: "" },
    selection: { selectedRowKeys: [] },
    sort: [],
  });

  return (
    <VirtualTable
      ariaLabel="Orders"
      columnMenu
      columnResizing
      columns={columns}
      height={560}
      onStateChange={({ state }) => setState(state)}
      rowKey="id"
      rows={rows}
      selectionMode="single"
      state={state}
    />
  );
}
```

## What It Provides

- `VirtualTable`: fixed-height row virtualization with optional variable-width column virtualization.
- `DataTable`: a smaller convenience wrapper with compact and comfortable density presets.
- `createTableModel`: headless filtering and multi-column sorting through `@moritzbrantner/viz-engine`.
- `getFixedVirtualRange` and `getVariableVirtualRange`: standalone virtualization primitives.
- Row selection, column resizing, sticky columns, and accessible column menus.
- CSS variables and class names for host-app styling without a design-system dependency.

## State API

Table state is controlled through `state`, seeded through `initialState`, and
reported through `onStateChange`.

```tsx
const [state, setState] = useState<Partial<TableState<Order>>>({
  filter: { query: "berlin" },
  sort: [{ columnId: "total", direction: "desc" }],
});

<VirtualTable
  columns={columns}
  onStateChange={({ state }) => setState(state)}
  rowKey="id"
  rows={rows}
  state={state}
/>;
```

Each state field is controlled independently. If `state.sort` is supplied, sort
is controlled. If `state.columnSizing` is omitted, column sizing remains
uncontrolled.

## Manual Mode

Use `mode="manual"` when rows are already filtered, sorted, or paged by a
server. Header and menu interactions still emit state changes, but the table
does not locally reorder or filter `rows`.

```tsx
<VirtualTable
  columns={columns}
  filteredRowCount={serverFilteredCount}
  mode="manual"
  onStateChange={({ state }) => loadRows(state)}
  rowKey="id"
  rows={pageRows}
  state={state}
  totalRowCount={serverTotalCount}
/>;
```

## Selection, Resizing, and Sticky Columns

```tsx
const columns: TableColumn<Order>[] = [
  { accessor: "id", header: "Order", id: "id", sticky: "left", width: 120 },
  { accessor: "total", header: "Total", id: "total", sticky: "right", width: 140 },
];

<VirtualTable
  columnResizing
  columns={columns}
  rowKey="id"
  rows={rows}
  selectionMode="multiple"
/>;
```

Selection lives in `state.selection.selectedRowKeys`. Column widths live in
`state.columnSizing`. Resizing clamps to `column.minWidth ?? 72` and
`column.maxWidth ?? 640`.

## Column Menus

Pass `columnMenu` to enable header actions for built-in sorting and typed
filtering. By default, menus open from a visible header button, right-click, or
Shift+F10.

```tsx
<VirtualTable
  columnMenu={{ filter: true, sort: true, trigger: "both" }}
  columns={columns}
  rowKey="id"
  rows={rows}
/>;
```

Columns infer their filter type from row values. Use `column.type` to force one
of `string`, `number`, `date`, `boolean`, `json`, or `unknown`, and set
`column.filterable = false` to hide filter controls for a column.

## Big Data Defaults

- Rows are windowed by scroll position, so rendering cost is tied to viewport size rather than row count.
- Columns can be windowed too, which keeps wide operational tables responsive.
- Sorting and filtering are headless and explicit. For server-side data, pass already processed rows and use `mode="manual"`.
- The public API uses typed column definitions instead of stringly configured table state.

## Migration Notes

- `filter` prop moved to `state.filter`.
- `sort` prop moved to `state.sort`.
- `defaultFilter` and `defaultSort` were replaced by `initialState`.
- `onFilterChange` and `onSortChange` were replaced by `onStateChange`.
- `TableFilter.filters` was renamed to `columnFilters`.
- `TableFilter.columns` was renamed to `queryColumnIds`.
- `TableSortState` is now an array of sort rules.

## Scripts

```sh
bun install
bun run dev
bun run test
bun run build
bun run verify
```

The example app includes multiple table scenarios, generates large deterministic
datasets locally, and runs through the package aliases used during development.
Use `bun run dev` for the playground, or `bun run build:examples:pages` to create
a GitHub Pages-ready build under `dist-examples`.

## GitHub Pages

The example playground is deployed from `main` to
[moritzbrantner.github.io/tables](https://moritzbrantner.github.io/tables/).
The deployment workflow runs the same type-check, tests, and Pages-specific
build used locally:

```sh
bun run check:pages
```

In the repository's **Settings → Pages**, select **GitHub Actions** as the
deployment source. Pushes to `main` then publish the current example site.

## Release Checklist

```sh
bun install
bun run test
bun run build
bun run verify
bunx publint --pack bun --strict
bun run build:examples
```
