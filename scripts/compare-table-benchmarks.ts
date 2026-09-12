import { readFile } from "node:fs/promises";

type Result = {
  medianMs: number;
  size?: number;
  workload: string;
};

type Report = {
  results: Result[];
};

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  throw new Error(
    "Usage: bun scripts/compare-table-benchmarks.ts <baseline.json> <candidate.json>",
  );
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Report;
const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Report;
const baselineByKey = new Map(baseline.results.map((result) => [key(result), result]));

const rows = candidate.results.map((result) => {
  const previous = baselineByKey.get(key(result));
  const deltaPercent = previous?.medianMs
    ? ((result.medianMs - previous.medianMs) / previous.medianMs) * 100
    : null;
  return {
    baselineMs: previous?.medianMs ?? null,
    candidateMs: result.medianMs,
    deltaPercent: deltaPercent === null ? null : round(deltaPercent),
    size: result.size ?? null,
    workload: result.workload,
  };
});

console.table(rows);
console.log(
  "Comparison is evidence only; no universal performance threshold is inferred from one environment.",
);

function key(result: Result) {
  return `${result.workload}:${result.size ?? "browser"}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
