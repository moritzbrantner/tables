import { afterEach, describe, expect, it, vi } from "vitest";
import { createTableModel, createTableWindowModel, type TableDataColumn } from "./data";
import { setTableQueryKernel } from "./query-kernel";
import { createTableWasmKernelFromModule } from "./wasm-internal";

const rows = Array.from({ length: 100 }, (_, id) => ({ id, value: (id * 17) % 31, name: `Account ${id}` }));
const columns: TableDataColumn<(typeof rows)[number]>[] = [
  { id: "id", accessor: "id", type: "number" },
  { id: "value", accessor: "value", type: "number" },
  { id: "name", accessor: "name", type: "string" },
];
afterEach(() => setTableQueryKernel(null));

describe("windowed model", () => {
  it("keeps exact full counts with only a result window", () => {
    const query = { rows, columns, filter: { query: "account 1" }, sort: [{ columnId: "value", direction: "desc" as const }] };
    const full = createTableModel(query);
    const window = createTableWindowModel({ ...query, window: { offset: 3, limit: 4 } });
    expect(window.rows).toEqual(full.rows.slice(3, 7));
    expect(window.filteredRowCount).toBe(full.filteredRowCount);
    expect(window.sortedRowCount).toBe(full.sortedRowCount);
    expect(window.totalRowCount).toBe(100);
    expect(window.rowIndexOffset).toBe(3);
    expect(createTableModel(query)).toEqual(full);
  });

  it("uses a kernel's window operation rather than fetching a full result", () => {
    const full = vi.fn(() => { throw new Error("Full materialization is forbidden"); });
    const window = vi.fn(() => ({ filteredRowCount: 100, sourceIndices: [20, 21] }));
    setTableQueryKernel({ queryTable: full, queryTableWindow: window });
    const result = createTableWindowModel({ rows, columns, window: { offset: 20, limit: 2 } });
    expect(result.rows).toEqual(rows.slice(20, 22));
    expect(window).toHaveBeenCalledWith(rows, columns, { offset: 20, limit: 2 }, undefined, undefined);
    expect(full).not.toHaveBeenCalled();
  });

  it("preserves callback and explicit locale fallback semantics", () => {
    const window = vi.fn(() => { throw new Error("Unsupported semantics reached Wasm"); });
    setTableQueryKernel({ queryTable: () => ({ filteredRowCount: 100, sourceIndices: rows.map((r) => r.id) }), queryTableWindow: window });
    for (const locale of ["tr", "de"]) {
      const query = { rows, columns, locale, filter: { query: "account", predicate: (row: typeof rows[number]) => row.id % 2 === 0 } };
      const full = createTableModel(query);
      expect(createTableWindowModel({ ...query, window: { offset: 7, limit: 9 } }).rows).toEqual(full.rows.slice(7, 16));
    }
    expect(window).not.toHaveBeenCalled();
  });

  it("handles count-only, out-of-range and maximum safe windows", () => {
    for (const offset of [0, 30, 100, Number.MAX_SAFE_INTEGER]) {
      for (const limit of [0, 1, Number.MAX_SAFE_INTEGER]) {
        const result = createTableWindowModel({ rows, columns, window: { offset, limit } });
        expect(result.rows).toEqual(rows.slice(offset, Math.min(rows.length, offset + limit)));
        expect(result.filteredRowCount).toBe(rows.length);
        expect(result.rowIndexOffset).toBe(Math.min(offset, rows.length));
      }
    }
  });

  it("rejects invalid windows before invoking a kernel", () => {
    const query = vi.fn();
    setTableQueryKernel({ queryTable: query, queryTableWindow: query });
    for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      for (const window of [{ offset: value, limit: 2 }, { offset: 0, limit: value }]) {
        expect(() => createTableWindowModel({ rows, columns, window })).toThrow(RangeError);
      }
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("passes window bounds through the real bridge and bypasses identity materialization", () => {
    const calls: Array<{ rowOffset: number; rowLimit: number }> = [];
    let created = 0;
    const kernel = createTableWasmKernelFromModule({
      WasmTableIndex: class {
        constructor() { created++; }
        addNumericColumn() { return 0; }
        addBooleanColumn() { return 0; }
        addStringColumn() { return 0; }
        free() {}
        query(query: { rowOffset: number; rowLimit: number }) {
          calls.push(query);
          return new Uint32Array([rows.length, ...rows.slice(query.rowOffset, query.rowOffset + query.rowLimit).map((row) => row.id)]);
        }
      },
      WasmVariableLayout: class {
        constructor() { throw new Error("Query tests must not construct a variable layout"); }
      },
      fixedVirtualRange() {},
    });
    setTableQueryKernel(kernel);
    expect(createTableWindowModel({ rows, columns, window: { offset: 30, limit: 2 } }).rows).toEqual(rows.slice(30, 32));
    expect(created).toBe(0);
    createTableWindowModel({ rows, columns, filter: { query: "account" }, window: { offset: 30, limit: 2 } });
    expect(calls[0]).toMatchObject({ rowOffset: 30, rowLimit: 2 });
    createTableWindowModel({ rows, columns, filter: { query: "account" }, window: { offset: Number.MAX_SAFE_INTEGER, limit: Number.MAX_SAFE_INTEGER } });
    expect(calls[1]).toMatchObject({ rowOffset: rows.length, rowLimit: rows.length });
    expect(created).toBe(1);
  });
});
