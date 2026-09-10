import type { ReactNode } from "react";

import type { TableDataColumn } from "./data";

export type TableColumn<TRow, TValue = unknown> = TableDataColumn<TRow, TValue> & {
  cell?: (value: TValue, row: TRow, rowIndex: number) => ReactNode;
  header: ReactNode;
};

export function createTableColumnHelper<TRow>() {
  function accessor<TKey extends keyof TRow>(
    accessorKey: TKey,
    column: Omit<TableColumn<TRow, TRow[TKey]>, "accessor">,
  ): TableColumn<TRow, TRow[TKey]> {
    return { ...column, accessor: accessorKey };
  }

  function accessorFn<TValue>(
    accessorFunction: (row: TRow, rowIndex: number) => TValue,
    column: Omit<TableColumn<TRow, TValue>, "accessor">,
  ): TableColumn<TRow, TValue> {
    return { ...column, accessor: accessorFunction };
  }

  return { accessor, accessorFn };
}

export function getColumnLabel<TRow>(column: TableColumn<TRow>) {
  if (typeof column.header === "string" || typeof column.header === "number") {
    return String(column.header);
  }

  return column.ariaLabel ?? column.id;
}
