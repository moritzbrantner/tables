import assert from "node:assert/strict";
import test from "node:test";
import { validateQueryReuseReport } from "./query-reuse-contract.mjs";

function fixture() {
  return { version: 1, suite: "table-cold-preparation-v1", methodology: { sampleCount: 7 },
    checkoutSha: "a".repeat(40), sourceSha: null, wasmSha256: "b".repeat(64),
    baselineSha: "87d7f6c91df5668b9512c27be5a721b44c62cd8e", baselineBlob: "0b317d8400d71741ca94be1a0e242c932e10478d",
    results: [1000, 10000, 100000].flatMap((size) => [3, 16].map((width) => ({
      size, width, baselineMedianMs: 2, candidateMedianMs: 1, ratio: 0.5,
      samples: { baseline: Array(7).fill(2), candidate: Array(7).fill(1) }, filteredRowCount: 10, checksum: "c".repeat(64),
    }))),
  };
}
test("complete paired evidence is accepted", () => assert.equal(validateQueryReuseReport(fixture()).results.length, 6));
test("missing and duplicate cases cannot masquerade as complete evidence", () => {
  const missing = fixture(); missing.results.pop(); assert.throws(() => validateQueryReuseReport(missing));
  const duplicate = fixture(); duplicate.results[1] = duplicate.results[0]; assert.throws(() => validateQueryReuseReport(duplicate));
});
test("samples and recorded medians must agree", () => {
  for (const mutation of [
    (r) => { r.samples.candidate.pop(); }, (r) => { r.samples.candidate[0] = NaN; },
    (r) => { r.candidateMedianMs = 100; }, (r) => { r.ratio = 1; },
    (r) => { r.filteredRowCount = r.size + 1; },
  ]) { const report = fixture(); mutation(report.results[0]); assert.throws(() => validateQueryReuseReport(report)); }
});
test("historical baseline identity cannot silently change", () => {
  const report = fixture(); report.baselineSha = "0".repeat(40); assert.throws(() => validateQueryReuseReport(report));
});

function sessionFixture() {
  const source = fixture();
  return { ...source, suite: "table-query-sessions-v1", results: ["typescript", "wasm"].flatMap((backend) => [1000, 10000, 100000].flatMap((size) => ["identity", "sorted", "filtered-sorted", "empty"].map((workload) => ({
    backend, size, workload, offsets: [0, 500, 900, 200, 333], limit: 100,
    filteredRowCount: workload === "empty" ? 0 : size,
    preparationMedianMs: 2, sessionPagesMedianMs: 1, oneOffPagesMedianMs: 3, breakEvenPageReads: 5,
    samples: { preparation: Array(7).fill(2), sessionPages: Array(7).fill(1), oneOffPages: Array(7).fill(3) },
    orderedPageChecksums: Array(5).fill("c".repeat(64)),
  })))) };
}
test("all prepared and compatibility cases must be present with correct break-even arithmetic", () => {
  assert.equal(validateQueryReuseReport(sessionFixture()).results.length, 24);
  const missing = sessionFixture(); missing.results.pop(); assert.throws(() => validateQueryReuseReport(missing));
  const bad = sessionFixture(); bad.results[0].breakEvenPageReads = 0; assert.throws(() => validateQueryReuseReport(bad));
});
test("prepared backend results must agree with the compatibility oracle evidence", () => {
  const bad = sessionFixture(); bad.results.at(-1).orderedPageChecksums[0] = "d".repeat(64);
  assert.throws(() => validateQueryReuseReport(bad));
});
