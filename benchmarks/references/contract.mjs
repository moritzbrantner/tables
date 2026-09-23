import { parseArgs } from "node:util";

export function parseArguments(args) {
  const { values } = parseArgs({
    args, strict: true, allowPositionals: false,
    options: {
      wasm: { type: "boolean" },
      output: { type: "string" },
      "max-ratio": { type: "string" },
    },
  });
  const maxRatio = values["max-ratio"] === undefined ? null : Number(values["max-ratio"]);
  validateThreshold(maxRatio);
  if (values.output === "") throw new Error("--output requires a nonempty path");
  return {
    useWasm: values.wasm ?? false,
    output: values.output ?? ".artifacts/table-reference-benchmark.json",
    maxRatio,
  };
}

export function findViolations(results, providers, maxRatio) {
  validateThreshold(maxRatio);
  if (results.length === 0 || !providers.includes("tanstack")) {
    throw new Error("Reference evidence must contain measured cases and TanStack");
  }
  const cases = new Map();
  for (const result of results) {
    if (!providers.includes(result.provider) || !Number.isFinite(result.ratio) || result.ratio <= 0) {
      throw new Error("Invalid provider or nonpositive/nonfinite reference ratio");
    }
    if (result.provider === "tanstack" && result.ratio !== 1) {
      throw new Error("The reference ratio must be exactly one");
    }
    const key = JSON.stringify([result.phase, result.workload, result.size]);
    const measured = cases.get(key) ?? new Set();
    if (measured.has(result.provider)) throw new Error("Duplicate provider evidence");
    measured.add(result.provider);
    cases.set(key, measured);
  }
  for (const measured of cases.values()) {
    if (measured.size !== providers.length) throw new Error("Incomplete provider comparison");
  }
  return maxRatio === null ? [] : results.filter(
    (result) => result.provider !== "tanstack" && result.ratio > maxRatio,
  );
}

function validateThreshold(maxRatio) {
  if (maxRatio !== null && (!Number.isFinite(maxRatio) || maxRatio <= 0)) {
    throw new Error("--max-ratio requires a positive finite number");
  }
}
