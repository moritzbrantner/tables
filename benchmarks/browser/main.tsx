import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { loadTableWasmKernel } from "../../src/wasm";
import { Adapter, type Probe } from "./adapters";
import { createRows, pageSize, providers, queryFor, reference, workloads, type Provider, type Query, type Row, type Scope, type Workload } from "./fixture";
import "../../styles.css";
import "./page.css";

declare const tableReferenceVersions: Record<string, string>;
const gridElement = document.getElementById("grid")!;
const root = createRoot(gridElement);
let mounted: Provider | null = null;
let invocation = 0;
let busy = false;
const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

export type Result = { provider: Provider; scope: Scope; workload: Workload; size: number; medianMs: number; samplesMs: number[]; maxMountedRows: number; checksum: number };
export type Report = { version: number; suite: string; userAgent: string; versions: Record<string, string>; sampleCount: number; results: Result[] };

async function render(provider: Provider, rows: Row[], query: Query, scope: Scope, remount: boolean) {
  if (remount || mounted !== provider) {
    flushSync(() => root.render(null));
    mounted = provider;
    await frame();
  }
  let receiveProbe!: (value: Probe) => void;
  let timeout = 0;
  const ready = new Promise<Probe>((resolve, reject) => {
    receiveProbe = (value) => {
      void value.ready.then(() => resolve(value), reject);
    };
    timeout = window.setTimeout(() => reject(new Error(`${provider}: adapter did not become ready`)), 10000);
  });
  const started = performance.now();
  try {
    flushSync(() => root.render(<Adapter key={provider} provider={provider} rows={rows} query={query} scope={scope} probe={receiveProbe} />));
    // Both React commit and asynchronous provider work signal completion.
    // The timeout bounds failure only; successful samples never wait on it.
    const active = await ready;
    await frame();
    await frame();
    const elapsed = performance.now() - started;
    const actual = active.snapshot();
    const mountedRows = gridElement.querySelectorAll('[role="row"]').length;
    return { actual, mountedRows, elapsed };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function run(options: { sizes?: number[]; scopes?: Scope[]; sampleCount?: number } = {}): Promise<Report> {
  if (busy) throw new Error("A browser comparison is already running");
  busy = true;
  try {
    if (!await loadTableWasmKernel()) throw new Error("The production Wasm kernel failed to load");
    const sizes = options.sizes ?? [Number((document.getElementById("size") as HTMLSelectElement).value)];
    const scopes = options.scopes ?? [(document.getElementById("scope") as HTMLSelectElement).value as Scope];
    const sampleCount = options.sampleCount ?? 7;
    if (!Number.isInteger(sampleCount) || sampleCount < 3) throw new Error("At least three samples are required");
    if (sizes.some((size) => ![1000, 10000, 100000].includes(size)) || scopes.some((scope) => !["client", "window"].includes(scope))) throw new Error("Unsupported workload options");
    const results: Result[] = [];
    for (const size of sizes) {
      const rows = createRows(size);
      for (const scope of scopes) {
        for (const workload of workloads) {
          const perProvider = new Map<Provider, Result>(providers.map((provider) => [provider, { provider, scope, workload, size, medianMs: 0, samplesMs: [], maxMountedRows: 0, checksum: 0 }]));
          // Every changed operation has its opposite state established first,
          // outside timing. Rotating providers cannot turn a changed query into
          // a cold mount or an unchanged-state memoization hit.
          for (let sample = -2; sample < sampleCount; sample++) {
            const start = ((sample + 2) % providers.length);
            const order = [...providers.slice(start), ...providers.slice(0, start)];
            for (const provider of order) {
              document.getElementById("status")!.textContent = `${scope} · ${size.toLocaleString()} rows · ${workload} · ${provider} · sample ${sample + 1}`;
              const query = queryFor(workload, (sample + 2) % 2);
              const expected = reference(rows, query);
              const snapshot = scope === "window" ? expected.rows : rows;
              const input = workload === "mount" ? snapshot.slice() : snapshot;
              if (workload !== "mount") {
                const prior = queryFor(workload, 1 - (sample + 2) % 2);
                const priorInput = scope === "window" ? reference(rows, prior).rows : rows;
                await render(provider, priorInput, prior, scope, true);
              }
              const result = await render(provider, input, query, scope, workload === "mount");
              const ids = expected.rows.map((row) => row.id);
              const count = scope === "client" ? expected.count : input.length;
              if (result.actual.count !== count || result.actual.ids.length !== ids.length || ids.some((id, index) => id !== result.actual.ids[index])) {
                throw new Error(`${provider}/${scope}/${workload}/${size}: ordered page/count mismatch: ${JSON.stringify(result.actual).slice(0, 250)}`);
              }
              if (result.mountedRows < 2 || result.mountedRows > pageSize + 2) throw new Error(`${provider}: unbounded or empty DOM (${result.mountedRows} rows)`);
              // Also assert the actual displayed cells, not only headless APIs.
              const first = ids[0];
              const rowSelector = provider === "mui" ? `[data-id="${first}"]` : provider === "ag-grid" ? `[row-id="${first}"]` : `[aria-rowindex="${(scope === "client" ? query.page * pageSize : 0) + 2}"]`;
              const firstRow = gridElement.querySelector(rowSelector);
              if (!firstRow || !firstRow.textContent?.includes(`Account ${first! % 2000}`)) throw new Error(`${provider}: displayed first row does not match the result`);
              const entry = perProvider.get(provider)!;
              if (sample >= 0) entry.samplesMs.push(result.elapsed);
              entry.maxMountedRows = Math.max(entry.maxMountedRows, result.mountedRows);
              entry.checksum = ids.reduce((sum, id, position) => (sum + (position + 1) * (id + 1)) >>> 0, 0);
              invocation++;
            }
          }
          for (const entry of perProvider.values()) {
            const sorted = [...entry.samplesMs].sort((left, right) => left - right);
            entry.medianMs = sorted[Math.floor(sorted.length / 2)]!;
            results.push(entry);
          }
        }
      }
    }
    const report: Report = { version: 1, suite: "table-browser-reference-v1", userAgent: navigator.userAgent, versions: tableReferenceVersions, sampleCount, results };
    showResults(report);
    document.getElementById("status")!.textContent = `Completed. ${results.length} cases; ordered pages, total counts and DOM bounds verified after every invocation.`;
    await preview();
    return report;
  } catch (error) {
    document.getElementById("status")!.textContent = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    busy = false;
  }
}

async function preview() {
  const size = Number((document.getElementById("size") as HTMLSelectElement).value);
  document.getElementById("preview-title")!.textContent = `Tables · ${size.toLocaleString()} source rows · 100-row window`;
  await render("tables", createRows(size), { query: "", descending: true, page: 0 }, "client", true);
}
function showResults(report: Report) {
  const table = document.createElement("table");
  table.setAttribute("aria-label", "Browser reference results");
  table.innerHTML = "<thead><tr><th>Scope</th><th>Rows</th><th>Workload</th><th>Provider</th><th>Median (ms)</th><th>Mounted rows</th></tr></thead>";
  const body = table.createTBody();
  for (const result of report.results) {
    const row = body.insertRow();
    for (const value of [result.scope, result.size.toLocaleString(), result.workload, result.provider, result.medianMs.toFixed(2), String(result.maxMountedRows)]) row.insertCell().textContent = value;
  }
  document.getElementById("results")!.replaceChildren(table);
}

document.getElementById("versions")!.textContent = `Pinned: AG Grid ${tableReferenceVersions["ag-grid-react"]} · MUI X ${tableReferenceVersions["@mui/x-data-grid"]} · React ${tableReferenceVersions.react}`;
(document.getElementById("run") as HTMLButtonElement).onclick = async () => {
  const button = document.getElementById("run") as HTMLButtonElement;
  button.disabled = true;
  try { await run(); } catch { /* Error is shown in the status region. */ } finally { button.disabled = false; }
};
declare global { interface Window { tableBrowserBenchmark: { run: typeof run; preview: typeof preview; invocations: () => number } } }
await loadTableWasmKernel();
await preview();
window.tableBrowserBenchmark = { run, preview, invocations: () => invocation };
(document.getElementById("run") as HTMLButtonElement).disabled = false;
