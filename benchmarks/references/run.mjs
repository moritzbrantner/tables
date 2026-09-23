import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setImmediate as yieldToRuntime } from "node:timers/promises";

import { createTableModel } from "../../src/data.ts";
import { setTableQueryKernel } from "../../src/query-kernel.ts";
import { createTableWasmKernelFromModule } from "../../src/wasm-internal.ts";

const require = createRequire(import.meta.url);
const { createTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel } =
  require("@tanstack/table-core");
const referenceVersion = require("@tanstack/table-core/package.json").version;
const pinnedVersion = require("./package.json").dependencies["@tanstack/table-core"];
assert.equal(referenceVersion, pinnedVersion, "Reference version must match the exact pin");
const sampleCount = 7;
const sizes = [1_000, 10_000, 100_000];
const output = argument("--output") ?? ".artifacts/table-reference-benchmark.json";
const ratioArgument = argument("--max-ratio");
const maxRatio = ratioArgument === undefined ? null : Number(ratioArgument);
if (maxRatio !== null && (!Number.isFinite(maxRatio) || maxRatio <= 0)) {
  throw new Error("--max-ratio requires a positive finite number");
}
const useWasm = process.argv.includes("--wasm");
const wasmPath = "../../.artifacts/tables-wasm-node-release/tables_wasm.js";
const wasm = useWasm ? createTableWasmKernelFromModule(require(wasmPath)) : null;
const wasmSha256 = useWasm ? createHash("sha256").update(
  await readFile(new URL(wasmPath.replace(/\.js$/, "_bg.wasm"), import.meta.url)),
).digest("hex") : null;
const providers = ["tables-typescript", ...(useWasm ? ["tables-wasm"] : []), "tanstack"];
const fields = ["id", "name", "bucket", "value"];
const columns = fields.map((id) => ({ id, accessor: id, type: id === "name" ? "string" : "number" }));
const referenceColumns = fields.map((id) => ({
  id, accessorKey: id, sortingFn: "basic",
  filterFn: (row, columnId, minimum) => row.getValue(columnId) >= minimum,
}));
const state = (globalFilter = "", columnFilters = [], sorting = []) => ({
  globalFilter, columnFilters, sorting,
});
const scenarios = [
  { name: "global-text", states: [state("account 17"), state("account 18")] },
  { name: "global-numeric", states: [state("17"), state("29")] },
  { name: "multi-sort", states: [
    state("", [], [{ id: "bucket", desc: false }, { id: "value", desc: true }]),
    state("", [], [{ id: "bucket", desc: true }, { id: "value", desc: false }]),
  ] },
  { name: "combined-query", states: [
    state("account", [{ id: "bucket", value: 2 }], [{ id: "value", desc: true }]),
    state("account", [{ id: "bucket", value: 3 }], [{ id: "value", desc: false }]),
  ] },
];
const results = [];

try {
  for (const size of sizes) {
    const rows = Array.from({ length: size }, (_, id) => ({
      id, name: `Account ${id % 2_000}`, bucket: Math.floor(id / 7) % 5,
      value: (id * 7_919) % 100_000,
    }));
    for (const scenario of scenarios) {
      const expected = scenario.states.map((query) => oracle(rows, query));
      const checksums = expected.map((ordered) => createHash("sha256")
        .update(JSON.stringify(ordered.map((row) => row.id))).digest("hex"));
      const options = scenario.states.map((query) => ({
        columns,
        filter: {
          query: query.globalFilter,
          columnFilters: query.columnFilters.map(({ id, value }) => ({
            columnId: id, operator: "gte", value,
          })),
        },
        sort: query.sorting.map(({ id, desc }) => ({ columnId: id, direction: desc ? "desc" : "asc" })),
      }));
      for (const phase of ["cold-snapshot", "changed-query"]) {
        const table = phase === "changed-query" ? referenceTable(rows, scenario.states[1]) : null;
        const samples = Object.fromEntries(providers.map((provider) => [provider, []]));
        const run = async (provider, variant) => {
          // Snapshot creation and explicit GC are outside the timed operation.
          // A fresh array is sufficient: row objects are immutable in all providers.
          // Drain row-model registration/cleanup microtasks before collecting.
          await yieldToRuntime();
          globalThis.Bun?.gc(true);
          const data = phase === "cold-snapshot" ? rows.slice() : rows;
          const started = performance.now();
          let actual;
          if (provider === "tanstack") {
            const instance = table ?? referenceTable(data, scenario.states[variant]);
            if (table) instance.setOptions((previous) => ({ ...previous, state: scenario.states[variant] }));
            actual = instance.getRowModel().rows;
          } else {
            setTableQueryKernel(provider === "tables-wasm" ? wasm : null);
            actual = createTableModel({ ...options[variant], rows: data }).rows;
          }
          const elapsed = performance.now() - started;
          // Validate full order after stopping the timer, not just row counts.
          assert.equal(actual.length, expected[variant].length, `${provider}: result count`);
          for (let index = 0; index < actual.length; index++) {
            const row = provider === "tanstack" ? actual[index].original : actual[index];
            assert.equal(row.id, expected[variant][index].id, `${provider}: ordered result at ${index}`);
          }
          assert.ok(Number.isFinite(elapsed) && elapsed > 0, "Timing must be finite and positive");
          return elapsed;
        };
        // Exercise both query states before measuring. Changed queries alternate
        // their values and references, so memoized no-ops cannot masquerade as work.
        for (const provider of providers) {
          await run(provider, 0);
          await run(provider, 1);
        }
        for (let sample = 0; sample < sampleCount; sample++) {
          const order = providers.slice(sample % providers.length)
            .concat(providers.slice(0, sample % providers.length));
          for (const provider of order) samples[provider].push(await run(provider, sample % 2));
        }
        const referenceMedianMs = median(samples.tanstack);
        for (const provider of providers) {
          const medianMs = median(samples[provider]);
          const ratio = medianMs / referenceMedianMs;
          results.push({
            provider, phase, workload: scenario.name, size, medianMs,
            samplesMs: samples[provider], referenceMedianMs, ratio,
            variantRowCounts: expected.map((ordered) => ordered.length), variantChecksums: checksums,
          });
          console.log(`${phase}/${scenario.name}/${size} ${provider}: ${medianMs.toFixed(3)} ms (${ratio.toFixed(3)}x TanStack)`);
        }
      }
    }
  }
} finally {
  setTableQueryKernel(null);
}

const violations = maxRatio === null ? [] : results.filter(
  (result) => result.provider !== "tanstack" && result.ratio > maxRatio,
);
const report = {
  version: 1, suite: "table-reference-query-v1", createdAt: new Date().toISOString(),
  checkoutSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceSha: process.env.TABLES_SOURCE_SHA ?? null,
  environment: {
    bun: process.versions.bun, node: process.versions.node,
    platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, cpuCount: cpus().length,
  },
  reference: { package: "@tanstack/table-core", version: referenceVersion },
  wasmSha256,
  methodology: {
    sampleCount, sizes, warmupInvocations: 2, providerOrder: "rotating",
    fixture: "finite numeric and ASCII string columns; deterministic independent bucket/value distribution",
    correctness: "all ordered row IDs against an independent oracle after every invocation",
    cold: "fresh immutable row-array identity; query/index/row-model construction timed, fixture creation excluded",
    changed: "same immutable snapshot, alternating query states; no unchanged-query cache hits",
    timing: "native provider result construction; result validation and explicit GC outside timers",
    scope: "headless query APIs, not DOM rendering; TanStack also builds richer row-model metadata",
  },
  ratchet: { enabled: maxRatio !== null, maxRatio, passed: violations.length === 0 },
  results,
};
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
if (violations.length > 0) {
  throw new Error(`${violations.length} query cases exceeded --max-ratio ${maxRatio}; see ${output}`);
}

function referenceTable(data, query) {
  return createTable({
    data, columns: referenceColumns, state: query, onStateChange: () => {}, renderFallbackValue: null,
    autoResetAll: false, getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(), getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row, id, needle) => String(row.getValue(id)).toLowerCase().includes(needle),
  });
}

function oracle(rows, query) {
  const filtered = rows.filter((row) => query.columnFilters.every(({ id, value }) => row[id] >= value)
    && (!query.globalFilter || fields.some((id) => String(row[id]).toLowerCase().includes(query.globalFilter))));
  if (query.sorting.length > 0) filtered.sort((left, right) => {
    for (const { id, desc } of query.sorting) {
      const comparison = left[id] - right[id];
      if (comparison !== 0) return desc ? -comparison : comparison;
    }
    return left.id - right.id;
  });
  return filtered;
}

function median(samples) {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
