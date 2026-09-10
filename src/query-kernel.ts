import type { TableDataColumn, TableFilter, TableSortState } from "./data";

export type TableQueryResult = {
  filteredRowCount: number;
  sourceIndices: readonly number[];
};

export type TableQueryKernel = {
  queryTable<TRow>(
    rows: readonly TRow[],
    columns: readonly TableDataColumn<TRow>[],
    filter?: TableFilter<TRow> | null,
    sort?: TableSortState,
  ): TableQueryResult;
};

let activeTableQueryKernel: TableQueryKernel | null = null;

export function getTableQueryKernel(): TableQueryKernel | null {
  return activeTableQueryKernel;
}

export function setTableQueryKernel(kernel: TableQueryKernel | null): void {
  activeTableQueryKernel = kernel;
}
