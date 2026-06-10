import {
  createVizEngine,
  type VizTableCellValue,
  type VizTableColumnarDataset,
  type VizTableColumnDefinition,
  type VizTableColumnType,
  type VizTableFilter,
  type VizTableFilterOperator,
  type VizTableQuery,
} from "@moritzbrantner/viz-engine/core";
import type { ReactNode } from "react";

export type TableColumnAlign = "center" | "end" | "start";

export type TableColumnType = VizTableColumnType;

export type TableFilterOperator = VizTableFilterOperator;

export type TableRowKey = string | number;

export type TableColumnSticky = "left" | "right";

export type TableColumnFilter = {
  caseSensitive?: boolean;
  columnId: string;
  operator: TableFilterOperator;
  value?: string | number | boolean | Date | null | readonly unknown[];
};

export type TableColumn<TRow, TValue = unknown> = {
  align?: TableColumnAlign;
  ariaLabel?: string;
  accessor: keyof TRow | ((row: TRow, rowIndex: number) => TValue);
  cell?: (value: TValue, row: TRow, rowIndex: number) => ReactNode;
  className?: string;
  filterable?: boolean;
  header: ReactNode;
  id: string;
  maxWidth?: number;
  minWidth?: number;
  resizable?: boolean;
  sortAccessor?: (row: TRow, rowIndex: number) => string | number | boolean | Date | null;
  sortable?: boolean;
  sticky?: TableColumnSticky;
  type?: TableColumnType;
  width?: number;
};

export type TableSortDirection = "asc" | "desc";

export type TableSortRule = {
  columnId: string;
  direction: TableSortDirection;
};

export type TableSortState = readonly TableSortRule[];

export type TableFilter<TRow> = {
  columnFilters?: readonly TableColumnFilter[];
  predicate?: (row: TRow, rowIndex: number, query: string) => boolean;
  query?: string;
  queryColumnIds?: readonly string[];
};

export type TableSelectionState = {
  selectedRowKeys: readonly TableRowKey[];
};

export type TableColumnSizingState = Record<string, number>;

export type TableState<TRow> = {
  columnSizing: TableColumnSizingState;
  filter: TableFilter<TRow> | null;
  selection: TableSelectionState;
  sort: TableSortState;
};

export type TableStateChangeType =
  | "columnSizing"
  | "filter"
  | "selection"
  | "sort";

export type TableStateChange<TRow> = {
  state: TableState<TRow>;
  type: TableStateChangeType;
};

export type TableModelOptions<TRow> = {
  columns: readonly TableColumn<TRow>[];
  filter?: TableFilter<TRow> | null;
  rows: readonly TRow[];
  sort?: TableSortState;
};

export type TableModel<TRow> = {
  columns: readonly TableColumn<TRow>[];
  filteredRowCount: number;
  rows: readonly TRow[];
  sortedRowCount: number;
  totalRowCount: number;
};

export function createTableModel<TRow>({
  columns,
  filter,
  rows,
  sort,
}: TableModelOptions<TRow>): TableModel<TRow> {
  const filteredRows = filter && hasTableFilter(filter)
    ? applyTableFilter(rows, columns, filter)
    : Array.from(rows);
  const sortedRows = sort && sort.length > 0
    ? applyTableSort(filteredRows, columns, sort)
    : filteredRows;

  return {
    columns,
    filteredRowCount: filteredRows.length,
    rows: sortedRows,
    sortedRowCount: sortedRows.length,
    totalRowCount: rows.length,
  };
}

export function applyTableFilter<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
  filter: TableFilter<TRow>,
): TRow[] {
  const query = filter.query?.trim() ?? "";
  const structuredFilters = createVizTableFilters(filter.columnFilters);

  if (!query && structuredFilters.length === 0) {
    return Array.from(rows);
  }

  if (!query) {
    const sourceIndices = getVizTableSourceIndices(rows, columns, {
      filters: structuredFilters,
    });

    return sourceIndices
      .map((sourceIndex) => rows[sourceIndex])
      .filter((row): row is TRow => row !== undefined);
  }

  const searchColumnIds = getFilterColumns(columns, filter.queryColumnIds).map(
    (column) => column.id,
  );
  const searchResult = getVizTableSourceIndices(rows, columns, {
    filters: structuredFilters,
    search: {
      caseSensitive: false,
      columnIds: searchColumnIds,
      query,
    },
  });
  const searchSourceIndices = new Set(searchResult);
  const structuredSourceIndices =
    structuredFilters.length > 0
      ? new Set(
          getVizTableSourceIndices(rows, columns, {
            filters: structuredFilters,
          }),
        )
      : null;

  return rows.filter((row, rowIndex) => {
    return (
      searchSourceIndices.has(rowIndex) ||
      ((structuredSourceIndices === null || structuredSourceIndices.has(rowIndex)) &&
        filter.predicate?.(row, rowIndex, filter.query ?? "") === true)
    );
  });
}

export function applyTableSort<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
  sort: TableSortState,
): TRow[] {
  const sortRules = sort.flatMap((rule) => {
    const column = columns.find((candidate) => candidate.id === rule.columnId);

    if (!column) {
      return [];
    }

    return [
      {
        columnId: getSortColumnId(column),
        direction: rule.direction,
        nulls: rule.direction === "asc" ? "last" as const : "first" as const,
      },
    ];
  });

  if (sortRules.length === 0) {
    return Array.from(rows);
  }

  const sourceIndices = getVizTableSourceIndices(rows, columns, {
    sort: sortRules,
  });

  return sourceIndices
    .map((sourceIndex) => rows[sourceIndex])
    .filter((row): row is TRow => row !== undefined);
}

export function getColumnValue<TRow, TValue>(
  column: TableColumn<TRow, TValue>,
  row: TRow,
  rowIndex: number,
): TValue {
  if (typeof column.accessor === "function") {
    return column.accessor(row, rowIndex);
  }

  return row[column.accessor] as TValue;
}

export function getNextSortState(
  currentSort: TableSortState,
  columnId: string,
  multi = false,
): TableSortState {
  const currentRule = currentSort.find((rule) => rule.columnId === columnId);
  const nextRule = !currentRule
    ? {
      columnId,
      direction: "asc",
    } satisfies TableSortRule
    : currentRule.direction === "asc"
      ? {
          columnId,
          direction: "desc",
        } satisfies TableSortRule
      : null;

  if (!multi) {
    return nextRule ? [nextRule] : [];
  }

  const withoutColumn = currentSort.filter((rule) => rule.columnId !== columnId);

  return nextRule ? [...withoutColumn, nextRule] : withoutColumn;
}

export function compareTableValues(
  left: string | number | boolean | Date | null | undefined,
  right: string | number | boolean | Date | null | undefined,
): number {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (typeof leftValue === "boolean" && typeof rightValue === "boolean") {
    return Number(leftValue) - Number(rightValue);
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function createDefaultTableState<TRow>(
  initialState?: Partial<TableState<TRow>>,
): TableState<TRow> {
  return {
    columnSizing: initialState?.columnSizing ?? {},
    filter: initialState?.filter ?? null,
    selection: initialState?.selection ?? { selectedRowKeys: [] },
    sort: initialState?.sort ?? [],
  };
}

export function mergeControlledTableState<TRow>(
  internalState: TableState<TRow>,
  controlledState: Partial<TableState<TRow>> | undefined,
): TableState<TRow> {
  return {
    columnSizing: hasControlledStateKey(controlledState, "columnSizing")
      ? controlledState.columnSizing ?? {}
      : internalState.columnSizing,
    filter: hasControlledStateKey(controlledState, "filter")
      ? controlledState.filter ?? null
      : internalState.filter,
    selection: hasControlledStateKey(controlledState, "selection")
      ? controlledState.selection ?? { selectedRowKeys: [] }
      : internalState.selection,
    sort: hasControlledStateKey(controlledState, "sort")
      ? controlledState.sort ?? []
      : internalState.sort,
  };
}

export function hasControlledStateKey<TRow, TKey extends keyof TableState<TRow>>(
  state: Partial<TableState<TRow>> | undefined,
  key: TKey,
): state is Partial<TableState<TRow>> & Pick<TableState<TRow>, TKey> {
  return Boolean(state && Object.prototype.hasOwnProperty.call(state, key));
}

export function updateTableState<TRow, TKey extends keyof TableState<TRow>>(
  state: TableState<TRow>,
  key: TKey,
  value: TableState<TRow>[TKey],
): TableState<TRow> {
  return {
    ...state,
    [key]: value,
  };
}

function hasTableFilter<TRow>(filter: TableFilter<TRow> | null | undefined) {
  return Boolean(filter?.query?.trim() || (filter?.columnFilters?.length ?? 0) > 0);
}

function createVizTableFilters(
  filters: readonly TableColumnFilter[] | undefined,
): VizTableFilter[] {
  return (filters ?? []).map((filter) => ({
    caseSensitive: filter.caseSensitive,
    columnId: filter.columnId,
    operator: filter.operator,
    value: toVizTableFilterValue(filter.value),
  }));
}

function toVizTableFilterValue(
  value: TableColumnFilter["value"],
): VizTableFilter["value"] {
  if (Array.isArray(value)) {
    return value.map((entry) => toVizTableCellValue(entry));
  }

  return toVizTableCellValue(value);
}

function getFilterColumns<TRow>(
  columns: readonly TableColumn<TRow>[],
  columnIds?: readonly string[],
) {
  if (!columnIds || columnIds.length === 0) {
    return columns;
  }

  const enabled = new Set(columnIds);

  return columns.filter((column) => enabled.has(column.id));
}

function getVizTableSourceIndices<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
  query: VizTableQuery,
): readonly number[] {
  if (rows.length === 0) {
    return [];
  }

  const engine = createVizEngine({ backend: "auto" });
  const datasetId = engine.addDataset(createVizTableDataset(rows, columns));

  engine.addLayer({
    datasetId,
    kind: "table",
    query,
  });

  const frame = engine.computeFrame({
    frameFormat: "typed",
    viewport: {
      kind: "table",
      rowLimit: rows.length,
      rowOffset: 0,
    },
  });
  const layer = frame.layers.find(
    (candidate) => candidate.kind === "table" && "typedTable" in candidate,
  );

  return layer?.kind === "table" && "typedTable" in layer
    ? Array.from(layer.typedTable.sourceIndex)
    : [];
}

function createVizTableDataset<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
): VizTableColumnarDataset {
  const tableColumns = createVizTableColumns(rows, columns);

  return {
    columns: tableColumns.map((column) => createVizTableColumn(rows, columns, column)),
    kind: "table",
    rowIds: rows.map((_, rowIndex) => String(rowIndex)),
  };
}

function createVizTableColumn<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
  definition: VizTableColumnDefinition,
): VizTableColumnarDataset["columns"][number] {
  const values = rows.map((row, rowIndex) =>
    getVizTableColumnValue(row, rowIndex, columns, definition.id),
  );

  switch (definition.type) {
    case "date":
    case "number":
      return {
        ...definition,
        type: definition.type,
        validity: createNumericColumnValidity(values),
        values: Float64Array.from(values, (value) => toVizNumericValue(value) ?? 0),
      };
    case "boolean":
      return {
        ...definition,
        type: "boolean",
        validity: createBooleanColumnValidity(values),
        values: Uint8Array.from(values, (value) => value === true ? 1 : 0),
      };
    default:
      return {
        ...definition,
        values: values.map((value) => toVizTableCellValue(value)),
      };
  }
}

function getVizTableColumnValue<TRow>(
  row: TRow,
  rowIndex: number,
  columns: readonly TableColumn<TRow>[],
  columnId: string,
) {
  const sortColumn = columns.find((column) => getSortColumnId(column) === columnId);

  if (sortColumn?.sortAccessor && columnId === getSortColumnId(sortColumn)) {
    return sortColumn.sortAccessor(row, rowIndex);
  }

  const column = columns.find((candidate) => candidate.id === columnId);

  return column ? getColumnValue(column, row, rowIndex) : null;
}

function createNumericColumnValidity(values: readonly unknown[]) {
  return Uint8Array.from(values, (value) => toVizNumericValue(value) == null ? 0 : 1);
}

function createBooleanColumnValidity(values: readonly unknown[]) {
  return Uint8Array.from(values, (value) => value == null ? 0 : 1);
}

function toVizNumericValue(value: unknown) {
  if (value instanceof Date) {
    return value.getTime();
  }

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createVizTableColumns<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
): VizTableColumnDefinition[] {
  return columns.flatMap((column) => {
    const definitions: VizTableColumnDefinition[] = [
      {
        id: column.id,
        key: column.id,
        label: typeof column.header === "string" ? column.header : column.id,
        nullable: true,
        searchable: true,
        filterable: column.filterable ?? true,
        sortable: column.sortable ?? true,
        type: column.type ??
          inferColumnType(rows, (row, rowIndex) => getColumnValue(column, row, rowIndex)),
      },
    ];

    if (column.sortAccessor) {
      definitions.push({
        filterable: false,
        id: getSortColumnId(column),
        key: getSortColumnId(column),
        label: `${column.id} sort`,
        nullable: true,
        searchable: false,
        sortable: true,
        type: inferColumnType(rows, column.sortAccessor),
      });
    }

    return definitions;
  });
}

function getSortColumnId<TRow>(column: TableColumn<TRow>): string {
  return column.sortAccessor ? `${sortColumnPrefix}${column.id}` : column.id;
}

function inferColumnType<TRow>(
  rows: readonly TRow[],
  accessor: (row: TRow, rowIndex: number) => unknown,
): VizTableColumnType {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const value = accessor(rows[rowIndex], rowIndex);

    if (value == null) {
      continue;
    }

    if (value instanceof Date) {
      return "date";
    }

    if (Array.isArray(value)) {
      return "json";
    }

    switch (typeof value) {
      case "boolean":
        return "boolean";
      case "number":
        return "number";
      case "object":
        return "json";
      case "string":
        return "string";
      default:
        return "unknown";
    }
  }

  return "unknown";
}

function toVizTableCellValue(value: unknown): VizTableCellValue {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value;
  }

  return typeof value === "object" ? (value as Record<string, unknown>) : String(value);
}

const sortColumnPrefix = "__mb_tables_sort__";
