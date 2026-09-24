import { describe, expect, it, vi } from "vitest";
import type { TableColumnType, TableDataColumn } from "./data";
import { createTableWasmKernelFromModule } from "./wasm-internal";

type ColumnCapture = { type: string; values: unknown[]; validity?: number[] };
function captureModule() {
  const captures: ColumnCapture[] = [];
  return { captures, module: {
    WasmTableIndex: class {
      private count = 0;
      addNumericColumn(values: Float64Array, validity: Uint8Array) {
        this.count = values.length;
        captures.push({ type: "numeric", values: [...values], validity: [...validity] });
        return captures.length - 1;
      }
      addBooleanColumn(values: Uint8Array, validity: Uint8Array) {
        this.count = values.length;
        captures.push({ type: "boolean", values: [...values], validity: [...validity] });
        return captures.length - 1;
      }
      addStringColumn(values: readonly unknown[]) {
        this.count = values.length;
        captures.push({ type: "string", values: Array.from(values) });
        return captures.length - 1;
      }
      free() {}
      query() { return Uint32Array.from([this.count, ...Array.from({ length: this.count }, (_, i) => i)]); }
    },
    WasmVariableLayout: class { free() {} }, fixedVirtualRange() {},
  } };
}

describe("declared-column materialization", () => {
  it.each<TableColumnType>(["number", "date", "boolean"])("avoids an intermediate row-value array for %s columns", (type) => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      value: type === "date" ? new Date(i) : type === "boolean" ? i % 2 === 0 : i,
    }));
    const accessor = vi.fn((row: (typeof rows)[number]) => row.value);
    const map = vi.spyOn(rows, "map");
    const { module, captures } = captureModule();
    const kernel = createTableWasmKernelFromModule(module);
    const columns: TableDataColumn<(typeof rows)[number]>[] = [{ id: "value", accessor, type }];
    kernel.queryTable(rows, columns, null, [{ columnId: "value", direction: "asc" }]);
    expect(map).not.toHaveBeenCalled();
    expect(accessor).toHaveBeenCalledTimes(rows.length);
    kernel.queryTable(rows, columns, null, [{ columnId: "value", direction: "desc" }]);
    expect(accessor).toHaveBeenCalledTimes(rows.length);
    expect(captures).toHaveLength(1);
    map.mockRestore();
  });

  it.each<TableColumnType>(["number", "date", "boolean"])("preserves raw %s ABI values, validity, holes and source accessor indices", (type) => {
    const values: unknown[] = [undefined, null, 0, -0, NaN, Infinity, -Infinity, 17.5, true, false, "17", new Date(23), new Date(NaN)];
    const rows = values.map((value) => ({ value }));
    delete rows[3];
    const visited: number[] = [];
    const { module, captures } = captureModule();
    const kernel = createTableWasmKernelFromModule(module);
    const accessor = (row: (typeof rows)[number], i: number) => { visited.push(i); return row.value; };
    kernel.queryTable(rows, [{ id: "value", accessor, type }], null, [{ columnId: "value", direction: "asc" }]);
    const mapped = rows.map((row) => row.value);
    const expectedValues = type === "boolean"
      ? Array.from(mapped, (value) => value === true ? 1 : 0)
      : Array.from(mapped, (value) => type === "date" ? value instanceof Date ? value.getTime() : NaN : typeof value === "number" ? value : NaN);
    const expectedValidity = Array.from(mapped, (value) => type === "boolean" ? Number(typeof value === "boolean")
      : Number(type === "date" ? value instanceof Date && Number.isFinite(value.getTime()) : typeof value === "number" && Number.isFinite(value)));
    expect(captures[0]?.values).toEqual(expectedValues);
    expect(captures[0]?.validity).toEqual(expectedValidity);
    expect(visited).toEqual(values.map((_, i) => i).filter((i) => i !== 3));
  });

  it("keeps first-non-null inference and sort-accessor output typing independent of display typing", () => {
    const rows = [{ value: null }, { value: "23" }, { value: 12 }];
    const accessor = vi.fn((row: (typeof rows)[number]) => row.value);
    const { module, captures } = captureModule();
    const kernel = createTableWasmKernelFromModule(module);
    const columns: TableDataColumn<(typeof rows)[number]>[] = [{ id: "value", accessor }];
    kernel.queryTable(rows, columns, { query: "23" });
    expect(captures[0]).toEqual({ type: "string", values: [null, "23", "12"] });
    expect(accessor).toHaveBeenCalledTimes(3);
    kernel.queryTable(rows, [{ ...columns[0]!, type: "string", sortAccessor: (row) => Number(row.value) }], null, [{ columnId: "value", direction: "desc" }]);
    expect(captures[1]).toEqual({ type: "numeric", values: [0, 23, 12], validity: [1, 1, 1] });
  });
});
