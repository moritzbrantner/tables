import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installerPath = join(root, "scripts/install-wasm-pack-ci.sh");
const read = (path) => readFileSync(join(root, path), "utf8");

test("verified wasm-pack installer is shell-valid and release-pinned", () => {
  execFileSync("bash", ["-n", installerPath]);
  const installer = read("scripts/install-wasm-pack-ci.sh");
  assert.match(installer, /version=0\.14\.0/);
  assert.match(installer, /sha256sum --check --status/);
  const digests = [...installer.matchAll(/^\s+digest=([a-f0-9]{64})$/gm)].map((m) => m[1]);
  assert.deepEqual(digests, [
    "278a8d668085821f4d1a637bd864f1713f872b0ae3a118c77562a308c0abfe8d",
    "5941c7b05060440ff37ee50fe9009a408e63fa5ba607a3b0736f5a887ec5f2ca",
  ]);
  assert.match(installer, />> "\$GITHUB_PATH"/);
});

test("invalid release downloads fail closed without installing or updating PATH", () => {
  const directory = mkdtempSync(join(tmpdir(), "tables-wasm-pack-"));
  try {
    const fakeBin = join(directory, "bin");
    mkdirSync(fakeBin);
    const fakeCurl = join(fakeBin, "curl");
    writeFileSync(fakeCurl, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "while [[ $# -gt 0 ]]; do",
      '  if [[ "$1" == "--output" ]]; then',
      '    printf "invalid archive" > "$2"',
      "    exit 0",
      "  fi",
      "  shift",
      "done",
      "exit 2",
      "",
    ].join("\n"));
    chmodSync(fakeCurl, 0o755);
    const githubPath = join(directory, "github-path");
    writeFileSync(githubPath, "");
    const result = spawnSync("bash", [installerPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: fakeBin + ":" + process.env.PATH,
        RUNNER_TEMP: directory,
        GITHUB_PATH: githubPath,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /checksum did not match/);
    assert.equal(existsSync(join(directory, "wasm-pack-ci/bin/wasm-pack")), false);
    assert.equal(readFileSync(githubPath, "utf8"), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("existing CI, Rust parity and Pages use the same verified tool", () => {
  for (const name of ["ci.yml", "rust.yml", "deploy-pages.yml"]) {
    const workflow = read(".github/workflows/" + name);
    assert.match(workflow, /bash scripts\/install-wasm-pack-ci\.sh/, name);
    assert.doesNotMatch(workflow, /cargo install wasm-pack/, name);
  }
});
