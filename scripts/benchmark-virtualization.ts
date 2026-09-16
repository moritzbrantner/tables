import { mkdir, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { TableDataColumn, TableFilter, TableSortState } from "../src/data";
import {
  createVariableVirtualLayout,
  getFixedVirtualRange,
  getVariableVirtualRange,
} from "../src/virtualization";
import { createTableWasmKernelFromModule } from "../src/wasm-internal";

type Measurement = {
  checksum: number;
  iterationsPerSample: number;
  label: string;
  maxNsPerOperation: number;
  medianNsPerOperation: number;
  minNsPerOperation: number;
  sampleCount: number;
  samplesNsPerOperation: number[];
};

type QueryRow = {
  id: number;
  name: string;
  region: string;
  stage: string;
  value: number;
};

const sampleCount = 7;
const itemCount = 100_000;
const queryRowCount = 50_000;
const itemSizes = Array.from(
  { length: itemCount },
  (_, index) => 20 + ((index * 17) % 41),
);
const moduleUrl = pathToFileURL(
  resolve(".artifacts/tables-wasm-node-release/tables_wasm.js"),
).href;
const wasmKernel = createTableWasmKernelFromModule(await import(moduleUrl));
const typescriptLayout = createVariableVirtualLayout(itemSizes);
const wasmLayout = wasmKernel.createVariableLayout(itemSizes);
const queryRows = createQueryRows(queryRowCount);
const queryColumns: TableDataColumn<QueryRow>[] = [
  { accessor: "id", id: "id", type: "number" },
  { accessor: "name", id: "name", type: "string" },
  { accessor: "region", id: "region", type: "string" },
  { accessor: "stage", id: "stage", type: "string" },
  { accessor: "value", id: "value", type: "number" },
];
const queryFilter: TableFilter<QueryRow> = {
  columnFilters: [
    { caseSensitive: true, columnId: "stage", operator: "equals", value: "Proposal" },
  ],
  query: "account",
  queryColumnIds: ["name"],
};
const querySort: TableSortState = [
  { columnId: "region", direction: "asc" },
  { columnId: "value", direction: "desc" },
];

const variableOptions = (iteration: number) => ({
  overscan: 3,
  scrollOffset: ((iteration * 53) % Math.max(1, Math.floor(typescriptLayout.totalSize))) as number,
  viewportSize: 900,
});

const fixedOptions = (iteration: number) => ({
  count: 1_000_000,
  itemSize: 32,
  overscan: 4,
  scrollOffset: (iteration * 97) % 31_000_000,
  viewportSize: 768,
});

assertQueryParity();

const measurements = [
  measure("fixed-typescript", 500_000, 10_000, (iteration) =>
    getFixedVirtualRange(fixedOptions(iteration)).startIndex,
  ),
  measure("fixed-wasm", 200_000, 5_000, (iteration) =>
    wasmKernel.fixedVirtualRange(fixedOptions(iteration)).startIndex,
  ),
  measure("variable-one-shot-typescript-100k", 100, 10, (iteration) =>
    getVariableVirtualRange({ ...variableOptions(iteration), itemSizes }).startIndex,
  ),
  measure("variable-cached-typescript-100k", 300_000, 10_000, (iteration) =>
    typescriptLayout.virtualRange(variableOptions(iteration)).startIndex,
  ),
  measure("variable-cached-wasm-100k", 100_000, 5_000, (iteration) =>
    wasmLayout.virtualRange(variableOptions(iteration)).startIndex,
  ),
  measure("layout-build-typescript-100k", 100, 10, () =>
    createVariableVirtualLayout(itemSizes).totalSize,
  ),
  measure("layout-build-wasm-100k", 100, 10, () => {
    const layout = wasmKernel.createVariableLayout(itemSizes);
    const totalSize = layout.totalSize;
    layout.dispose();
    return totalSize;
  }),
  measure("query-repeated-wasm-50k", 30, 3, () =>
    wasmKernel.queryTable(queryRows, queryColumns, queryFilter, querySort).sourceIndices.length,
  ),
  measure("query-reference-js-50k", 30, 3, () => referenceQuery(queryRows).length),
  measure("query-cold-materialization-wasm-50k", 2, 1, () => {
    const freshColumns = queryColumns.map((column) => ({ ...column }));
    return wasmKernel.queryTable(queryRows, freshColumns, queryFilter, querySort).sourceIndices.length;
  }),
];

const byLabel = new Map(measurements.map((measurement) => [measurement.label, measurement]));
const ratio = (numerator: string, denominator: string) =>
  readMeasurement(numerator).medianNsPerOperation /
  readMeasurement(denominator).medianNsPerOperation;

const evidence = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  runtime: {
    arch: arch(),
    bun: Bun.version,
    platform: platform(),
  },
  workload: {
    fixedCount: 1_000_000,
    queryRowCount,
    variableItemCount: itemCount,
    variableTotalSize: typescriptLayout.totalSize,
  },
  comparisons: {
    fixedWasmToTypescript: ratio("fixed-wasm", "fixed-typescript"),
    queryColdMaterializationToRepeatedWasm: ratio(
      "query-cold-materialization-wasm-50k",
      "query-repeated-wasm-50k",
    ),
    queryRepeatedWasmToReferenceJs: ratio(
      "query-repeated-wasm-50k",
      "query-reference-js-50k",
    ),
    variableOneShotToCachedTypescript: ratio(
      "variable-one-shot-typescript-100k",
      "variable-cached-typescript-100k",
    ),
    variableWasmToCachedTypescript: ratio(
      "variable-cached-wasm-100k",
      "variable-cached-typescript-100k",
    ),
    wasmLayoutBuildToTypescript: ratio(
      "layout-build-wasm-100k",
      "layout-build-typescript-100k",
    ),
  },
  measurements,
};

wasmLayout.dispose();

await mkdir(resolve(".artifacts"), { recursive: true });
await writeFile(
  resolve(".artifacts/virtualization-boundary-benchmark.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

console.log("tables TypeScript/Wasm boundary benchmark; values are evidence, not thresholds");
for (const measurement of measurements) {
  console.log(
    `${measurement.label}: median=${measurement.medianNsPerOperation.toFixed(2)} ns/op ` +
      `range=${measurement.minNsPerOperation.toFixed(2)}-${measurement.maxNsPerOperation.toFixed(2)}`,
  );
}
console.log("ratios:", JSON.stringify(evidence.comparisons));

function assertQueryParity() {
  const wasm = wasmKernel.queryTable(queryRows, queryColumns, queryFilter, querySort).sourceIndices;
  const reference = referenceQuery(queryRows);
  if (
    wasm.length !== reference.length ||
    wasm.some((sourceIndex, index) => queryRows[sourceIndex]?.id !== reference[index]?.id)
  ) {
    throw new Error("Wasm query benchmark does not match the plain-JavaScript reference");
  }
}

function referenceQuery(rows: readonly QueryRow[]) {
  const filteredRows = rows.filter(
    (row) => row.stage === "Proposal" && row.name.toLowerCase().includes("account"),
  );
  return [...filteredRows].sort((left, right) => {
    const region = left.region.localeCompare(right.region);
    return region || right.value - left.value;
  });
}

function createQueryRows(size: number): QueryRow[] {
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

function measure(
  label: string,
  iterationsPerSample: number,
  warmupIterations: number,
  operation: (iteration: number) => number,
): Measurement {
  let checksum = 0;

  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    checksum += operation(iteration);
  }

  const samplesNsPerOperation: number[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const started = process.hrtime.bigint();
    for (let iteration = 0; iteration < iterationsPerSample; iteration += 1) {
      checksum += operation(iteration + sample * iterationsPerSample);
    }
    const elapsedNs = Number(process.hrtime.bigint() - started);
    samplesNsPerOperation.push(elapsedNs / iterationsPerSample);
  }

  const sorted = [...samplesNsPerOperation].sort((left, right) => left - right);
  const medianNsPerOperation = sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;

  return {
    checksum,
    iterationsPerSample,
    label,
    maxNsPerOperation: sorted.at(-1) ?? Number.NaN,
    medianNsPerOperation,
    minNsPerOperation: sorted[0] ?? Number.NaN,
    sampleCount,
    samplesNsPerOperation,
  };
}

function readMeasurement(label: string): Measurement {
  const measurement = byLabel.get(label);
  if (!measurement) {
    throw new Error(`Missing benchmark measurement: ${label}`);
  }
  return measurement;
}
