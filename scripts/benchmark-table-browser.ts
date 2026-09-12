import { cpus } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";

import { chromium, type Page } from "@playwright/test";

type BrowserBenchmarkResult = {
  medianMs: number;
  samplesMs: number[];
  workload: string;
};

const outputPath = getArgument("--output") ?? ".artifacts/table-browser-benchmark.json";
const baseUrl = "http://127.0.0.1:5185";
const sampleCount = 3;
const server = spawn(
  "bunx",
  ["vite", "--host", "127.0.0.1", "--port", "5185", "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);

server.stdout.on("data", (chunk) => process.stderr.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const results: BrowserBenchmarkResult[] = [];
    results.push(await measureBrowser("initial-render-100k", async (page) => {
      await page.goto(`${baseUrl}/dense.html`);
      await page.getByRole("grid", { name: "Dense pipeline table" }).waitFor();
      await page.locator('[role="gridcell"][data-grid-row-index="0"]').first().waitFor();
    }));
    results.push(await measureBrowser("vertical-scroll-100k", async (page) => {
      await page.goto(`${baseUrl}/dense.html`);
      const scroll = page.locator(".mb-table__scroll");
      await scroll.waitFor();
      await scroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight - element.clientHeight;
      });
      await page.locator('[role="gridcell"][data-grid-row-index="99999"]').first().waitFor();
    }));
    results.push(await measureBrowser("horizontal-scroll-wide", async (page) => {
      await page.goto(`${baseUrl}/wide.html`);
      const scroll = page.locator(".mb-table__scroll");
      await scroll.waitFor();
      await scroll.evaluate((element) => {
        element.scrollLeft = element.scrollWidth - element.clientWidth;
      });
      await page
        .locator('[role="gridcell"][data-grid-row-index="0"][data-grid-column-index="19"]')
        .waitFor();
    }));
    results.push(await measureBrowser("keyboard-column-resize", async (page) => {
      await page.goto(`${baseUrl}/wide.html`);
      const resize = page.getByRole("button", { name: /resize/i }).first();
      await resize.focus();
      await resize.press("ArrowRight");
    }));

    const cpu = cpus()[0];
    const report = {
      environment: {
        arch: process.arch,
        bun: process.versions.bun ?? null,
        cpuCount: cpus().length,
        cpuModel: cpu?.model ?? null,
        platform: process.platform,
        playwrightBrowser: await browser.version(),
      },
      methodology: {
        sampleCount,
        timing: "median end-to-end browser duration after one warm-up sample per workload",
      },
      results,
      version: 1,
    };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
} finally {
  server.kill("SIGTERM");
}

async function measureBrowser(
  workload: string,
  operation: (page: Page) => Promise<void>,
): Promise<BrowserBenchmarkResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    try {
      const warmup = await context.newPage();
      await operation(warmup);
      await warmup.close();

      const samplesMs: number[] = [];
      for (let index = 0; index < sampleCount; index += 1) {
        const page = await context.newPage();
        const start = performance.now();
        await operation(page);
        samplesMs.push(round(performance.now() - start));
        await page.close();
      }
      const sorted = [...samplesMs].sort((left, right) => left - right);
      return {
        medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
        samplesMs,
        workload,
      };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The local Vite process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function getArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
