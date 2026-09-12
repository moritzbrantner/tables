import { cpus } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

import {
  applyTableFilter,
  applyTableSort,
  createDefaultTableState,
  createTableModel,
  updateTableState,
  type TableDataColumn,
} from "../src/data";

type BenchmarkRow = {
  id: number;
  name: string;
  region: string;
  stage: string;
  value: number;
};

type BenchmarkResult = {
  medianMs: number;
  samplesMs: number[];
  size: number;
  workload: string;
};

const sizes = [1_000, 10_000, 100_000] as const;
const sampleCount = 5;
const outputPath = getArgument("--output") ?? ".artifacts/table-query-benchmark.json";
const columns: TableDataColumn<BenchmarkRow>[] = [
  { accessor: "id", id: "id", type: "number" },
  { accessor: "name", id: "name", type: "string" },
  { accessor: "region", id: "region", type: "string" },
  { accessor: "stage", id: "stage", type: "string" },
  { accessor: "value", id: "value", type: "number" },
];

const results: BenchmarkResult[] = [];

for (const size of sizes) {
  const rows = createRows(size);
  results.push(
    measure(size, "global-filter", () =>
      applyTableFilter(rows, columns, { query: "account 17" }),
    ),
    measure(size, "structured-filter", () =>
      applyTableFilter(rows, columns, {
        columnFilters: [
          { columnId: "region", operator: "equals", value: "Europe" },
          { columnId: "value", operator: "gte", value: 50_000 },
        ],
      }),
    ),
    measure(size, "multi-column-sort", () =>
      applyTableSort(rows, columns, [
        { columnId: "region", direction: "asc" },
        { columnId: "stage", direction: "desc" },
        { columnId: "value", direction: "desc" },
      ]),
    ),
    measure(size, "model-query", () =>
      createTableModel({
        columns,
        filter: {
          columnFilters: [{ columnId: "stage", operator: "equals", value: "Proposal" }],
          query: "account",
        },
        rows,
        sort: [
          { columnId: "region", direction: "asc" },
          { columnId: "value", direction: "desc" },
        ],
      }),
    ),
    measure(size, "controlled-state-update", () => {
      const state = createDefaultTableState<BenchmarkRow>({
        sort: [{ columnId: "value", direction: "desc" }],
      });
      return updateTableState(state, {
        columnSizing: { name: 240, region: 160, stage: 140, value: 120 },
        columnVisibility: { id: false },
        filter: { query: "account 5" },
      });
    }),
  );
}

const cpu = cpus()[0];
const report = {
  environment: {
    arch: process.arch,
    bun: process.versions.bun ?? null,
    cpuCount: cpus().length,
    cpuModel: cpu?.model ?? null,
    platform: process.platform,
  },
  methodology: {
    sampleCount,
    sizes,
    timing: "median wall-clock duration after one warm-up invocation",
  },
  results,
  version: 1,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

function measure(size: number, workload: string, operation: () => unknown): BenchmarkResult {
  operation();
  const samplesMs = Array.from({ length: sampleCount }, () => {
    const start = performance.now();
    operation();
    return round(performance.now() - start);
  });
  const sorted = [...samplesMs].sort((left, right) => left - right);
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    samplesMs,
    size,
    workload,
  };
}

function createRows(size: number): BenchmarkRow[] {
  const regions = ["Europe", "North America", "Asia Pacific", "Latin America"];
  const stages = ["Discovery", "Proposal", "Review", "Closed"];
  return Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    name: `Account ${index % 2_000}`,
    region: regions[index % regions.length] ?? "Europe",
    stage: stages[(index * 7) % stages.length] ?? "Discovery",
    value: (index * 7_919) % 100_000,
  }));
}

function getArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
