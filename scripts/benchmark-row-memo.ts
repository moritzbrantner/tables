/* oxlint-disable no-await-in-loop -- Samples and browser steps must run sequentially to avoid timing contention. */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";
import { build, preview, type Plugin } from "vite";

// This transform is confined to disposable benchmark builds. No runtime flag or
// alternate row implementation is shipped in the library or ordinary examples.
const variant = argument("--variant") ?? "baseline";
if (variant !== "baseline" && variant !== "candidate") {
  throw new Error("--variant must be baseline or candidate");
}
const output = argument("--output") ?? `.artifacts/row-memo/${variant}.json`;
const outDir = path.resolve(`.artifacts/row-memo/${variant}-build`);
const sampleCount = 5;
const steps = 180;
const scenarios = [
  { page: "dense", step: 100 },
  { page: "dense", step: 800 },
  { page: "wide", step: 100 },
];
const rowSource = await readFile("src/react-grid-row.tsx", "utf8");
const transform: Plugin = {
  name: "benchmark-grid-row-memo",
  enforce: "pre",
  transform(source, id) {
    if (!id.endsWith("/src/react-grid-row.tsx")) {
      return;
    }
    if (source !== rowSource || !source.includes("  const renderRowCell = (")) {
      throw new Error("GridRow changed: update the benchmark transform before measuring");
    }
    let code = source.replace(
      "  const renderRowCell = (",
      "  globalThis.tablesBenchmarkRowRenders = (globalThis.tablesBenchmarkRowRenders ?? 0) + 1;\n  const renderRowCell = (",
    );
    if (variant === "candidate") {
      code = 'import { memo } from "react";\n' + code.replace(
        "export function GridRow<TRow>(",
        "function GridRowImplementation<TRow>(",
      ) + "\nexport const GridRow = memo(GridRowImplementation);\n";
    }
    return { code, map: null };
  },
};
await build({
  plugins: [transform],
  build: { outDir, emptyOutDir: true },
  logLevel: "warn",
});
const server = await preview({
  build: { outDir },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const baseUrl = server.resolvedUrls?.local[0];
if (!baseUrl) {
  throw new Error("Preview server has no local URL");
}
try {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const scenario of scenarios) {
      const samples = [];
      for (let sample = -1; sample < sampleCount; sample += 1) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        try {
          await page.goto(`${baseUrl}${scenario.page}.html`);
          await page.getByRole("grid").waitFor();
          await page.locator('[data-grid-row-index="0"]').first().waitFor();
          // Flush setup and ResizeObserver work before collecting script time.
          await page.evaluate(() => new Promise<void>((resolve) => {
            const scroll = document.querySelector<HTMLElement>(".mb-table__scroll");
            if (!scroll) {
              throw new Error("Missing scroll viewport");
            }
            scroll.scrollTop = 2000;
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }));
          const session = await page.context().newCDPSession(page);
          await session.send("Performance.enable");
          const before = await session.send("Performance.getMetrics");
          const observed = await page.evaluate(async ({ step, steps }) => {
            const scroll = document.querySelector<HTMLElement>(".mb-table__scroll");
            if (!scroll) {
              throw new Error("Missing table scroll viewport");
            }
            const firstIndex = () => Number(scroll.querySelector("[data-grid-row-index]")?.getAttribute("data-grid-row-index"));
            let previousIndex = firstIndex();
            let rangeChanges = 0;
            let rowMounts = 0;
            let rowUnmounts = 0;
            const observer = new MutationObserver((records) => {
              for (const record of records) {
                for (const node of record.addedNodes) {
                  if (node instanceof HTMLElement && node.classList.contains("mb-table__row")) {
                    rowMounts += 1;
                  }
                }
                for (const node of record.removedNodes) {
                  if (node instanceof HTMLElement && node.classList.contains("mb-table__row")) {
                    rowUnmounts += 1;
                  }
                }
              }
            });
            observer.observe(scroll, { childList: true, subtree: true });
            const scope = globalThis as typeof globalThis & { tablesBenchmarkRowRenders?: number };
            scope.tablesBenchmarkRowRenders = 0;
            const framesMs: number[] = [];
            let previousTime = performance.now();
            const start = previousTime;
            for (let index = 1; index <= steps; index += 1) {
              scroll.scrollTop = 2000 + index * step;
              await new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame((time) => {
                  framesMs.push(time - previousTime);
                  previousTime = time;
                  resolve();
                }));
              });
              const currentIndex = firstIndex();
              if (currentIndex !== previousIndex) {
                rangeChanges += 1;
              }
              previousIndex = currentIndex;
            }
            observer.disconnect();
            if (rangeChanges < steps - 1) {
              throw new Error(`Expected range-crossing scrolls, observed ${rangeChanges}/${steps}`);
            }
            return {
              durationMs: performance.now() - start,
              framesMs,
              rangeChanges,
              rowMounts,
              rowUnmounts,
              rowRenders: scope.tablesBenchmarkRowRenders,
              mountedRows: scroll.querySelectorAll(".mb-table__row").length,
              finalFirstRow: previousIndex,
            };
          }, { step: scenario.step, steps });
          const after = await session.send("Performance.getMetrics");
          const metric = (metrics: typeof before, name: string) => {
            const value = metrics.metrics.find((entry) => entry.name === name)?.value;
            if (value === undefined) {
              throw new Error(`Missing Chromium metric ${name}`);
            }
            return value;
          };
          if (sample >= 0) {
            samples.push({
              ...observed,
              scriptMs: (metric(after, "ScriptDuration") - metric(before, "ScriptDuration")) * 1000,
              taskMs: (metric(after, "TaskDuration") - metric(before, "TaskDuration")) * 1000,
            });
          }
          await session.detach();
        } finally {
          await page.close();
        }
      }
      const frames = samples.flatMap((sample) => sample.framesMs);
      results.push({
        workload: `${scenario.page}-range-scroll-${scenario.step}px`,
        medianMs: median(samples.map((sample) => sample.scriptMs)),
        medianTaskMs: median(samples.map((sample) => sample.taskMs)),
        medianDurationMs: median(samples.map((sample) => sample.durationMs)),
        frameP50Ms: percentile(frames, 0.5),
        frameP95Ms: percentile(frames, 0.95),
        samples,
      });
    }
    const report = {
      version: 1,
      variant,
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      sourceDiff: execFileSync("git", ["diff", "--", "src", "examples", "vite.config.ts"], { encoding: "utf8" }),
      environment: {
        platform: process.platform,
        arch: process.arch,
        bun: process.versions.bun,
        cpuModel: cpus()[0]?.model,
        cpuCount: cpus().length,
        browser: await browser.version(),
        viewport: { width: 1440, height: 1000 },
      },
      methodology: {
        build: "Vite production; identical row-render counter in both builds",
        prototype: "React.memo(GridRow), default shallow comparison; all props preserved",
        sampleCount,
        warmups: 1,
        steps,
        timing: "CDP ScriptDuration delta after setup; two requestAnimationFrames per step; lower is better",
        frames: "interval between completed two-frame scroll steps, not individual display frames",
        counts: "row render calls, DOM row mounts/unmounts, range transitions; excludes initial render",
      },
      results,
    };
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ output, results: results.map(({ samples, ...result }) => Object.assign(result, {
      rowRenders: samples.map((sample) => sample.rowRenders),
    })) }, null, 2));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise<void>((resolve, reject) => server.httpServer.close((error) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  }));
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function median(values: number[]) {
  return percentile(values, 0.5);
}
