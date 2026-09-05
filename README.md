# @moritzbrantner/tables

React table primitives for ordinary semantic tables and large interactive data grids, backed by table-owned Rust kernels for built-in querying and virtualization.

`tables` is self-contained: applications install this package plus React. There is no separate visualization/query engine underneath it.

## Choose the smallest table that fits

| Need | Use |
| --- | --- |
| Results, reports, comparisons, small and medium tables | `Table` |
| Large row sets, wide data, selection, resizing, menus | `VirtualTable` |
| Virtualized table with density presets | `DataTable` |
| Filtering/sorting without a renderer | `createTableModel` |

`Table` renders a native HTML `<table>`. `VirtualTable` adds row/column virtualization and interactive grid behavior when that complexity is justified.

## Install

```sh
bun add @moritzbrantner/tables
```

React and React DOM remain peer dependencies.

## Ownership

The package has one table-specific computation core:

- `tables-core` (Rust) owns built-in structured filters, global search, stable multi-sort, source-index selection, and virtualization geometry.
- `tables-wasm` is a thin browser adapter over `tables-core`; it has no frame, layer, renderer, or generic dataset model.
- TypeScript/React owns public component APIs, DOM semantics, accessibility, controlled state, event handling, and JavaScript callbacks such as custom predicates and accessors.
- The React table entry points load the local Wasm kernel automatically and remount onto the Rust query path once it is ready. SSR/boot and unsupported environments retain the equivalent TypeScript compatibility path.

The synchronous headless APIs remain usable before Wasm initialization. Consumers that want to initialize Rust explicitly can call `loadTableWasmKernel()` from `@moritzbrantner/tables/wasm`.

## Semantic table

```tsx
import { Table, type TableColumnDef } from "@moritzbrantner/tables/table";
import "@moritzbrantner/tables/table.css";

type Measurement = {
  algorithm: string;
  objects: number;
  tests: number;
};

const columns: TableColumnDef<Measurement>[] = [
  { accessor: "objects", align: "end", header: "Objects", id: "objects", width: 120 },
  { accessor: "algorithm", header: "Algorithm", id: "algorithm", minWidth: 180 },
  { accessor: "tests", align: "end", header: "AABB tests", id: "tests", width: 160 },
];

export function ResultsTable({ rows }: { rows: Measurement[] }) {
  return <Table columns={columns} rowKey={(row) => `${row.objects}-${row.algorithm}`} rows={rows} />;
}
```

## Virtual table

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
  { accessor: "total", align: "end", header: "Total", id: "total", sortable: true, width: 140 },
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

## Query semantics

Built-in filters support `between`, `contains`, `endsWith`, `equals`, `gt`, `gte`, `in`, `isNotNull`, `isNull`, `lt`, `lte`, `notEquals`, and `startsWith` across typed table columns. Global search is deterministic and case-insensitive by default. Multi-sort is stable and falls back to source row order for ties.

Custom `predicate` and `sortAccessor` functions stay JavaScript callbacks. Their outputs are converted to typed columnar values before Rust evaluates the built-in query/sort rules; arbitrary JavaScript functions are never serialized into Wasm.

## Manual mode

Use `mode="manual"` when rows are already filtered, sorted, or paged by a server. State changes are still emitted, but local query processing is skipped.

## Performance boundary

The earlier virtualization measurements remain important: cached TypeScript is faster than a JS→Wasm crossing for tiny per-scroll geometry queries, so `VirtualTable` keeps cached viewport geometry in TypeScript. Rust is used directly for the coarser table-query operation where filtering/search/sorting can be batched across a columnar dataset.

That means the repository does not use Rust merely because Rust exists; each boundary stays where its measured workload belongs.

## Scripts

```sh
bun install
bun run dev
bun run test
bun run build
bun run verify
```

The example app builds for GitHub Pages with `bun run build:examples:pages`.
