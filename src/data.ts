import type { ReactNode } from "react";

import { getTableQueryKernel } from "./query-kernel";

export type TableColumnAlign = "center" | "end" | "start";

export type TableColumnType = "boolean" | "date" | "json" | "number" | "string" | "unknown";

export type TableFilterOperator =
  | "between"
  | "contains"
  | "endsWith"
  | "equals"
  | "gt"
  | "gte"
  | "in"
  | "isNotNull"
  | "isNull"
  | "lt"
  | "lte"
  | "notEquals"
  | "startsWith";

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
  filterOptions?: readonly string[];
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
  const kernel = getTableQueryKernel();

  if (kernel && !hasActivePredicate(filter)) {
    const result = kernel.queryTable(rows, columns, hasTableFilter(filter) ? filter : null, sort);
    const modelRows = rowsFromSourceIndices(rows, result.sourceIndices);

    return {
      columns,
      filteredRowCount: result.filteredRowCount,
      rows: modelRows,
      sortedRowCount: modelRows.length,
      totalRowCount: rows.length,
    };
  }

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
  const structuredFilters = filter.columnFilters ?? [];

  if (!query && structuredFilters.length === 0) {
    return Array.from(rows);
  }

  const kernel = getTableQueryKernel();
  if (!kernel) {
    return applyTableFilterTypeScript(rows, columns, filter);
  }

  const builtIn = kernel.queryTable(rows, columns, filter, []);
  if (!query || !filter.predicate) {
    return rowsFromSourceIndices(rows, builtIn.sourceIndices);
  }

  const predicateCandidates = structuredFilters.length > 0
    ? kernel.queryTable(rows, columns, { columnFilters: structuredFilters }, []).sourceIndices
    : rows.map((_, rowIndex) => rowIndex);
  const included = new Set(builtIn.sourceIndices);

  for (const rowIndex of predicateCandidates) {
    const row = rows[rowIndex];
    if (row !== undefined && filter.predicate(row, rowIndex, filter.query ?? "")) {
      included.add(rowIndex);
    }
  }

  return rows.filter((_, rowIndex) => included.has(rowIndex));
}

export function applyTableSort<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
  sort: TableSortState,
): TRow[] {
  if (sort.length === 0) {
    return Array.from(rows);
  }

  const kernel = getTableQueryKernel();
  if (kernel) {
    return rowsFromSourceIndices(rows, kernel.queryTable(rows, columns, null, sort).sourceIndices);
  }

  return applyTableSortTypeScript(rows, columns, sort);
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

function applyTableFilterTypeScript<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
  filter: TableFilter<TRow>,
): TRow[] {
  const query = filter.query?.trim() ?? "";
  const structuredFilters = filter.columnFilters ?? [];
  const searchColumns = getFilterColumns(columns, filter.queryColumnIds);

  return rows.filter((row, rowIndex) => {
    const structuredMatch = structuredFilters.every((columnFilter) => {
      const column = columns.find((candidate) => candidate.id === columnFilter.columnId);
      return column ? matchesColumnFilter(getColumnValue(column, row, rowIndex), columnFilter) : false;
    });

    if (!structuredMatch) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchMatch = searchColumns.some((column) =>
      normalizeSearchText(getColumnValue(column, row, rowIndex)).includes(query.toLowerCase()),
    );

    return searchMatch || filter.predicate?.(row, rowIndex, filter.query ?? "") === true;
  });
}

function applyTableSortTypeScript<TRow>(
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
  sort: TableSortState,
): TRow[] {
  const rules = sort.flatMap((rule) => {
    const column = columns.find((candidate) => candidate.id === rule.columnId);
    return column ? [{ column, direction: rule.direction }] : [];
  });

  if (rules.length === 0) {
    return Array.from(rows);
  }

  return rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .sort((left, right) => {
      for (const rule of rules) {
        const leftValue = rule.column.sortAccessor
          ? rule.column.sortAccessor(left.row, left.rowIndex)
          : getColumnValue(rule.column, left.row, left.rowIndex);
        const rightValue = rule.column.sortAccessor
          ? rule.column.sortAccessor(right.row, right.rowIndex)
          : getColumnValue(rule.column, right.row, right.rowIndex);
        const comparison = compareForSort(leftValue, rightValue, rule.direction);
        if (comparison !== 0) {
          return comparison;
        }
      }

      return left.rowIndex - right.rowIndex;
    })
    .map(({ row }) => row);
}

function matchesColumnFilter(value: unknown, filter: TableColumnFilter): boolean {
  const operator = filter.operator;
  if (operator === "isNull") {
    return value == null;
  }
  if (operator === "isNotNull") {
    return value != null;
  }
  if (operator === "equals") {
    return filterValuesEqual(value, filter.value, filter.caseSensitive === true);
  }
  if (operator === "notEquals") {
    return !filterValuesEqual(value, filter.value, filter.caseSensitive === true);
  }
  if (operator === "in") {
    return Array.isArray(filter.value) && filter.value.some((candidate) =>
      filterValuesEqual(value, candidate, filter.caseSensitive === true),
    );
  }

  if (value instanceof Date || typeof value === "number") {
    const actual = value instanceof Date ? value.getTime() : value;
    return matchesNumericFilter(actual, filter);
  }

  if (typeof value === "boolean") {
    return matchesBooleanFilter(value, filter);
  }

  return matchesStringFilter(value, filter);
}

function matchesNumericFilter(actual: number, filter: TableColumnFilter): boolean {
  const expected = toNumericValue(filter.value);
  switch (filter.operator) {
    case "equals":
      return expected !== null && actual === expected;
    case "notEquals":
      return expected === null || actual !== expected;
    case "gt":
      return expected !== null && actual > expected;
    case "gte":
      return expected !== null && actual >= expected;
    case "lt":
      return expected !== null && actual < expected;
    case "lte":
      return expected !== null && actual <= expected;
    case "between": {
      const [min, max] = Array.isArray(filter.value) ? filter.value : [];
      const minValue = toNumericValue(min);
      const maxValue = toNumericValue(max);
      return minValue !== null && maxValue !== null && actual >= minValue && actual <= maxValue;
    }
    case "in":
      return Array.isArray(filter.value) && filter.value.some((candidate) => toNumericValue(candidate) === actual);
    default:
      return false;
  }
}

function matchesBooleanFilter(actual: boolean, filter: TableColumnFilter): boolean {
  switch (filter.operator) {
    case "equals":
      return actual === filter.value;
    case "notEquals":
      return actual !== filter.value;
    case "in":
      return Array.isArray(filter.value) && filter.value.includes(actual);
    default:
      return false;
  }
}

function matchesStringFilter(value: unknown, filter: TableColumnFilter): boolean {
  const actual = normalizeStringValue(value, filter.caseSensitive === true);
  const expected = normalizeStringValue(filter.value, filter.caseSensitive === true);

  switch (filter.operator) {
    case "contains":
      return actual.includes(expected);
    case "startsWith":
      return actual.startsWith(expected);
    case "endsWith":
      return actual.endsWith(expected);
    default:
      return false;
  }
}

function filterValuesEqual(left: unknown, right: unknown, caseSensitive: boolean): boolean {
  if (left == null || right == null || Array.isArray(right)) {
    return left === right;
  }

  if (typeof left === "string" || typeof right === "string") {
    return normalizeStringValue(left, caseSensitive) === normalizeStringValue(right, caseSensitive);
  }

  return stringifyCellValue(left) === stringifyCellValue(right);
}

function compareForSort(left: unknown, right: unknown, direction: TableSortDirection): number {
  const leftNull = left == null || (typeof left === "number" && !Number.isFinite(left));
  const rightNull = right == null || (typeof right === "number" && !Number.isFinite(right));

  if (leftNull || rightNull) {
    if (leftNull && rightNull) {
      return 0;
    }
    const nullsFirst = direction === "desc";
    return leftNull === nullsFirst ? -1 : 1;
  }

  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;
  let comparison = 0;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    comparison = leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
  } else if (typeof leftValue === "boolean" && typeof rightValue === "boolean") {
    comparison = Number(leftValue) - Number(rightValue);
  } else {
    const leftString = stringifyCellValue(leftValue);
    const rightString = stringifyCellValue(rightValue);
    comparison = leftString === rightString ? 0 : leftString < rightString ? -1 : 1;
  }

  return direction === "asc" ? comparison : -comparison;
}

function getFilterColumns<TRow>(
  columns: readonly TableColumn<TRow>[],
  columnIds?: readonly string[],
): readonly TableColumn<TRow>[] {
  if (!columnIds || columnIds.length === 0) {
    return columns;
  }

  const enabled = new Set(columnIds);
  return columns.filter((column) => enabled.has(column.id));
}

function rowsFromSourceIndices<TRow>(rows: readonly TRow[], sourceIndices: readonly number[]): TRow[] {
  return sourceIndices
    .map((sourceIndex) => rows[sourceIndex])
    .filter((row): row is TRow => row !== undefined);
}

function hasTableFilter<TRow>(filter: TableFilter<TRow> | null | undefined): boolean {
  return Boolean(filter?.query?.trim() || (filter?.columnFilters?.length ?? 0) > 0);
}

function hasActivePredicate<TRow>(filter: TableFilter<TRow> | null | undefined): boolean {
  return Boolean(filter?.query?.trim() && filter.predicate);
}

function normalizeSearchText(value: unknown): string {
  return stringifyCellValue(value).toLowerCase();
}

function normalizeStringValue(value: unknown, caseSensitive: boolean): string {
  const string = stringifyCellValue(value);
  return caseSensitive ? string : string.toLowerCase();
}

function stringifyCellValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return String(value.getTime());
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringifyCellValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${stringifyCellValue(record[key])}`)
      .join(",")}}`;
  }
  return String(value);
}

function toNumericValue(value: unknown): number | null {
  if (value instanceof Date) {
    return value.getTime();
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
