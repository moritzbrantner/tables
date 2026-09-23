import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus } from "node:os";
import { extname, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { validateReport } from "./contract.mjs";

const { values } = parseArgs({ options: {
  root: { type: "string", default: "dist-browser-references" },
  smoke: { type: "boolean", default: false },
  "max-ratio": { type: "string" },
} });
const threshold = values["max-ratio"] === undefined ? null : Number(values["max-ratio"]);
assert.ok(threshold === null || (Number.isFinite(threshold) && threshold > 0), "--max-ratio must be positive and finite");
const root = resolve(values.root);
const prefix = "/tables/references/";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!pathname.startsWith(prefix)) throw new Error("Wrong deployment prefix");
    const file = resolve(root, pathname.slice(prefix.length) || "index.html");
    if (!file.startsWith(root + sep)) throw new Error("Invalid path");
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch { response.writeHead(404); response.end("Not found"); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
let page;
await mkdir(".artifacts", { recursive: true });
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.waitForFunction(() => typeof window.tableBrowserBenchmark?.run === "function");
  const report = await page.evaluate(async (smoke) => window.tableBrowserBenchmark.run({
    sizes: smoke ? [1000] : [1000, 10000, 100000], scopes: ["client", "window"], sampleCount: smoke ? 3 : 7,
  }), values.smoke);
  assert.deepEqual(errors, [], "Browser errors cannot be ignored by a successful timing report");
  const pins = JSON.parse(await readFile("benchmarks/browser/package.json", "utf8")).dependencies;
  const violations = validateReport(report, { sizes: values.smoke ? [1000] : [1000, 10000, 100000], sampleCount: values.smoke ? 3 : 7, pins, threshold });
  const evidence = {
    ...report, createdAt: new Date().toISOString(),
    checkoutSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceSha: process.env.TABLES_SOURCE_SHA ?? null,
    environment: { browser: browser.version(), arch: process.arch, platform: process.platform, cpu: cpus()[0]?.model, cpuCount: cpus().length },
    methodology: {
      viewport: { width: 1280, height: 1000 }, gridHeight: 400, rowHeight: 32, pageSize: 100,
      warmups: 2, providerOrder: "rotating", queryStates: "alternating; opposite state established outside each changed-operation timer",
      timing: "query/React commit plus asynchronous provider readiness and two animation frames; excludes fixture/oracle construction and result verification",
      correctness: "every page ID, full matching count, first displayed row and bounded row DOM after every invocation",
      scope: "client = full source data supplied; window = common oracle page supplied equally to every provider; no full-dataset continuous-scroll claim",
    },
    ratchet: { enabled: threshold !== null, threshold, passed: violations.length === 0, violations },
  };
  await writeFile(".artifacts/table-browser-reference-benchmark.json", JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
  assert.equal(violations.length, 0, "Same-run relative timing gate exceeded");
} finally {
  if (page) {
    await page.screenshot({ path: ".artifacts/browser-references.png", fullPage: true });
    await writeFile(".artifacts/browser-reference-dom.html", await page.content());
    const layout = await page.locator("#grid").evaluate((grid) => ({
      grid: grid.getBoundingClientRect().toJSON(),
      elements: Array.from(grid.querySelectorAll("div")).slice(0, 40).map((element) => ({
        className: element.className, role: element.getAttribute("role"), style: element.getAttribute("style"),
        rect: element.getBoundingClientRect().toJSON(), display: getComputedStyle(element).display,
      })),
      rowClasses: Array.from(grid.querySelectorAll('[role="row"]')).reduce((counts, row) => {
        const key = row.className; counts[key] = (counts[key] ?? 0) + 1; return counts;
      }, {}),
    }));
    await writeFile(".artifacts/browser-reference-layout.json", JSON.stringify(layout, null, 2));
  }
  await browser?.close();
  await new Promise((done) => server.close(done));
}
