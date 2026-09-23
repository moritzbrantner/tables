import { afterEach, describe, expect, it, vi } from "vitest";
import { createTableModel, createTableQuerySession, createTableWindowModel, type TableDataColumn } from "./data";
import { setTableQueryKernel } from "./query-kernel";
import { createTableWasmKernelFromModule } from "./wasm-internal";

const rows = Array.from({ length: 1000 }, (_, id) => ({ id, value: id }));
const columns: TableDataColumn<(typeof rows)[number]>[] = [{ id: "value", accessor: "value", type: "number" }];
const sort = [{ columnId: "value", direction: "desc" as const }];
afterEach(() => { setTableQueryKernel(null); vi.restoreAllMocks(); });

describe("explicit query sessions", () => {
  it("runs callbacks once and never re-filters or re-sorts while paging", () => {
    const predicate = vi.fn((row: (typeof rows)[number]) => row.id % 2 === 0);
    const accessor = vi.fn((row: (typeof rows)[number]) => row.value);
    const session = createTableQuerySession({ rows, columns: [{ ...columns[0]!, accessor }], sort,
      filter: { query: "not-a-number", predicate } });
    const preparedCalls = [predicate.mock.calls.length, accessor.mock.calls.length];
    const expected = rows.filter((row) => row.id % 2 === 0).reverse();
    for (const offset of [0, 200, 17, 400, 0]) {
      expect(session.getWindow({ offset, limit: 32 }).rows).toEqual(expected.slice(offset, offset + 32));
    }
    expect(preparedCalls[0]).toBe(rows.length);
    expect([predicate.mock.calls.length, accessor.mock.calls.length]).toEqual(preparedCalls);
    session.dispose();
  });

  it("materializes older custom kernels once and remains pinned when the active kernel changes", () => {
    const full = vi.fn(() => ({ filteredRowCount: rows.length, sourceIndices: rows.map((row) => row.id).reverse() }));
    setTableQueryKernel({ queryTable: full });
    const session = createTableQuerySession({ rows, columns, sort });
    setTableQueryKernel({ queryTable: () => { throw new Error("Wrong kernel"); } });
    for (const offset of [0, 600, 999]) {
      expect(session.getWindow({ offset, limit: 20 }).rows).toEqual([...rows].reverse().slice(offset, offset + 20));
    }
    expect(full).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it("preserves the older full model's counts and offsets when it omits undefined rows", () => {
    const source = [undefined, rows[1]];
    setTableQueryKernel({ queryTable: () => ({ filteredRowCount: 2, sourceIndices: [0, 1] }) });
    const options = { rows: source, columns: [] };
    const session = createTableQuerySession(options);
    for (const offset of [0, 1, 2, Number.MAX_SAFE_INTEGER]) {
      const window = { offset, limit: 2 };
      expect(session.getWindow(window)).toEqual(createTableWindowModel({ ...options, window }));
    }
    session.dispose();
  });

  it("preserves explicit locale semantics and does not delegate them to a prepared kernel", () => {
    const prepareTableQuery = vi.fn(() => { throw new Error("Unsupported locale"); });
    setTableQueryKernel({ queryTable: () => { throw new Error("Unsupported locale"); }, prepareTableQuery });
    const data = ["I", "i", "İ", "ı", "J"].map((value) => ({ value }));
    const schema: TableDataColumn<(typeof data)[number]>[] = [{ id: "value", accessor: "value" }];
    const options = { rows: data, columns: schema, locale: "tr", filter: { query: "i" } };
    const expected = createTableModel(options);
    const session = createTableQuerySession(options);
    expect(session.getWindow({ offset: 1, limit: 2 }).rows).toEqual(expected.rows.slice(1, 3));
    expect(prepareTableQuery).not.toHaveBeenCalled();
    session.dispose();
  });

  it("captures query state and keeps replacement row snapshots independent", () => {
    const filter = { columnFilters: [{ columnId: "value", operator: "gte" as const, value: 900 }] };
    const session = createTableQuerySession({ rows, columns, filter, sort });
    filter.columnFilters[0]!.value = 990;
    const updated = createTableQuerySession({ rows: rows.slice(500), columns, filter, sort });
    expect(session.filteredRowCount).toBe(100);
    expect(updated.filteredRowCount).toBe(10);
    expect(session.getWindow({ offset: 9, limit: 2 }).rows.map((row) => row.id)).toEqual([990, 989]);
    expect(updated.getWindow({ offset: 9, limit: 2 }).rows.map((row) => row.id)).toEqual([990]);
    session.dispose(); updated.dispose();
  });

  it("validates bounds and disposed state without reading a page", () => {
    const queryWindow = vi.fn(() => ({ filteredRowCount: 0, sourceIndices: [] }));
    const dispose = vi.fn();
    setTableQueryKernel({ queryTable: vi.fn(), prepareTableQuery: () => ({ filteredRowCount: 0, queryWindow, dispose }) });
    const session = createTableQuerySession({ rows, columns });
    for (const invalid of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => session.getWindow({ offset: invalid, limit: 5 })).toThrow(RangeError);
      expect(() => session.getWindow({ offset: 0, limit: invalid })).toThrow(RangeError);
    }
    expect(queryWindow).not.toHaveBeenCalled();
    session.dispose(); session.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => session.getWindow({ offset: 0, limit: 1 })).toThrow("disposed");
  });
});

function fakeModule(native = true) {
  const stats = { fullQueries: 0, preparations: 0, reads: 0, freedSnapshots: 0, freedIndexes: 0, transferred: 0 };
  const module = {
    WasmTableIndex: class {
      private count = 0;
      addNumericColumn(values: Float64Array) { this.count = values.length; return 0; }
      addBooleanColumn(values: Uint8Array) { this.count = values.length; return 0; }
      addStringColumn(values: readonly unknown[]) { this.count = values.length; return 0; }
      free() { stats.freedIndexes++; }
      query() { stats.fullQueries++; return Uint32Array.from([this.count, ...Array.from({ length: this.count }, (_, i) => this.count - i - 1)]); }
      prepareQuery = native ? () => {
        stats.preparations++;
        // An owned result must not depend on the originating index's lifetime.
        const count = this.count;
        return {
          filteredRowCount: count,
          free() { stats.freedSnapshots++; },
          queryWindow(offset: number, limit: number) {
            stats.reads++; stats.transferred += limit;
            return Uint32Array.from([count, ...Array.from({ length: limit }, (_, i) => count - offset - i - 1)]);
          },
        };
      } : undefined;
    },
    WasmVariableLayout: class { free() {} },
    fixedVirtualRange() {},
  };
  return { module, stats };
}

describe("prepared Wasm bridge work ratchets", () => {
  it.each([1_000, 10_000, 100_000])("transfers only requested indices without another query at %i source rows", (size) => {
    const { module, stats } = fakeModule();
    const kernel = createTableWasmKernelFromModule(module);
    setTableQueryKernel(kernel);
    const data = Array.from({ length: size }, (_, id) => ({ id, value: id }));
    const session = createTableQuerySession({ rows: data, columns, sort });
    for (const offset of [0, size >> 1, size - 32, 10]) {
      const result = session.getWindow({ offset, limit: 32 });
      expect(result.rows.map((row) => row.id)).toEqual(Array.from({ length: 32 }, (_, i) => size - offset - i - 1));
      expect(result.filteredRowCount).toBe(size);
    }
    expect(stats).toMatchObject({ fullQueries: 0, preparations: 1, reads: 4, transferred: 128 });
    // Exercise schema eviction while a snapshot is still live.
    for (let i = 0; i < 5; i++) kernel.queryTable(data, [...columns], null, sort);
    expect(stats.freedIndexes).toBeGreaterThan(0);
    expect(session.getWindow({ offset: 100, limit: 1 }).rows[0]?.id).toBe(size - 101);
    session.dispose(); session.dispose();
    expect(stats.freedSnapshots).toBe(1);
  });

  it("keeps old generated modules compatible without repeated full transfers", () => {
    const { module, stats } = fakeModule(false);
    setTableQueryKernel(createTableWasmKernelFromModule(module));
    const session = createTableQuerySession({ rows, columns, sort });
    expect(session.getWindow({ offset: 10, limit: 2 }).rows.map((row) => row.id)).toEqual([989, 988]);
    expect(session.getWindow({ offset: 1000, limit: 20 }).rows).toEqual([]);
    expect(stats.fullQueries).toBe(1);
    session.dispose();
  });

  it("prepares identity and empty queries without allocating a native snapshot", () => {
    const { module, stats } = fakeModule();
    setTableQueryKernel(createTableWasmKernelFromModule(module));
    const session = createTableQuerySession({ rows, columns });
    for (const offset of [0, 998, 1000, Number.MAX_SAFE_INTEGER]) {
      for (const limit of [0, 3, Number.MAX_SAFE_INTEGER]) {
        expect(session.getWindow({ offset, limit }).rows).toEqual(rows.slice(offset, Math.min(rows.length, offset + limit)));
      }
    }
    const empty = createTableQuerySession({ rows, columns,
      filter: { columnFilters: [{ columnId: "missing", operator: "equals", value: 1 }] } });
    expect(empty.getWindow({ offset: 99, limit: 1 })).toMatchObject({ filteredRowCount: 0, rows: [], rowIndexOffset: 0 });
    expect(stats.preparations).toBe(0);
    expect(stats.fullQueries).toBe(0);
    session.dispose(); empty.dispose();
  });
});
