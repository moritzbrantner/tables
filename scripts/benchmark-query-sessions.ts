import { validateQueryReuseReport } from "../benchmarks/query-reuse-contract.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { createTableQuerySession, createTableWindowModel, type TableDataColumn, type TableModelOptions } from "../src/data";
import { setTableQueryKernel } from "../src/query-kernel";
import { createTableWasmKernelFromModule } from "../src/wasm-internal";

type Row = { id: number; name: string; value: number };
const columns: TableDataColumn<Row>[] = [
  { id: "id", accessor: "id", type: "number" },
  { id: "name", accessor: "name", type: "string" },
  { id: "value", accessor: "value", type: "number" },
];
const require = createRequire(import.meta.url);
const wasmPath = new URL("../.artifacts/tables-wasm-node-release/tables_wasm_bg.wasm", import.meta.url);
const kernel = createTableWasmKernelFromModule(require("../.artifacts/tables-wasm-node-release/tables_wasm.js"));
const sizes = [1000, 10000, 100000];
const sampleCount = 7;
const results = [];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
try {
  for (const backend of ["typescript", "wasm"] as const) {
    setTableQueryKernel(backend === "wasm" ? kernel : null);
    for (const size of sizes) {
      const rows = Array.from({ length: size }, (_, id) => ({ id, name: `Account ${id % 2000}`, value: (id * 7919) % 100000 }));
      for (const workload of ["identity", "sorted", "filtered-sorted", "empty"] as const) {
        const sorted = workload === "sorted" || workload === "filtered-sorted";
        const query = workload === "filtered-sorted" ? "account 1" : workload === "empty" ? "no-such-account" : "";
        const options: TableModelOptions<Row> = { rows, columns,
          filter: { query, queryColumnIds: ["name"] },
          sort: sorted ? [{ columnId: "value", direction: "desc" }] : [],
        };
        const expected = rows.filter((row) => row.name.toLowerCase().includes(query));
        if (sorted) expected.sort((a, b) => b.value - a.value || a.id - b.id);
        const offsets = [0, Math.floor(expected.length / 2), Math.max(0, expected.length - 100), 200, Math.floor(expected.length / 3)];
        const expectedPages = offsets.map((offset) => expected.slice(offset, offset + 100).map((row) => row.id));
        const samples = { preparation: [] as number[], sessionPages: [] as number[], oneOffPages: [] as number[] };
        let session = createTableQuerySession(options);
        try {
          for (let sample = -2; sample < sampleCount; sample++) {
            session.dispose();
            const start = performance.now();
            session = createTableQuerySession(options);
            const preparationMs = performance.now() - start;
            assert.equal(session.filteredRowCount, expected.length);
            const operations = {
              sessionPages: () => offsets.map((offset) => session.getWindow({ offset, limit: 100 })),
              oneOffPages: () => offsets.map((offset) => createTableWindowModel({ ...options, window: { offset, limit: 100 } })),
            };
            const order = sample % 2 === 0 ? ["sessionPages", "oneOffPages"] as const : ["oneOffPages", "sessionPages"] as const;
            for (const name of order) {
              const started = performance.now();
              const pages = operations[name]();
              const elapsed = performance.now() - started;
              pages.forEach((page, index) => {
                assert.equal(page.filteredRowCount, expected.length);
                assert.equal(page.rowIndexOffset, Math.min(offsets[index]!, expected.length));
                assert.deepEqual(page.rows.map((row) => row.id), expectedPages[index]);
              });
              if (sample >= 0) samples[name].push(elapsed);
            }
            if (sample >= 0) samples.preparation.push(preparationMs);
          }
        } finally { session.dispose(); }
        const preparationMedianMs = median(samples.preparation);
        const sessionPagesMedianMs = median(samples.sessionPages);
        const oneOffPagesMedianMs = median(samples.oneOffPages);
        const savedPerBatch = oneOffPagesMedianMs - sessionPagesMedianMs;
        const breakEvenPageReads = savedPerBatch > 0 ? Math.ceil(preparationMedianMs / (savedPerBatch / offsets.length)) : null;
        results.push({ backend, workload, size, offsets, limit: 100, preparationMedianMs,
          sessionPagesMedianMs, oneOffPagesMedianMs, breakEvenPageReads, samples,
          filteredRowCount: expected.length,
          orderedPageChecksums: expectedPages.map((page) => createHash("sha256").update(JSON.stringify(page)).digest("hex")),
        });
        console.log(`${backend}/${workload}/${size}: prepare=${preparationMedianMs.toFixed(3)}ms, ${offsets.length} pages=${sessionPagesMedianMs.toFixed(3)}ms vs ${oneOffPagesMedianMs.toFixed(3)}ms; break-even=${breakEvenPageReads} page reads`);
      }
    }
  }
} finally { setTableQueryKernel(null); }
assert.equal(results.length, 24);
for (const result of results) {
  for (const samples of Object.values(result.samples)) {
    assert.equal(samples.length, sampleCount);
    assert.ok(samples.every((value) => Number.isFinite(value) && value > 0));
  }
}
const report = {
  version: 1, suite: "table-query-sessions-v1", sourceSha: process.env.TABLES_SOURCE_SHA ?? null,
  checkoutSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  wasmSha256: createHash("sha256").update(await readFile(wasmPath)).digest("hex"),
  environment: { bun: process.versions.bun, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, cpuCount: cpus().length },
  methodology: { sizes, sampleCount, warmups: 2, pageReadsPerSample: 5,
    timing: "Preparation measured separately using an already-indexed immutable snapshot; page batches alternate with one-off window queries; all ordered IDs/counts verified outside timers",
    memory: "Prepared sessions retain full matching order (4 bytes per index in Wasm); identity retains no indices; compatibility retains full row references",
    breakEven: "Descriptive preparation / observed per-page savings; not a timing gate or universal crossover", },
  results,
};
await mkdir(".artifacts", { recursive: true });
validateQueryReuseReport(report);
await writeFile(".artifacts/table-query-sessions-benchmark.json", `${JSON.stringify(report, null, 2)}\n`);
