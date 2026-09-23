import assert from "node:assert/strict";
import test from "node:test";
import { validateReport } from "./contract.mjs";
const options = { sizes: [1000], sampleCount: 3, pins: { react: "19.2.7" } };
function fixture() {
  return { version: 1, suite: "table-browser-reference-v1", sampleCount: 3, versions: options.pins,
    results: ["client", "window"].flatMap((scope) => ["mount", "filter", "sort", "page"].flatMap((workload) => ["tables", "ag-grid", "mui"].map((provider) => ({
      scope, workload, provider, size: 1000, medianMs: 2, samplesMs: [1, 2, 3], checksum: 123, maxMountedRows: 18,
    })))) };
}
test("complete equal-provider evidence passes including an exact ratio boundary", () => {
  assert.deepEqual(validateReport(fixture(), { ...options, threshold: 1 }), []);
});
test("timing gate reports real exceeding cases", () => {
  assert.equal(validateReport(fixture(), { ...options, threshold: .9 }).length, 16);
});
test("missing and duplicate cases fail even when timing is disabled", () => {
  const missing = fixture(); missing.results.pop();
  assert.throws(() => validateReport(missing, options));
  const duplicate = fixture(); duplicate.results[1] = duplicate.results[0];
  assert.throws(() => validateReport(duplicate, options));
  assert.throws(() => validateReport({ ...fixture(), results: [] }, options));
});
test("nonfinite samples, incorrect medians and oversized DOM fail", () => {
  for (const patch of [{ samplesMs: [1, NaN, 3] }, { samplesMs: [1, 0, 3] }, { medianMs: 1 }, { maxMountedRows: 103 }, { maxMountedRows: 1 }]) {
    const report = fixture(); Object.assign(report.results[0], patch);
    assert.throws(() => validateReport(report, options));
  }
});
test("provider versions and page checksums must match", () => {
  assert.throws(() => validateReport({ ...fixture(), versions: {} }, options));
  const mismatch = fixture(); mismatch.results[0].checksum = 999;
  assert.throws(() => validateReport(mismatch, options));
});
test("invalid thresholds or unexpected workload identities cannot weaken the gate", () => {
  for (const threshold of [0, -1, NaN, Infinity]) assert.throws(() => validateReport(fixture(), { ...options, threshold }));
  const invalid = fixture(); invalid.results[0].workload = "not-measured";
  assert.throws(() => validateReport(invalid, options));
});
