import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";

const root = resolve("dist-examples");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!pathname.startsWith("/tables/")) throw new Error("Wrong deployment prefix");
    const file = resolve(root, pathname.slice("/tables/".length) || "index.html");
    if (!file.startsWith(`${root}${sep}`)) throw new Error("Invalid path");
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
let browser;
let page;
await mkdir(".artifacts", { recursive: true });
try {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const wasmResponses = [];
  page.on("response", (response) => {
    if (response.url().endsWith(".wasm")) wasmResponses.push(response.status());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/tables/benchmarks.html`);
  await page.getByRole("button", { name: "Run in this browser" }).click();
  await expect(page.getByLabel("Same-browser query comparison")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Rust\/Wasm query kernel could not be loaded/i)).toHaveCount(0);
  assert.deepEqual(errors, [], "Production Pages must not raise browser errors");
  assert.ok(wasmResponses.includes(200), "The built Pages site must actually load its Wasm binary");
  await page.screenshot({ path: ".artifacts/pages-smoke.png", fullPage: true });
  await page.goto(`http://127.0.0.1:${server.address().port}/tables/windowed.html?offset=100&sort=asc`);
  await expect(page.getByTestId("query-backend")).toContainText("Rust/Wasm · bounded query result");
  await expect(page.getByTestId("window-count")).toHaveText("100 returned · 100,000 matching · offset 100");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/offset=200/);
  await page.getByRole("textbox", { name: "Search accounts" }).fill("Account 17");
  await expect(page.getByTestId("window-count")).toHaveText("100 returned · 5,550 matching · offset 0");
  await page.screenshot({ path: ".artifacts/windowed-queries.png", fullPage: true });
  assert.deepEqual(errors, [], "The windowed production page must not raise browser errors");
  console.log("Production /tables/ loaded Wasm, benchmarked, and exercised windowed queries.");
} finally {
  await mkdir(".artifacts", { recursive: true });
  if (page) await page.screenshot({ path: ".artifacts/pages-final-state.png", fullPage: true });
  await browser?.close();
  await new Promise((done) => server.close(done));
}
