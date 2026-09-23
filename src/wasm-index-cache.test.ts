import { describe, expect, test } from "vitest";

import type { TableDataColumn } from "./data";
import { createTableWasmKernelFromModule } from "./wasm-internal";

type Row = {
  id: number;
  name: string;
  region: string;
  stage: string;
  value: number;
};

type FakeStats = {
  booleanColumns: number;
  created: number;
  freed: number;
  numericColumns: number;
  queries: number;
  stringColumns: number;
};

describe("Wasm table index reuse", () => {
  test("materializes only queried columns and reuses them for one immutable row snapshot", () => {
    const stats = createStats();
    const kernel = createTableWasmKernelFromModule(createFakeModule(stats));
    const rows = createRows();
    const columns = createColumns();
    const filter = {
      columnFilters: [
        { caseSensitive: true, columnId: "stage", operator: "equals" as const, value: "Proposal" },
      ],
      query: "account",
      queryColumnIds: ["name"],
    };
    const sort = [
      { columnId: "region", direction: "asc" as const },
      { columnId: "value", direction: "desc" as const },
    ];

    kernel.queryTable(rows, columns, filter, sort);
    kernel.queryTable(rows, columns, filter, sort);

    expect(stats.created).toBe(1);
    expect(stats.queries).toBe(2);
    expect(stats.stringColumns).toBe(3);
    expect(stats.numericColumns).toBe(1);
    expect(stats.booleanColumns).toBe(0);
  });

  test("builds a fresh prepared index for a replacement row snapshot", () => {
    const stats = createStats();
    const kernel = createTableWasmKernelFromModule(createFakeModule(stats));
    const columns = createColumns();
    const filter = { query: "account", queryColumnIds: ["name"] };

    kernel.queryTable(createRows(), columns, filter, []);
    kernel.queryTable(createRows(), columns, filter, []);

    expect(stats.created).toBe(2);
    expect(stats.stringColumns).toBe(2);
  });

  test("bounds cached schema variants and explicitly frees evicted indexes", () => {
    const stats = createStats();
    const kernel = createTableWasmKernelFromModule(createFakeModule(stats));
    const rows = createRows();

    for (let index = 0; index < 5; index += 1) {
      kernel.queryTable(rows, createColumns(), null, [{ columnId: "value", direction: "desc" }]);
    }

    expect(stats.created).toBe(5);
    expect(stats.freed).toBe(1);
  });

  test("skips Wasm materialization for an identity query", () => {
    const stats = createStats();
    const kernel = createTableWasmKernelFromModule(createFakeModule(stats));
    const rows = createRows();

    expect(kernel.queryTable(rows, createColumns(), null, [])).toEqual({
      filteredRowCount: rows.length,
      sourceIndices: [0, 1, 2],
    });
    expect(stats.created).toBe(0);
  });
});

function createRows(): Row[] {
  return [
    { id: 1, name: "Account 1", region: "Europe", stage: "Proposal", value: 30 },
    { id: 2, name: "Account 2", region: "Asia Pacific", stage: "Review", value: 20 },
    { id: 3, name: "Account 3", region: "Europe", stage: "Proposal", value: 10 },
  ];
}

function createColumns(): TableDataColumn<Row>[] {
  return [
    { accessor: "id", id: "id", type: "number" },
    { accessor: "name", id: "name", type: "string" },
    { accessor: "region", id: "region", type: "string" },
    { accessor: "stage", id: "stage", type: "string" },
    { accessor: "value", id: "value", type: "number" },
  ];
}

function createStats(): FakeStats {
  return {
    booleanColumns: 0,
    created: 0,
    freed: 0,
    numericColumns: 0,
    queries: 0,
    stringColumns: 0,
  };
}

function createFakeModule(stats: FakeStats) {
  return {
    WasmTableIndex: class {
      private rowCount = 0;

      constructor() {
        stats.created += 1;
      }

      addBooleanColumn(values: Uint8Array) {
        stats.booleanColumns += 1;
        this.rowCount = values.length;
        return stats.booleanColumns + stats.numericColumns + stats.stringColumns - 1;
      }

      addNumericColumn(values: Float64Array) {
        stats.numericColumns += 1;
        this.rowCount = values.length;
        return stats.booleanColumns + stats.numericColumns + stats.stringColumns - 1;
      }

      addStringColumn(values: readonly (string | null)[]) {
        stats.stringColumns += 1;
        this.rowCount = values.length;
        return stats.booleanColumns + stats.numericColumns + stats.stringColumns - 1;
      }

      free() {
        stats.freed += 1;
      }

      query() {
        stats.queries += 1;
        return Uint32Array.from([
          this.rowCount,
          ...Array.from({ length: this.rowCount }, (_, index) => index),
        ]);
      }
    },
    WasmVariableLayout: class {
      readonly length = 0;
      readonly totalSize = 0;
      free() {}
      virtualRange() {
        return Float64Array.of(0, 0, 0, 0, 0, 0);
      }
    },
    fixedVirtualRange() {
      return Float64Array.of(0, 0, 0, 0, 0, 0);
    },
  };
}
