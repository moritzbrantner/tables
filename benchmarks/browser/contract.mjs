import assert from "node:assert/strict";

const providers = ["tables", "ag-grid", "mui"];
const scopes = ["client", "window"];
const workloads = ["mount", "filter", "sort", "page"];

/** Validate the complete matrix before any timing comparison can pass. */
export function validateReport(report, { sizes, sampleCount, pins, threshold = null }) {
  assert.ok(threshold === null || (Number.isFinite(threshold) && threshold > 0), "Invalid timing threshold");
  assert.equal(report.version, 1);
  assert.equal(report.suite, "table-browser-reference-v1");
  assert.equal(report.sampleCount, sampleCount);
  assert.deepEqual(report.versions, pins, "Provider versions must match exact pins");
  assert.ok(sizes.length > 0 && new Set(sizes).size === sizes.length, "Expected sizes must be unique and nonempty");
  const expected = new Set(sizes.flatMap((size) => scopes.flatMap((scope) => workloads.flatMap((workload) => providers.map((provider) => key({ size, scope, workload, provider }))))));
  const records = new Map();
  for (const result of report.results) {
    const id = key(result);
    assert.ok(expected.delete(id), `Duplicate or unexpected case ${id}`);
    assert.equal(result.samplesMs.length, sampleCount, `Wrong sample count for ${id}`);
    assert.ok(result.samplesMs.every((sample) => Number.isFinite(sample) && sample > 0), `Invalid sample for ${id}`);
    const sorted = [...result.samplesMs].sort((left, right) => left - right);
    assert.equal(result.medianMs, sorted[Math.floor(sorted.length / 2)], `Median does not match samples for ${id}`);
    assert.ok(Number.isSafeInteger(result.maxMountedRows) && result.maxMountedRows >= 2 && result.maxMountedRows <= 102, `Unbounded DOM for ${id}`);
    assert.ok(Number.isSafeInteger(result.checksum) && result.checksum >= 0, `Invalid checksum for ${id}`);
    records.set(id, result);
  }
  assert.equal(expected.size, 0, "The complete provider/workload/size matrix is required");
  const violations = [];
  for (const result of records.values()) {
    if (result.provider !== "tables") continue;
    for (const provider of providers.slice(1)) {
      const reference = records.get(key({ ...result, provider }));
      assert.equal(result.checksum, reference.checksum, "Provider page checksums differ");
      const ratio = result.medianMs / reference.medianMs;
      if (threshold !== null && ratio > threshold) violations.push({ ...result, reference: provider, ratio });
    }
  }
  return violations;
}
function key({ size, scope, workload, provider }) {
  return JSON.stringify([size, scope, workload, provider]);
}
