import assert from "node:assert/strict";
import test from "node:test";

import { findViolations, parseArguments } from "./contract.mjs";

const providers = ["tables-typescript", "tanstack"];
const evidence = (ratio = 1) => providers.map((provider) => ({
  provider, phase: "changed-query", workload: "global-text", size: 1_000,
  ratio: provider === "tanstack" ? 1 : ratio,
}));

test("defaults leave timing disabled and explicit options enable it", () => {
  assert.deepEqual(parseArguments([]), {
    useWasm: false, maxRatio: null, output: ".artifacts/table-reference-benchmark.json",
  });
  assert.deepEqual(parseArguments(["--wasm", "--max-ratio", "1.25", "--output", "report.json"]), {
    useWasm: true, maxRatio: 1.25, output: "report.json",
  });
});

test("typos, missing arguments, and invalid thresholds cannot silently disable the gate", () => {
  for (const args of [
    ["--max-rato", "1.25"], ["--max-ratio"], ["--max-ratio", "NaN"],
    ["--max-ratio", "Infinity"], ["--max-ratio", "0"], ["--max-ratio=-1"],
    ["--output", ""], ["unexpected"],
  ]) assert.throws(() => parseArguments(args));
});

test("relative gate accepts its boundary and reports exceeding cases", () => {
  assert.deepEqual(findViolations(evidence(1.25), providers, 1.25), []);
  assert.equal(findViolations(evidence(1.26), providers, 1.25).length, 1);
  assert.deepEqual(findViolations(evidence(10), providers, null), []);
});

test("disabled timing still rejects missing or duplicate comparison evidence", () => {
  assert.throws(() => findViolations([], providers, null));
  assert.throws(() => findViolations(evidence().slice(0, 1), providers, null));
  assert.throws(() => findViolations([...evidence(), evidence()[0]], providers, null));
});

test("invalid measurements and a corrupted reference fail closed", () => {
  for (const ratio of [0, -1, NaN, Infinity]) {
    assert.throws(() => findViolations(evidence(ratio), providers, null));
  }
  const corrupt = evidence();
  corrupt[1].ratio = 2;
  assert.throws(() => findViolations(corrupt, providers, null));
  assert.throws(() => findViolations(evidence(), providers, -1));
});

test("every workload requires all requested providers including Wasm", () => {
  assert.throws(() => findViolations(evidence(), [...providers, "tables-wasm"], null));
  assert.throws(() => findViolations([
    ...evidence(), { ...evidence()[0], workload: "multi-sort" },
  ], providers, null));
});
