import {
  getColumnValue,
  type TableColumn,
  type TableColumnFilter,
  type TableColumnType,
  type TableFilter,
  type TableSortState,
} from "./data";
import type { TableQueryKernel, TableQueryResult } from "./query-kernel";
import type {
  FixedVirtualRangeOptions,
  VariableVirtualRangeOptions,
  VirtualRange,
} from "./virtualization";

export type TableWasmVariableLayout = {
  readonly backend: "wasm";
  readonly length: number;
  readonly totalSize: number;
  dispose(): void;
  virtualRange(options: Omit<VariableVirtualRangeOptions, "itemSizes">): VirtualRange;
};

export type TableWasmKernel = TableQueryKernel & {
  createVariableLayout(itemSizes: readonly number[]): TableWasmVariableLayout;
  fixedVirtualRange(options: FixedVirtualRangeOptions): VirtualRange;
};

type GeneratedVariableLayout = {
  readonly length: number;
  readonly totalSize: number;
  free(): void;
  virtualRange(overscan: number, scrollOffset: number, viewportSize: number): Float64Array;
};

type GeneratedTableIndex = {
  addBooleanColumn(values: Uint8Array, validity: Uint8Array): number;
  addNumericColumn(values: Float64Array, validity: Uint8Array): number;
  addStringColumn(values: readonly (string | null)[]): number;
  free(): void;
  query(query: WasmTableQuery): Uint32Array;
};

type GeneratedTablesWasmModule = {
  WasmTableIndex: new () => GeneratedTableIndex;
  WasmVariableLayout: new (itemSizes: Float64Array) => GeneratedVariableLayout;
  fixedVirtualRange(
    count: number,
    itemSize: number,
    overscan: number,
    scrollOffset: number,
    viewportSize: number,
  ): Float64Array;
};

type IndexedColumn<TRow> = {
  column: TableColumn<TRow>;
  columnIndex: number;
  type: TableColumnType;
};

type WasmTableFilterValue =
  | { kind: "none" }
  | { kind: "number"; value: number }
  | { kind: "numberRange"; max: number; min: number }
  | { includeNull: boolean; kind: "numbers"; values: number[] }
  | { kind: "boolean"; value: boolean }
  | { includeNull: boolean; kind: "booleans"; values: boolean[] }
  | { kind: "string"; value: string }
  | { includeNull: boolean; kind: "strings"; values: string[] };

type WasmTableQuery = {
  filters: Array<{
    caseSensitive: boolean;
    columnIndex: number;
    operator: TableColumnFilter["operator"];
    value: WasmTableFilterValue;
  }>;
  rowLimit?: number;
  rowOffset: number;
  search?: {
    caseSensitive: boolean;
    columnIndices: number[];
    query: string;
  };
  sort: Array<{
    columnIndex: number;
    direction: "asc" | "desc";
    nulls: "first" | "last";
  }>;
};

export function createTableWasmKernelFromModule(value: unknown): TableWasmKernel {
  const module = normalizeGeneratedModule(value);

  return {
    createVariableLayout(itemSizes) {
      const layout = new module.WasmVariableLayout(Float64Array.from(itemSizes));
      let disposed = false;

      return {
        backend: "wasm",
        get length() {
          return disposed ? 0 : layout.length;
        },
        get totalSize() {
          return disposed ? 0 : layout.totalSize;
        },
        dispose() {
          if (!disposed) {
            layout.free();
            disposed = true;
          }
        },
        virtualRange({ overscan = 1, scrollOffset, viewportSize }) {
          if (disposed) {
            throw new Error("tables Wasm variable layout has been disposed");
          }

          return decodeVirtualRange(
            layout.virtualRange(normalizeWasmUnsigned(overscan), scrollOffset, viewportSize),
          );
        },
      };
    },
    fixedVirtualRange({ count, itemSize, overscan = 2, scrollOffset, viewportSize }) {
      return decodeVirtualRange(
        module.fixedVirtualRange(
          normalizeWasmUnsigned(count),
          itemSize,
          normalizeWasmUnsigned(overscan),
          scrollOffset,
          viewportSize,
        ),
      );
    },
    queryTable(rows, columns, filter, sort = []) {
      return queryTableWithRust(module, rows, columns, filter, sort);
    },
  };
}

function queryTableWithRust<TRow>(
  module: GeneratedTablesWasmModule,
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
  filter: TableFilter<TRow> | null | undefined,
  sort: TableSortState,
): TableQueryResult {
  const index = new module.WasmTableIndex();

  try {
    const indexedColumns = indexColumns(index, rows, columns);
    const indexedById = new Map(indexedColumns.map((entry) => [entry.column.id, entry]));
    const sortColumnIndices = new Map<string, number>();

    for (const rule of sort) {
      const entry = indexedById.get(rule.columnId);
      if (!entry || !entry.column.sortAccessor) {
        continue;
      }

      const values = rows.map((row, rowIndex) => entry.column.sortAccessor?.(row, rowIndex));
      sortColumnIndices.set(
        rule.columnId,
        addValuesColumn(index, values, inferTableColumnType(values)),
      );
    }

    const filters: WasmTableQuery["filters"] = [];
    for (const columnFilter of filter?.columnFilters ?? []) {
      const entry = indexedById.get(columnFilter.columnId);
      if (!entry) {
        return { filteredRowCount: 0, sourceIndices: [] };
      }

      const value = prepareFilterValue(columnFilter, entry.type);
      if (!value) {
        return { filteredRowCount: 0, sourceIndices: [] };
      }

      filters.push({
        caseSensitive: columnFilter.caseSensitive === true,
        columnIndex: entry.columnIndex,
        operator: normalizeNullFilterOperator(columnFilter),
        value,
      });
    }

    const query: WasmTableQuery = {
      filters,
      rowOffset: 0,
      search: createSearch(filter, indexedById),
      sort: sort.flatMap((rule) => {
        const entry = indexedById.get(rule.columnId);
        if (!entry) {
          return [];
        }

        return [{
          columnIndex: sortColumnIndices.get(rule.columnId) ?? entry.columnIndex,
          direction: rule.direction,
          nulls: rule.direction === "desc" ? "first" as const : "last" as const,
        }];
      }),
    };

    return decodeTableQueryResult(index.query(query), rows.length);
  } finally {
    index.free();
  }
}

function indexColumns<TRow>(
  index: GeneratedTableIndex,
  rows: readonly TRow[],
  columns: readonly TableColumn<TRow>[],
): IndexedColumn<TRow>[] {
  return columns.map((column) => {
    const values = rows.map((row, rowIndex) => getColumnValue(column, row, rowIndex));
    const type = column.type ?? inferTableColumnType(values);

    return {
      column,
      columnIndex: addValuesColumn(index, values, type),
      type,
    };
  });
}

function addValuesColumn(
  index: GeneratedTableIndex,
  values: readonly unknown[],
  type: TableColumnType,
): number {
  if (type === "number" || type === "date") {
    const validity = Uint8Array.from(values, (value) => isNumericValue(value, type) ? 1 : 0);
    const numeric = Float64Array.from(values, (value) => toNumericColumnValue(value, type));
    return index.addNumericColumn(numeric, validity);
  }

  if (type === "boolean") {
    const validity = Uint8Array.from(values, (value) => typeof value === "boolean" ? 1 : 0);
    const boolean = Uint8Array.from(values, (value) => value === true ? 1 : 0);
    return index.addBooleanColumn(boolean, validity);
  }

  return index.addStringColumn(values.map((value) => value == null ? null : stableStringValue(value)));
}

function createSearch<TRow>(
  filter: TableFilter<TRow> | null | undefined,
  indexedById: Map<string, IndexedColumn<TRow>>,
): WasmTableQuery["search"] {
  const query = filter?.query?.trim();
  if (!query) {
    return undefined;
  }

  const requested = filter?.queryColumnIds?.length
    ? new Set(filter.queryColumnIds)
    : null;
  const columnIndices = Array.from(indexedById.values())
    .filter((entry) => !requested || requested.has(entry.column.id))
    .map((entry) => entry.columnIndex);

  return {
    caseSensitive: false,
    columnIndices,
    query,
  };
}

function normalizeNullFilterOperator(
  filter: TableColumnFilter,
): TableColumnFilter["operator"] {
  if (filter.value != null) {
    return filter.operator;
  }

  if (filter.operator === "equals") {
    return "isNull";
  }

  if (filter.operator === "notEquals") {
    return "isNotNull";
  }

  return filter.operator;
}

function prepareFilterValue(
  filter: TableColumnFilter,
  type: TableColumnType,
): WasmTableFilterValue | null {
  if (filter.operator === "isNull" || filter.operator === "isNotNull") {
    return { kind: "none" };
  }

  if (filter.operator === "between") {
    const candidates = Array.isArray(filter.value) ? filter.value : [];
    if (candidates.length !== 2) {
      return null;
    }
    const min = toNumericFilterValue(candidates[0], type);
    const max = toNumericFilterValue(candidates[1], type);
    return min === null || max === null ? null : { kind: "numberRange", max, min };
  }

  if (filter.operator === "in") {
    const candidates = Array.isArray(filter.value) ? filter.value : [];
    const includeNull = candidates.some((candidate) => candidate == null);

    if (type === "number" || type === "date") {
      return {
        includeNull,
        kind: "numbers",
        values: candidates.flatMap((candidate) => {
          const value = toNumericFilterValue(candidate, type);
          return value === null ? [] : [value];
        }),
      };
    }

    if (type === "boolean") {
      return {
        includeNull,
        kind: "booleans",
        values: candidates.filter((candidate): candidate is boolean => typeof candidate === "boolean"),
      };
    }

    return {
      includeNull,
      kind: "strings",
      values: candidates.flatMap((candidate) => candidate == null ? [] : [stableStringValue(candidate)]),
    };
  }

  if (filter.value == null) {
    return { kind: "none" };
  }

  if (type === "number" || type === "date") {
    const value = toNumericFilterValue(filter.value, type);
    return value === null ? null : { kind: "number", value };
  }

  if (type === "boolean") {
    return typeof filter.value === "boolean"
      ? { kind: "boolean", value: filter.value }
      : null;
  }

  return { kind: "string", value: stableStringValue(filter.value) };
}

function inferTableColumnType(values: readonly unknown[]): TableColumnType {
  for (const value of values) {
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

function isNumericValue(value: unknown, type: TableColumnType): boolean {
  if (type === "date") {
    return value instanceof Date && Number.isFinite(value.getTime());
  }
  return typeof value === "number" && Number.isFinite(value);
}

function toNumericColumnValue(value: unknown, type: TableColumnType): number {
  if (type === "date") {
    return value instanceof Date ? value.getTime() : Number.NaN;
  }
  return typeof value === "number" ? value : Number.NaN;
}

function toNumericFilterValue(value: unknown, type: TableColumnType): number | null {
  if (type === "date") {
    return value instanceof Date && Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stableStringValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return String(value.getTime());
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${stableStringValue(record[key])}`)
      .join(",")}}`;
  }
  return String(value);
}

function normalizeGeneratedModule(value: unknown): GeneratedTablesWasmModule {
  const direct = readGeneratedModule(value);
  if (direct) {
    return direct;
  }

  if (isRecord(value)) {
    const nested = readGeneratedModule(value.default);
    if (nested) {
      return nested;
    }
  }

  throw new TypeError("tables Wasm module does not expose the expected direct table kernels");
}

function readGeneratedModule(value: unknown): GeneratedTablesWasmModule | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.fixedVirtualRange !== "function" ||
    typeof value.WasmTableIndex !== "function" ||
    typeof value.WasmVariableLayout !== "function"
  ) {
    return null;
  }

  return value as GeneratedTablesWasmModule;
}

function decodeVirtualRange(values: ArrayLike<number>): VirtualRange {
  if (values.length !== 6) {
    throw new TypeError(`tables Wasm virtual range must contain 6 fields, received ${values.length}`);
  }

  const startIndex = readIndex(values[0], "startIndex");
  const endIndex = readIndex(values[1], "endIndex");
  const offsetBefore = readFiniteNumber(values[2], "offsetBefore");
  const offsetAfter = readFiniteNumber(values[3], "offsetAfter");
  const totalSize = readFiniteNumber(values[4], "totalSize");
  const visibleCount = readIndex(values[5], "visibleCount");

  return {
    endIndex,
    offsetAfter,
    offsetBefore,
    startIndex,
    totalSize,
    visibleCount,
  };
}

function decodeTableQueryResult(values: ArrayLike<number>, rowCount: number): TableQueryResult {
  if (values.length === 0) {
    throw new TypeError("tables Wasm table query result must contain a filtered row count");
  }

  const filteredRowCount = readIndex(values[0], "filteredRowCount");
  const sourceIndices: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const sourceIndex = readIndex(values[index], `sourceIndex[${index - 1}]`);
    if (sourceIndex >= rowCount) {
      throw new RangeError(`tables Wasm source index ${sourceIndex} is outside ${rowCount} rows`);
    }
    sourceIndices.push(sourceIndex);
  }

  return { filteredRowCount, sourceIndices };
}

function readIndex(value: number | undefined, field: string): number {
  const number = readFiniteNumber(value, field);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`tables Wasm field ${field} must be a non-negative safe integer`);
  }
  return number;
}

function readFiniteNumber(value: number | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`tables Wasm field ${field} must be finite`);
  }
  return value;
}

function normalizeWasmUnsigned(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(0xffff_ffff, Math.floor(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
