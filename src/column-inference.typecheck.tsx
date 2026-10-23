import { createRef } from "react";

import { VirtualTable, createTableColumnHelper } from "./react";
import { Table, createTableColumnDefHelper } from "./table";

type Row = { id: string; total: number };

const grid = createTableColumnHelper<Row>();
grid.accessor("total", {
  cell: ({ value }) => {
    const typed: number = value;
    return typed.toFixed(2);
  },
  header: "Total",
  id: "total",
});

const semantic = createTableColumnDefHelper<Row>();
semantic.accessor("total", {
  cell: ({ value }) => {
    const typed: number = value;
    return typed.toFixed(2);
  },
  header: "Total",
  id: "total",
});

type KeyedRow = { id: number; meta: { owner: string }; total: number };
const keyedRows: KeyedRow[] = [];

export const semanticKeys = [
  <Table columns={[]} key="property" rowKey="id" rows={keyedRows} />,
  <Table columns={[]} key="callback" rowKey={(row) => `${row.id}`} rows={keyedRows} />,
  // @ts-expect-error object-valued properties cannot be row keys
  <Table columns={[]} key="object" rowKey="meta" rows={keyedRows} />,
];

export const gridKeys = [
  <VirtualTable columns={[]} key="property" rowKey="id" rows={keyedRows} />,
  <VirtualTable columns={[]} key="callback" rowKey={(row) => row.id} rows={keyedRows} />,
  // @ts-expect-error object-valued properties cannot be row keys
  <VirtualTable columns={[]} key="object" rowKey="meta" rows={keyedRows} />,
];

const tableRef = createRef<HTMLDivElement>();
const gridRef = createRef<HTMLElement>();
export const hostProps = [
  <Table columns={[]} data-testid="semantic" key="semantic" ref={tableRef} rows={keyedRows} />,
  <VirtualTable
    columns={[]}
    data-testid="grid"
    key="grid"
    ref={gridRef}
    rowKey="id"
    rows={keyedRows}
  />,
];
