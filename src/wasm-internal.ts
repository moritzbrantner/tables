import {
  getColumnValue,
  type TableDataColumn,
  type TableColumnFilter,
  type TableColumnType,
  type TableFilter,
  type TableSortState,
} from "./data";
import { validateTableQueryWindow } from "./query-window";
import type { PreparedTableQuery, TableQueryKernel, TableQueryResult, TableQueryWindow } from "./query-kernel";
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

type GeneratedQuerySnapshot = {
  readonly filteredRowCount: number;
  free(): void;
  queryWindow(offset: number, limit: number): Uint32Array;
};

type GeneratedTableIndex = {
  prepareQuery?(query: WasmTableQuery): GeneratedQuerySnapshot;
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
  column: TableDataColumn<TRow>;
  columnIndex: number;
  type: TableColumnType;
};

type PreparedTableIndex<TRow> = {
  columns: readonly TableDataColumn<TRow>[];
  columnsById: Map<string, TableDataColumn<TRow>>;
  index: GeneratedTableIndex;
  indexedById: Map<string, IndexedColumn<TRow>>;
  sortColumnIndices: Map<string, number>;
};

type PreparedTableIndexCache = {
  get<TRow>(
    rows: readonly TRow[],
    columns: readonly TableDataColumn<TRow>[],
  ): PreparedTableIndex<TRow>;
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

const MAX_PREPARED_SCHEMA_VARIANTS_PER_ROWS = 4;

export function createTableWasmKernelFromModule(value: unknown): TableWasmKernel {
  const module = normalizeGeneratedModule(value);
  const tableIndexCache = createPreparedTableIndexCache(module);

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
    prepareTableQuery(rows, columns, filter, sort = []) {
      return prepareTableQueryWithRust(tableIndexCache, rows, columns, filter, sort);
    },
    queryTableWindow(rows, columns, window, filter, sort = []) {
      validateTableQueryWindow(window);
      return queryTableWithRust(tableIndexCache, rows, columns, filter, sort, window);
    },
    queryTable(rows, columns, filter, sort = []) {
      return queryTableWithRust(tableIndexCache, rows, columns, filter, sort);
    },
  };
}

function createPreparedTableIndexCache(module: GeneratedTablesWasmModule): PreparedTableIndexCache {
  const cachedByRows = new WeakMap<object, PreparedTableIndex<unknown>[]>();
  const finalizer = new FinalizationRegistry<GeneratedTableIndex>((index) => {
    index.free();
  });

  return {
    get<TRow>(rows: readonly TRow[], columns: readonly TableDataColumn<TRow>[]) {
      const rowsKey = rows as object;
      let cached = cachedByRows.get(rowsKey);
      if (!cached) {
        cached = [];
        cachedByRows.set(rowsKey, cached);
      }

      const existingIndex = cached.findIndex((entry) => entry.columns === columns);
      if (existingIndex >= 0) {
        const existing = cached[existingIndex] as PreparedTableIndex<TRow>;
        cached.splice(existingIndex, 1);
        cached.push(existing as PreparedTableIndex<unknown>);
        return existing;
      }

      const index = new module.WasmTableIndex();
      const prepared: PreparedTableIndex<TRow> = {
        columns,
        columnsById: new Map(columns.map((column) => [column.id, column])),
        index,
        indexedById: new Map(),
        sortColumnIndices: new Map(),
      };
      cached.push(prepared as PreparedTableIndex<unknown>);
      finalizer.register(rowsKey, index, index);

      if (cached.length > MAX_PREPARED_SCHEMA_VARIANTS_PER_ROWS) {
        const evicted = cached.shift();
        if (evicted) {
          finalizer.unregister(evicted.index);
          evicted.index.free();
        }
      }

      return prepared;
    },
  };
}

type RustQueryPlan =
  | { kind: "identity" | "empty" }
  | { kind: "query"; index: GeneratedTableIndex; query: WasmTableQuery };

function queryTableWithRust<TRow>(
  cache: PreparedTableIndexCache,
  rows: readonly TRow[],
  columns: readonly TableDataColumn<TRow>[],
  filter: TableFilter<TRow> | null | undefined,
  sort: TableSortState,
  window?: TableQueryWindow,
): TableQueryResult {
  const plan = prepareRustQuery(cache, rows, columns, filter, sort, window);
  if (plan.kind !== "query") {
    return identityTableQueryResult(plan.kind === "empty" ? 0 : rows.length, window);
  }
  return decodeTableQueryResult(plan.index.query(plan.query), rows.length);
}

function prepareTableQueryWithRust<TRow>(
  cache: PreparedTableIndexCache,
  rows: readonly TRow[],
  columns: readonly TableDataColumn<TRow>[],
  filter: TableFilter<TRow> | null | undefined,
  sort: TableSortState,
): PreparedTableQuery {
  const plan = prepareRustQuery(cache, rows, columns, filter, sort);
  const rowCount = rows.length;
  let snapshot: GeneratedQuerySnapshot | null = null;
  let cached: readonly number[] | null = null;
  let filteredRowCount: number;
  if (plan.kind !== "query") {
    filteredRowCount = plan.kind === "identity" ? rowCount : 0;
  } else if (plan.index.prepareQuery) {
    snapshot = plan.index.prepareQuery(plan.query);
    try {
      filteredRowCount = readIndex(snapshot.filteredRowCount, "filteredRowCount");
      if (filteredRowCount > rowCount) throw new RangeError("Prepared match count exceeds source rows");
    } catch (error) {
      snapshot.free();
      throw error;
    }
  } else {
    // Older generated modules still support sessions; copy full indices once,
    // not on every page. The current module retains them exclusively in Rust.
    const result = decodeTableQueryResult(plan.index.query(plan.query), rowCount);
    if (result.sourceIndices.length !== result.filteredRowCount) {
      throw new TypeError("Prepared table query requires a complete result");
    }
    cached = result.sourceIndices;
    filteredRowCount = result.filteredRowCount;
  }
  let disposed = false;
  return {
    filteredRowCount,
    dispose() {
      if (disposed) return;
      disposed = true;
      const owned = snapshot;
      snapshot = null;
      cached = null;
      owned?.free();
    },
    queryWindow(window) {
      if (disposed) throw new Error("Prepared table query has been disposed");
      validateTableQueryWindow(window);
      const offset = Math.min(filteredRowCount, window.offset);
      const limit = Math.min(filteredRowCount - offset, window.limit);
      if (snapshot) {
        const result = decodeTableQueryResult(snapshot.queryWindow(offset, limit), rowCount);
        if (result.filteredRowCount !== filteredRowCount || result.sourceIndices.length !== limit) {
          throw new TypeError("Prepared table query returned inconsistent window counts");
        }
        return result;
      }
      return cached
        ? { filteredRowCount, sourceIndices: cached.slice(offset, offset + limit) }
        : identityTableQueryResult(filteredRowCount, { offset, limit });
    },
  };
}

function prepareRustQuery<TRow>(
  cache: PreparedTableIndexCache,
  rows: readonly TRow[],
  columns: readonly TableDataColumn<TRow>[],
  filter: TableFilter<TRow> | null | undefined,
  sort: TableSortState,
  window?: TableQueryWindow,
): RustQueryPlan {
  const queryText = filter?.query?.trim();
  const columnFilters = filter?.columnFilters ?? [];
  if (!queryText && columnFilters.length === 0 && sort.length === 0) {
    return { kind: "identity" };
  }

  const prepared = cache.get(rows, columns);
  const filters: WasmTableQuery["filters"] = [];

  for (const columnFilter of columnFilters) {
    const entry = ensureIndexedColumn(prepared, rows, columnFilter.columnId);
    if (!entry) {
      return { kind: "empty" };
    }

    const value = prepareFilterValue(columnFilter, entry.type);
    if (!value) {
      return { kind: "empty" };
    }

    filters.push({
      caseSensitive: columnFilter.caseSensitive === true,
      columnIndex: entry.columnIndex,
      operator: normalizeNullFilterOperator(columnFilter),
      value,
    });
  }

  const search = createSearch(filter, prepared, rows);
  const wasmSort: WasmTableQuery["sort"] = [];
  for (const rule of sort) {
    const columnIndex = ensureSortColumn(prepared, rows, rule.columnId);
    if (columnIndex === undefined) {
      continue;
    }

    wasmSort.push({
      columnIndex,
      direction: rule.direction,
      nulls: rule.direction === "desc" ? "first" : "last",
    });
  }

  if (filters.length === 0 && !search && wasmSort.length === 0) {
    return { kind: "identity" };
  }

  const query: WasmTableQuery = {
    filters,
    rowOffset: Math.min(rows.length, window?.offset ?? 0),
    rowLimit: window ? Math.min(rows.length, window.limit) : undefined,
    search,
    sort: wasmSort,
  };

  return { kind: "query", index: prepared.index, query };
}

function ensureIndexedColumn<TRow>(
  prepared: PreparedTableIndex<TRow>,
  rows: readonly TRow[],
  columnId: string,
): IndexedColumn<TRow> | undefined {
  const existing = prepared.indexedById.get(columnId);
  if (existing) {
    return existing;
  }

  const column = prepared.columnsById.get(columnId);
  if (!column) {
    return undefined;
  }

  let type = column.type;
  let columnIndex: number;
  if (type !== undefined) {
    columnIndex = addDeclaredColumn(prepared.index, rows, column, type);
  } else {
    // Inference retains single-accessor-call semantics for heterogeneous input.
    const values = rows.map((row, rowIndex) => getColumnValue(column, row, rowIndex));
    type = inferTableColumnType(values);
    columnIndex = addValuesColumn(prepared.index, values, type);
  }
  const indexed = { column, columnIndex, type } satisfies IndexedColumn<TRow>;
  prepared.indexedById.set(columnId, indexed);
  return indexed;
}

function ensureSortColumn<TRow>(
  prepared: PreparedTableIndex<TRow>,
  rows: readonly TRow[],
  columnId: string,
): number | undefined {
  const existing = prepared.sortColumnIndices.get(columnId);
  if (existing !== undefined) {
    return existing;
  }

  const column = prepared.columnsById.get(columnId);
  if (!column) {
    return undefined;
  }

  if (!column.sortAccessor) {
    return ensureIndexedColumn(prepared, rows, columnId)?.columnIndex;
  }

  const values = rows.map((row, rowIndex) => column.sortAccessor?.(row, rowIndex));
  const columnIndex = addValuesColumn(prepared.index, values, inferTableColumnType(values));
  prepared.sortColumnIndices.set(columnId, columnIndex);
  return columnIndex;
}

function addDeclaredColumn<TRow>(
  index: GeneratedTableIndex,
  rows: readonly TRow[],
  column: TableDataColumn<TRow>,
  type: TableColumnType,
): number {
  if (type === "number" || type === "date") {
    const values = new Float64Array(rows.length);
    const validity = new Uint8Array(rows.length);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      // Match Array.map's treatment of holes without invoking an accessor there.
      const value = rowIndex in rows ? getColumnValue(column, rows[rowIndex]!, rowIndex) : undefined;
      const numeric = toNumericColumnValue(value, type);
      values[rowIndex] = numeric;
      validity[rowIndex] = Number.isFinite(numeric) ? 1 : 0;
    }
    return index.addNumericColumn(values, validity);
  }
  if (type === "boolean") {
    const values = new Uint8Array(rows.length);
    const validity = new Uint8Array(rows.length);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const value = rowIndex in rows ? getColumnValue(column, rows[rowIndex]!, rowIndex) : undefined;
      values[rowIndex] = value === true ? 1 : 0;
      validity[rowIndex] = typeof value === "boolean" ? 1 : 0;
    }
    return index.addBooleanColumn(values, validity);
  }
  return index.addStringColumn(rows.map((row, rowIndex) => {
    const value = getColumnValue(column, row, rowIndex);
    return value == null ? null : stableStringValue(value);
  }));
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
  prepared: PreparedTableIndex<TRow>,
  rows: readonly TRow[],
): WasmTableQuery["search"] {
  const query = filter?.query?.trim();
  if (!query) {
    return undefined;
  }

  const requestedColumnIds = filter?.queryColumnIds?.length
    ? filter.queryColumnIds
    : prepared.columns.map((column) => column.id);
  const columnIndices: number[] = [];
  const seen = new Set<string>();

  for (const columnId of requestedColumnIds) {
    if (seen.has(columnId)) {
      continue;
    }
    seen.add(columnId);

    const column = prepared.columnsById.get(columnId);
    if (!declaredSearchColumnCanMatch(column, query)) {
      continue;
    }

    const entry = ensureIndexedColumn(prepared, rows, columnId);
    if (entry) {
      columnIndices.push(entry.columnIndex);
    }
  }

  return {
    caseSensitive: false,
    columnIndices,
    query,
  };
}

function declaredSearchColumnCanMatch<TRow>(
  column: TableDataColumn<TRow> | undefined,
  query: string,
): boolean {
  const type = column?.type;
  if (type === "number" || type === "date") {
    for (let index = 0; index < query.length; index += 1) {
      const code = query.charCodeAt(index);
      const digit = code >= 0x30 && code <= 0x39;
      if (!digit && code !== 0x2e && code !== 0x2d && code !== 0x2b && code !== 0x65 && code !== 0x45) {
        return false;
      }
    }
    return true;
  }

  if (type === "boolean") {
    const needle = query.toLowerCase();
    return "true".includes(needle) || "false".includes(needle);
  }

  return true;
}

function identityTableQueryResult(rowCount: number, window?: TableQueryWindow): TableQueryResult {
  const offset = Math.min(rowCount, window?.offset ?? 0);
  const length = Math.min(rowCount - offset, window?.limit ?? rowCount);
  return {
    filteredRowCount: rowCount,
    sourceIndices: Array.from({ length }, (_, index) => index + offset),
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
  if (filteredRowCount > rowCount || values.length - 1 > filteredRowCount) {
    throw new RangeError("tables Wasm result counts exceed source or matching rows");
  }
  const sourceIndices = new Array<number>(values.length - 1);

  for (let index = 1; index < values.length; index += 1) {
    const sourceIndex = values[index];
    if (typeof sourceIndex !== "number" || !Number.isSafeInteger(sourceIndex) || sourceIndex < 0) {
      throw new TypeError(`tables Wasm field sourceIndex[${index - 1}] must be a non-negative safe integer`);
    }
    if (sourceIndex >= rowCount) {
      throw new RangeError(`tables Wasm source index ${sourceIndex} is outside ${rowCount} rows`);
    }
    sourceIndices[index - 1] = sourceIndex;
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
