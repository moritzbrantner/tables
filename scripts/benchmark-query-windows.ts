import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { createTableModel, createTableWindowModel, type TableDataColumn } from "../src/data";
import { setTableQueryKernel } from "../src/query-kernel";
import { createTableWasmKernelFromModule } from "../src/wasm-internal";

const require = createRequire(import.meta.url);
const kernel = createTableWasmKernelFromModule(require("../.artifacts/tables-wasm-node-release/tables_wasm.js"));
type Row = { id: number; name: string; value: number };
const columns: TableDataColumn<Row>[] = [
  { id: "id", accessor: "id", type: "number" },
  { id: "name", accessor: "name", type: "string" },
  { id: "value", accessor: "value", type: "number" },
];
const results = [];
setTableQueryKernel(kernel);
try {
  for (const size of [1000, 10000, 100000]) {
    const rows = Array.from({ length: size }, (_, id) => ({ id, name: `Account ${id % 2000}`, value: (id * 7919) % 100000 }));
    for (const offset of [0, 200, size - 100]) {
      const options = { rows, columns, sort: [{ columnId: "value", direction: "desc" as const }] };
      const expected = [...rows].sort((left, right) => right.value - left.value || left.id - right.id).slice(offset, offset + 100);
      const operations = {
        window: () => createTableWindowModel({ ...options, window: { offset, limit: 100 } }),
        fullThenSlice: () => {
          const model = createTableModel(options);
          return { ...model, rows: model.rows.slice(offset, offset + 100) };
        },
      };
      const samples: Record<keyof typeof operations, number[]> = { window: [], fullThenSlice: [] };
      for (let sample = -2; sample < 7; sample++) {
        const order = sample % 2 === 0 ? ["window", "fullThenSlice"] as const : ["fullThenSlice", "window"] as const;
        for (const name of order) {
          const started = performance.now();
          const actual = operations[name]();
          const elapsed = performance.now() - started;
          assert.equal(actual.filteredRowCount, size);
          assert.deepEqual(actual.rows.map((row) => row.id), expected.map((row) => row.id));
          if (sample >= 0) samples[name].push(elapsed);
        }
      }
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[3]!;
      results.push({ size, offset, limit: 100, windowMedianMs: median(samples.window), fullMedianMs: median(samples.fullThenSlice), samples,
        returnedRowCount: expected.length, checksum: expected.reduce((sum, row, i) => sum + row.id * (i + 1), 0) });
    }
  }
} finally { setTableQueryKernel(null); }
const report = { version: 1, suite: "table-window-query-v1", environment: { bun: process.versions.bun, arch: process.arch, platform: process.platform, cpu: cpus()[0]?.model },
  methodology: "same prepared immutable snapshot; two warm-ups; seven alternating samples; public window model versus full model then slice; ordered IDs verified outside timers", results };
await mkdir(".artifacts", { recursive: true });
await writeFile(".artifacts/table-window-query-benchmark.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
