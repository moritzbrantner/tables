import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

import {
  createTableModel,
  createTableQuerySession,
  createTableWindowModel,
  type TableDataColumn,
  type TableFilter,
  type TableSortState,
} from "./data";
import { setTableQueryKernel } from "./query-kernel";
import { getFixedVirtualRange, getVariableVirtualRange } from "./virtualization";
import {
  createTableWasmKernelFromModule,
  type TableWasmKernel,
} from "./wasm-internal";

const enabled = process.env.TABLES_WASM_PARITY === "1";

describe.runIf(enabled)("tables Wasm parity", () => {
  let kernel: TableWasmKernel;

  beforeAll(async () => {
    setTableQueryKernel(null);
    const moduleUrl = pathToFileURL(resolve(".artifacts/tables-wasm-node/tables_wasm.js")).href;
    kernel = createTableWasmKernelFromModule(await import(moduleUrl));
  });

  test("matches TypeScript fixed-range semantics across deterministic cases", () => {
    const cases = [
      { count: 1000, itemSize: 20, overscan: 2, scrollOffset: 100, viewportSize: 60 },
      { count: 1, itemSize: 1, overscan: 0, scrollOffset: -5, viewportSize: 1 },
      { count: 50, itemSize: 7, overscan: 4, scrollOffset: 349, viewportSize: 29 },
      { count: 50, itemSize: 7, overscan: 4, scrollOffset: Number.NaN, viewportSize: 29 },
      { count: 50, itemSize: 7, overscan: 4, scrollOffset: Number.POSITIVE_INFINITY, viewportSize: 29 },
      { count: 10, itemSize: Number.POSITIVE_INFINITY, scrollOffset: 0, viewportSize: 20 },
      { count: 10, itemSize: 20, scrollOffset: 0, viewportSize: Number.POSITIVE_INFINITY },
    ];

    for (const options of cases) {
      expect(kernel.fixedVirtualRange(options)).toEqual(getFixedVirtualRange(options));
    }
  });

  test("matches TypeScript variable-range semantics while reusing one Rust layout", () => {
    const itemSizes = [40, -10, Number.NaN, Number.POSITIVE_INFINITY, 60, 100, 80];
    const layout = kernel.createVariableLayout(itemSizes);

    expect(layout.backend).toBe("wasm");
    expect(layout.length).toBe(itemSizes.length);
    expect(layout.totalSize).toBe(280);

    for (const options of [
      { overscan: 0, scrollOffset: -20, viewportSize: 20 },
      { overscan: 1, scrollOffset: 70, viewportSize: 120 },
      { overscan: 3, scrollOffset: 200, viewportSize: 80 },
      { overscan: 1, scrollOffset: Number.NaN, viewportSize: 25 },
      { overscan: 1, scrollOffset: Number.POSITIVE_INFINITY, viewportSize: 25 },
      { overscan: 1, scrollOffset: 0, viewportSize: Number.POSITIVE_INFINITY },
    ]) {
      expect(layout.virtualRange(options)).toEqual(
        getVariableVirtualRange({ ...options, itemSizes }),
      );
    }

    layout.dispose();
    expect(() => layout.virtualRange({ scrollOffset: 0, viewportSize: 20 })).toThrow(
      "disposed",
    );
  });

  test("matches generated table geometries without object serialization", () => {
    let seed = 0x5eed1234;

    for (let scenario = 0; scenario < 40; scenario += 1) {
      const itemSizes = Array.from({ length: 128 + scenario }, (_, index) => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return index % 17 === 0 ? 0 : 1 + (seed % 73);
      });
      const layout = kernel.createVariableLayout(itemSizes);

      for (let query = 0; query < 20; query += 1) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const options = {
          overscan: query % 5,
          scrollOffset: seed % Math.max(1, Math.ceil(layout.totalSize + 200)),
          viewportSize: 1 + ((seed >>> 8) % 500),
        };

        expect(layout.virtualRange(options)).toEqual(
          getVariableVirtualRange({ ...options, itemSizes }),
        );
      }

      layout.dispose();
    }
  });

  test("matches direct Rust filtering, search, null, membership, and multi-sort semantics", () => {
    type Row = {
      active: boolean | null;
      id: string;
      name: string;
      region: string | null;
      score: number | null;
      tags: readonly string[];
    };

    const rows: Row[] = [
      { active: true, id: "a", name: "Alpha", region: "Berlin", score: 20, tags: ["core"] },
      { active: false, id: "b", name: "Beta", region: "Boston", score: 10, tags: ["edge"] },
      { active: true, id: "c", name: "Äpfel", region: "München", score: 20, tags: ["core", "eu"] },
      { active: null, id: "d", name: "Delta", region: null, score: null, tags: [] },
    ];
    const columns: TableDataColumn<Row>[] = [
      { accessor: "id", id: "id", type: "string" },
      { accessor: "name", id: "name", type: "string" },
      { accessor: "region", id: "region", type: "string" },
      { accessor: "score", id: "score", type: "number" },
      { accessor: "active", id: "active", type: "boolean" },
      { accessor: "tags", id: "tags", type: "json" },
    ];
    const scenarios: Array<{ filter: TableFilter<Row> | null; sort: TableSortState }> = [
      {
        filter: {
          columnFilters: [{ columnId: "active", operator: "equals", value: true }],
          query: "core",
        },
        sort: [{ columnId: "score", direction: "desc" }],
      },
      {
        filter: {
          columnFilters: [{ columnId: "region", operator: "in", value: ["Berlin", "München"] }],
          query: "ÄPFEL",
        },
        sort: [],
      },
      {
        filter: { columnFilters: [{ columnId: "score", operator: "isNull" }] },
        sort: [],
      },
      {
        filter: { columnFilters: [{ columnId: "active", operator: "in", value: [true, null] }] },
        sort: [],
      },
      {
        filter: { columnFilters: [{ columnId: "score", operator: "equals", value: null }] },
        sort: [],
      },
      {
        filter: { columnFilters: [{ columnId: "region", operator: "equals", value: null }] },
        sort: [],
      },
      {
        filter: null,
        sort: [
          { columnId: "score", direction: "asc" },
          { columnId: "region", direction: "asc" },
        ],
      },
    ];

    for (const scenario of scenarios) {
      setTableQueryKernel(null);
      const expected = createTableModel({ columns, filter: scenario.filter, rows, sort: scenario.sort });
      const expectedIndices = expected.rows.map((row) => rows.indexOf(row));
      const actual = kernel.queryTable(rows, columns, scenario.filter, scenario.sort);

      expect(actual.filteredRowCount).toBe(expected.filteredRowCount);
      expect(actual.sourceIndices).toEqual(expectedIndices);
    }
  });

  test("matches sortAccessor without moving callbacks into Rust", () => {
    const rows = [
      { id: "a", score: 10 },
      { id: "b", score: 30 },
      { id: "c", score: 20 },
    ];
    const columns: TableDataColumn<(typeof rows)[number]>[] = [
      { accessor: "id", id: "id", type: "string" },
      {
        accessor: "score",
        id: "score",
        sortAccessor: (row) => -row.score,
        type: "number",
      },
    ];
    const sort = [{ columnId: "score", direction: "asc" }] as const;

    setTableQueryKernel(null);
    const expected = createTableModel({ columns, rows, sort });
    const actual = kernel.queryTable(rows, columns, null, sort);

    expect(actual.sourceIndices).toEqual(expected.rows.map((row) => rows.indexOf(row)));
  });
  test("windowed public models preserve order/counts across sparse matches and extreme windows", () => {
    const rows = Array.from({ length: 513 }, (_, id) => ({ id, label: `Account ${id % 17}`, score: id % 13 === 0 ? null : (id * 7919) % 37 }));
    const columns: TableDataColumn<(typeof rows)[number]>[] = [
      { id: "id", accessor: "id", type: "number" },
      { id: "label", accessor: "label", type: "string" },
      { id: "score", accessor: "score", type: "number" },
    ];
    for (const query of ["", "account 1", "missing"]) {
      for (const direction of ["asc", "desc"] as const) {
        const options = { rows, columns, filter: { query, queryColumnIds: ["label"] }, sort: [{ columnId: "score", direction }] };
        setTableQueryKernel(null);
        const expected = createTableModel(options);
        setTableQueryKernel(kernel);
        for (const offset of [0, 1, 100, 450, 500, 513, Number.MAX_SAFE_INTEGER]) {
          for (const limit of [0, 1, 32, 100, Number.MAX_SAFE_INTEGER]) {
            const page = createTableWindowModel({ ...options, window: { offset, limit } });
            expect(page.rows).toEqual(expected.rows.slice(offset, offset + Math.min(limit, expected.rows.length)));
            expect(page.filteredRowCount).toBe(expected.filteredRowCount);
            expect(page.sortedRowCount).toBe(expected.sortedRowCount);
            expect(page.rowIndexOffset).toBe(Math.min(offset, expected.filteredRowCount));
          }
        }
      }
    }
    setTableQueryKernel(null);
  });

  test("native prepared sessions match one-off windows and survive index eviction", () => {
    const rows = Array.from({ length: 1025 }, (_, id) => ({ id, label: `Account ${id % 19}`, score: id % 13 === 0 ? null : (id * 7919) % 47 }));
    const columns: TableDataColumn<(typeof rows)[number]>[] = [
      { id: "id", accessor: "id", type: "number" },
      { id: "label", accessor: "label", type: "string" },
      { id: "score", accessor: "score", type: "number" },
    ];
    setTableQueryKernel(kernel);
    try {
      for (const query of ["", "account 1", "missing"]) {
        for (const direction of ["asc", "desc"] as const) {
          const options = { rows, columns, filter: { query, queryColumnIds: ["label"] }, sort: [{ columnId: "score", direction }] };
          const full = createTableModel(options);
          const session = createTableQuerySession(options);
          // Free the originating prepared column index via its bounded schema cache.
          for (let schema = 0; schema < 5; schema++) kernel.queryTable(rows, [...columns], options.filter, options.sort);
          for (const offset of [0, 1, 200, 500, 1000, Number.MAX_SAFE_INTEGER]) {
            for (const limit of [0, 1, 32, Number.MAX_SAFE_INTEGER]) {
              const page = session.getWindow({ offset, limit });
              expect(page.rows).toEqual(full.rows.slice(offset, Math.min(full.rows.length, offset + limit)));
              expect(page.filteredRowCount).toBe(full.filteredRowCount);
              expect(page.rowIndexOffset).toBe(Math.min(offset, full.filteredRowCount));
            }
          }
          session.dispose(); session.dispose();
          expect(() => session.getWindow({ offset: 0, limit: 1 })).toThrow("disposed");
        }
      }
    } finally { setTableQueryKernel(null); }
  });

});
