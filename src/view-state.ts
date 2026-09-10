import type {
  TableColumnFilter,
  TableColumnOrderState,
  TableColumnSizingState,
  TableColumnVisibilityState,
  TableFilter,
  TableFilterOperator,
  TableSortState,
  TableState,
} from "./data";

export const TABLE_VIEW_STATE_VERSION = 1 as const;

export type TableViewFilter = Omit<TableFilter<unknown>, "predicate">;

export type TableViewState = {
  columnOrder: TableColumnOrderState;
  columnSizing: TableColumnSizingState;
  columnVisibility: TableColumnVisibilityState;
  filter: TableViewFilter | null;
  sort: TableSortState;
  version: typeof TABLE_VIEW_STATE_VERSION;
};

type EncodedValue =
  | { kind: "array"; value: EncodedValue[] }
  | { kind: "bigint"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "date"; value: string }
  | { kind: "null" }
  | { kind: "number"; value: string }
  | { kind: "object"; value: Record<string, EncodedValue> }
  | { kind: "string"; value: string }
  | { kind: "undefined" };

type EncodedColumnFilter = Omit<TableColumnFilter, "value"> & {
  value?: EncodedValue;
};

type EncodedFilter = {
  columnFilters?: EncodedColumnFilter[];
  query?: string;
  queryColumnIds?: string[];
};

type EncodedTableViewState = {
  columnOrder: string[];
  columnSizing: Record<string, number>;
  columnVisibility: Record<string, boolean>;
  filter: EncodedFilter | null;
  sort: Array<{ columnId: string; direction: "asc" | "desc" }>;
  version: typeof TABLE_VIEW_STATE_VERSION;
};

const filterOperators = new Set<TableFilterOperator>([
  "between",
  "contains",
  "endsWith",
  "equals",
  "gt",
  "gte",
  "in",
  "isNotNull",
  "isNull",
  "lt",
  "lte",
  "notEquals",
  "startsWith",
]);

export function createDefaultTableViewState(): TableViewState {
  return {
    columnOrder: [],
    columnSizing: {},
    columnVisibility: {},
    filter: null,
    sort: [],
    version: TABLE_VIEW_STATE_VERSION,
  };
}

export function tableStateToViewState<TRow>(state: TableState<TRow>): TableViewState {
  return {
    columnOrder: [...(state.columnOrder ?? [])],
    columnSizing: { ...state.columnSizing },
    columnVisibility: { ...(state.columnVisibility ?? {}) },
    filter: state.filter ? toViewFilter(state.filter) : null,
    sort: state.sort.map((rule) => ({ ...rule })),
    version: TABLE_VIEW_STATE_VERSION,
  };
}

export function viewStateToTableState<TRow>(viewState: TableViewState): Partial<TableState<TRow>> {
  return {
    columnOrder: [...viewState.columnOrder],
    columnSizing: { ...viewState.columnSizing },
    columnVisibility: { ...viewState.columnVisibility },
    filter: viewState.filter
      ? ({
          ...viewState.filter,
          columnFilters: viewState.filter.columnFilters?.map((filter) => ({ ...filter })),
          queryColumnIds: viewState.filter.queryColumnIds
            ? [...viewState.filter.queryColumnIds]
            : undefined,
        } as TableFilter<TRow>)
      : null,
    sort: viewState.sort.map((rule) => ({ ...rule })),
  };
}

export function encodeTableViewState(viewState: TableViewState): string {
  const payload: EncodedTableViewState = {
    columnOrder: [...viewState.columnOrder],
    columnSizing: Object.fromEntries(
      Object.entries(viewState.columnSizing).filter(([, width]) => Number.isFinite(width)),
    ),
    columnVisibility: { ...viewState.columnVisibility },
    filter: viewState.filter ? encodeFilter(viewState.filter) : null,
    sort: viewState.sort.map((rule) => ({ ...rule })),
    version: TABLE_VIEW_STATE_VERSION,
  };

  return JSON.stringify(payload);
}

export function decodeTableViewState(input: string | null | undefined): TableViewState {
  if (!input) {
    return createDefaultTableViewState();
  }

  try {
    const parsed: unknown = JSON.parse(input);
    if (!isRecord(parsed) || parsed.version !== TABLE_VIEW_STATE_VERSION) {
      return createDefaultTableViewState();
    }

    return {
      columnOrder: decodeStringArray(parsed.columnOrder),
      columnSizing: decodeNumberRecord(parsed.columnSizing),
      columnVisibility: decodeBooleanRecord(parsed.columnVisibility),
      filter: parsed.filter === null ? null : decodeFilter(parsed.filter),
      sort: decodeSort(parsed.sort),
      version: TABLE_VIEW_STATE_VERSION,
    };
  } catch {
    return createDefaultTableViewState();
  }
}

function toViewFilter<TRow>(filter: TableFilter<TRow>): TableViewFilter {
  return {
    ...(filter.columnFilters
      ? { columnFilters: filter.columnFilters.map((columnFilter) => ({ ...columnFilter })) }
      : {}),
    ...(filter.query !== undefined ? { query: filter.query } : {}),
    ...(filter.queryColumnIds ? { queryColumnIds: [...filter.queryColumnIds] } : {}),
  };
}

function encodeFilter(filter: TableViewFilter): EncodedFilter {
  return {
    ...(filter.columnFilters
      ? {
          columnFilters: filter.columnFilters.map((columnFilter) => ({
            columnId: columnFilter.columnId,
            operator: columnFilter.operator,
            ...(columnFilter.caseSensitive !== undefined
              ? { caseSensitive: columnFilter.caseSensitive }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(columnFilter, "value")
              ? { value: encodeValue(columnFilter.value) }
              : {}),
          })),
        }
      : {}),
    ...(filter.query !== undefined ? { query: filter.query } : {}),
    ...(filter.queryColumnIds ? { queryColumnIds: [...filter.queryColumnIds] } : {}),
  };
}

function decodeFilter(value: unknown): TableViewFilter | null {
  if (!isRecord(value)) {
    return null;
  }

  const result: TableViewFilter = {};
  if (typeof value.query === "string") {
    result.query = value.query;
  }
  if (Array.isArray(value.queryColumnIds)) {
    result.queryColumnIds = value.queryColumnIds.filter(
      (columnId): columnId is string => typeof columnId === "string",
    );
  }
  if (Array.isArray(value.columnFilters)) {
    result.columnFilters = value.columnFilters.flatMap((candidate) => {
      const filter = decodeColumnFilter(candidate);
      return filter ? [filter] : [];
    });
  }

  return result;
}

function decodeColumnFilter(value: unknown): TableColumnFilter | null {
  if (
    !isRecord(value) ||
    typeof value.columnId !== "string" ||
    typeof value.operator !== "string" ||
    !filterOperators.has(value.operator as TableFilterOperator)
  ) {
    return null;
  }

  const filter: TableColumnFilter = {
    columnId: value.columnId,
    operator: value.operator as TableFilterOperator,
  };
  if (typeof value.caseSensitive === "boolean") {
    filter.caseSensitive = value.caseSensitive;
  }
  if (Object.prototype.hasOwnProperty.call(value, "value")) {
    filter.value = decodeValue(value.value) as TableColumnFilter["value"];
  }

  return filter;
}

function encodeValue(value: unknown): EncodedValue {
  if (value === null) {
    return { kind: "null" };
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return { kind: "undefined" };
  }
  if (typeof value === "string") {
    return { kind: "string", value };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", value };
  }
  if (typeof value === "number") {
    return { kind: "number", value: String(value) };
  }
  if (typeof value === "bigint") {
    return { kind: "bigint", value: String(value) };
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { kind: "undefined" }
      : { kind: "date", value: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return { kind: "array", value: value.map(encodeValue) };
  }

  return {
    kind: "object",
    value: Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, encodeValue(entry)]),
    ),
  };
}

function decodeValue(value: unknown): unknown {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return undefined;
  }

  switch (value.kind) {
    case "null":
      return null;
    case "undefined":
      return undefined;
    case "string":
      return typeof value.value === "string" ? value.value : undefined;
    case "boolean":
      return typeof value.value === "boolean" ? value.value : undefined;
    case "number":
      return typeof value.value === "string" ? Number(value.value) : undefined;
    case "bigint":
      if (typeof value.value !== "string") {
        return undefined;
      }
      try {
        return BigInt(value.value);
      } catch {
        return undefined;
      }
    case "date":
      if (typeof value.value !== "string") {
        return undefined;
      }
      {
        const date = new Date(value.value);
        return Number.isNaN(date.getTime()) ? undefined : date;
      }
    case "array":
      return Array.isArray(value.value) ? value.value.map(decodeValue) : undefined;
    case "object":
      if (!isRecord(value.value)) {
        return undefined;
      }
      return Object.fromEntries(
        Object.entries(value.value).map(([key, entry]) => [key, decodeValue(entry)]),
      );
    default:
      return undefined;
  }
}

function decodeSort(value: unknown): TableSortState {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) =>
    isRecord(candidate) &&
    typeof candidate.columnId === "string" &&
    (candidate.direction === "asc" || candidate.direction === "desc")
      ? [{ columnId: candidate.columnId, direction: candidate.direction }]
      : [],
  );
}

function decodeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function decodeNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

function decodeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
