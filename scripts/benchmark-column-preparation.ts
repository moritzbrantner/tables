import { validateQueryReuseReport } from "../benchmarks/query-reuse-contract.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { setImmediate as yieldToRuntime } from "node:timers/promises";
import { createTableWasmKernelFromModule } from "../src/wasm-internal";
import type { TableDataColumn } from "../src/data";

// Historical bridge bytes, not a hand-written approximation of the old code.
const baselineSha = "87d7f6c91df5668b9512c27be5a721b44c62cd8e";
const baselineBlob = "0b317d8400d71741ca94be1a0e242c932e10478d";
const baseline = execFileSync("git", ["show", `${baselineSha}:src/wasm-internal.ts`]);
assert.equal(createHash("sha1").update(`blob ${baseline.length}\0`).update(baseline).digest("hex"), baselineBlob);
const baselineFile = new URL(`../src/.benchmark-baseline-wasm-${process.pid}.ts`, import.meta.url);
const require = createRequire(import.meta.url);
const module = require("../.artifacts/tables-wasm-node-release/tables_wasm.js");
const sampleCount = 7;
const results = [];
const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[3]!;
await writeFile(baselineFile, baseline, { flag: "wx" });
try {
  const old = await import(baselineFile.href) as typeof import("../src/wasm-internal");
  const kernels = { baseline: old.createTableWasmKernelFromModule(module), candidate: createTableWasmKernelFromModule(module) };
  for (const size of [1000, 10000, 100000]) {
    for (const width of [3, 16]) {
      type Row = Record<string, string | number>;
      const columns: TableDataColumn<Row>[] = Array.from({ length: width }, (_, col) => ({
        id: `c${col}`, accessor: `c${col}`, type: col === 1 ? "string" : "number",
      }));
      const rows: Row[] = Array.from({ length: size }, (_, id) => Object.fromEntries(columns.map((col, i) => [col.id,
        i === 1 ? `Account ${id % 2000}` : (id * 7919 + i * 31) % 100000,
      ])));
      const expected = rows.flatMap((row, i) => String(row.c1).toLowerCase().includes("account 17") ? [i] : []);
      const samples = { baseline: [] as number[], candidate: [] as number[] };
      for (let sample = -2; sample < sampleCount; sample++) {
        const order = sample % 2 === 0 ? ["baseline", "candidate"] as const : ["candidate", "baseline"] as const;
        for (const provider of order) {
          await yieldToRuntime();
          // Finalizers can release preceding cold indexes before timing starts.
          (globalThis as typeof globalThis & { Bun?: { gc(force: boolean): void } }).Bun?.gc(true);
          const snapshot = rows.slice();
          const started = performance.now();
          const result = kernels[provider].queryTable(snapshot, columns, { query: "account 17" });
          const elapsed = performance.now() - started;
          assert.equal(result.filteredRowCount, expected.length);
          assert.deepEqual(result.sourceIndices, expected);
          if (sample >= 0) samples[provider].push(elapsed);
        }
      }
      for (const values of Object.values(samples)) assert.ok(values.length === sampleCount && values.every((v) => Number.isFinite(v) && v > 0));
      const baselineMedianMs = median(samples.baseline);
      const candidateMedianMs = median(samples.candidate);
      results.push({ size, width, baselineMedianMs, candidateMedianMs, ratio: candidateMedianMs / baselineMedianMs, samples,
        filteredRowCount: expected.length, checksum: createHash("sha256").update(JSON.stringify(expected)).digest("hex") });
      console.log(`cold ${size}x${width}: ${baselineMedianMs.toFixed(3)}ms -> ${candidateMedianMs.toFixed(3)}ms`);
    }
  }
} finally { await unlink(baselineFile); }
const report = {
  version: 1, suite: "table-cold-preparation-v1", baselineSha, baselineBlob,
  sourceSha: process.env.TABLES_SOURCE_SHA ?? null,
  checkoutSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  wasmSha256: createHash("sha256").update(await readFile(new URL("../.artifacts/tables-wasm-node-release/tables_wasm_bg.wasm", import.meta.url))).digest("hex"),
  environment: { bun: process.versions.bun, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, cpuCount: cpus().length },
  methodology: { sampleCount, warmups: 2,
    timing: "Historical and current bridge in the same process with identical release Wasm; fresh immutable array per invocation; includes all-column materialization, native indexing, filtering and result transfer",
    fixture: "Declared finite numeric columns and one ASCII string column; query account 17 searches all columns",
    exclusions: "Fixture creation and explicit GC/finalizer draining outside timers; complete ordered IDs checked after every invocation", },
  results,
};
await mkdir(".artifacts", { recursive: true });
validateQueryReuseReport(report);
await writeFile(".artifacts/table-cold-preparation-benchmark.json", `${JSON.stringify(report, null, 2)}\n`);
