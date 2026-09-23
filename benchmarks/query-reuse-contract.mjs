import assert from "node:assert/strict";

const sizes = [1000, 10000, 100000];
function samples(values, recorded, count) {
  assert.equal(values.length, count, "Incomplete timing samples");
  assert.ok(values.every((n) => Number.isFinite(n) && n > 0), "Invalid timing");
  assert.equal([...values].sort((a, b) => a - b)[Math.floor(count / 2)], recorded, "Incorrect median");
}
function keys(results, expected, key) {
  const actual = results.map(key);
  assert.equal(new Set(actual).size, actual.length, "Duplicate benchmark case");
  assert.deepEqual(actual.sort(), expected.sort(), "Incomplete benchmark matrix");
}
export function validateQueryReuseReport(report) {
  assert.equal(report.version, 1);
  assert.equal(report.methodology.sampleCount, 7);
  assert.match(report.checkoutSha, /^[0-9a-f]{40}$/);
  assert.match(report.wasmSha256, /^[0-9a-f]{64}$/);
  if (report.sourceSha !== null) assert.match(report.sourceSha, /^[0-9a-f]{40}$/);
  if (report.suite === "table-query-sessions-v1") {
    const workloads = ["identity", "sorted", "filtered-sorted", "empty"];
    keys(report.results, ["typescript", "wasm"].flatMap((backend) => sizes.flatMap((size) => workloads.map((workload) => `${backend}/${size}/${workload}`))),
      (row) => `${row.backend}/${row.size}/${row.workload}`);
    const checksums = new Map();
    for (const row of report.results) {
      samples(row.samples.preparation, row.preparationMedianMs, 7);
      samples(row.samples.sessionPages, row.sessionPagesMedianMs, 7);
      samples(row.samples.oneOffPages, row.oneOffPagesMedianMs, 7);
      assert.equal(row.limit, 100);
      assert.equal(row.offsets.length, 5);
      assert.ok(row.offsets.every((offset) => Number.isSafeInteger(offset) && offset >= 0));
      assert.ok(Number.isSafeInteger(row.filteredRowCount) && row.filteredRowCount >= 0 && row.filteredRowCount <= row.size);
      assert.equal(row.orderedPageChecksums.length, row.offsets.length);
      for (const hash of row.orderedPageChecksums) assert.match(hash, /^[0-9a-f]{64}$/);
      const key = `${row.size}/${row.workload}`;
      const evidence = { offsets: row.offsets, count: row.filteredRowCount, hashes: row.orderedPageChecksums };
      if (checksums.has(key)) assert.deepEqual(evidence, checksums.get(key), "Provider result mismatch");
      else checksums.set(key, evidence);
      const saved = row.oneOffPagesMedianMs - row.sessionPagesMedianMs;
      assert.equal(row.breakEvenPageReads, saved > 0 ? Math.ceil(row.preparationMedianMs / (saved / row.offsets.length)) : null);
    }
  } else {
    assert.equal(report.suite, "table-cold-preparation-v1", "Unknown suite");
    assert.equal(report.baselineSha, "87d7f6c91df5668b9512c27be5a721b44c62cd8e");
    assert.equal(report.baselineBlob, "0b317d8400d71741ca94be1a0e242c932e10478d");
    keys(report.results, sizes.flatMap((size) => [3, 16].map((width) => `${size}/${width}`)), (row) => `${row.size}/${row.width}`);
    for (const row of report.results) {
      samples(row.samples.baseline, row.baselineMedianMs, 7);
      samples(row.samples.candidate, row.candidateMedianMs, 7);
      assert.equal(row.ratio, row.candidateMedianMs / row.baselineMedianMs);
      assert.match(row.checksum, /^[0-9a-f]{64}$/);
      assert.ok(Number.isSafeInteger(row.filteredRowCount) && row.filteredRowCount >= 0 && row.filteredRowCount <= row.size);
    }
  }
  return report;
}
