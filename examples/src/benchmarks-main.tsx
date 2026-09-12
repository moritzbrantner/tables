import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  Table,
  createTableModel,
  type TableColumnDef,
  type TableDataColumn,
} from "@moritzbrantner/tables";
import "../../table.css";
import { Alert, AlertDescription, Button, ViewHeader } from "./demo-ui";
import { ExampleNav } from "./playground/example-nav";
import { TablePanel } from "./playground/table-panel";
import "./styles.css";

type BenchmarkResult = {
  medianMs: number;
  samplesMs: number[];
  size: number;
  workload: string;
};

type BenchmarkReport = {
  environment: {
    arch: string;
    bun: string | null;
    cpuCount: number;
    cpuModel: string | null;
    platform: string;
  };
  methodology: {
    sampleCount: number;
    sizes: number[];
    timing: string;
  };
  results: BenchmarkResult[];
  version: number;
};

type BrowserComparisonResult = {
  referenceMedianMs: number;
  ratio: number;
  size: number;
  tablesMedianMs: number;
};

type BenchmarkRow = {
  id: number;
  name: string;
  region: string;
  stage: string;
  value: number;
};

type ComparisonTarget = {
  approach: string;
  benchmarkStatus: string;
  library: string;
  url: string;
  virtualization: string;
};

const benchmarkColumns: TableColumnDef<BenchmarkResult>[] = [
  { accessor: "workload", header: "Workload", id: "workload", minWidth: 190 },
  {
    accessor: "size",
    align: "end",
    cell: (value) => Number(value).toLocaleString(),
    header: "Rows",
    id: "size",
    width: 110,
  },
  {
    accessor: "medianMs",
    align: "end",
    cell: (value) => `${Number(value).toFixed(3)} ms`,
    header: "Median",
    id: "median",
    width: 130,
  },
  {
    accessor: "samplesMs",
    cell: (value) => (value as number[]).map((sample) => sample.toFixed(2)).join(", "),
    header: "Samples (ms)",
    id: "samples",
    minWidth: 260,
  },
];

const browserComparisonColumns: TableColumnDef<BrowserComparisonResult>[] = [
  {
    accessor: "size",
    align: "end",
    cell: (value) => Number(value).toLocaleString(),
    header: "Rows",
    id: "size",
  },
  {
    accessor: "tablesMedianMs",
    align: "end",
    cell: (value) => `${Number(value).toFixed(3)} ms`,
    header: "tables",
    id: "tables",
  },
  {
    accessor: "referenceMedianMs",
    align: "end",
    cell: (value) => `${Number(value).toFixed(3)} ms`,
    header: "Reference JS",
    id: "reference",
  },
  {
    accessor: "ratio",
    align: "end",
    cell: (value) => `${Number(value).toFixed(2)}×`,
    header: "tables / reference",
    id: "ratio",
  },
];

const comparisonTargetColumns: TableColumnDef<ComparisonTarget>[] = [
  {
    accessor: "library",
    cell: (value, row) => (
      <a href={row.url} rel="noreferrer" target="_blank">
        {String(value)}
      </a>
    ),
    header: "Library",
    id: "library",
    minWidth: 180,
  },
  { accessor: "approach", header: "Approach", id: "approach", minWidth: 260 },
  {
    accessor: "virtualization",
    header: "Virtualization",
    id: "virtualization",
    minWidth: 250,
  },
  {
    accessor: "benchmarkStatus",
    header: "Performance evidence",
    id: "benchmark-status",
    minWidth: 220,
  },
];

const comparisonTargets: ComparisonTarget[] = [
  {
    approach: "Table-owned React components plus headless query/model utilities",
    benchmarkStatus: "Measured on this page",
    library: "@moritzbrantner/tables",
    url: "https://github.com/moritzbrantner/tables",
    virtualization: "Built-in row and optional column virtualization",
  },
  {
    approach: "Headless table state and row models",
    benchmarkStatus: "Pinned harness not added yet",
    library: "TanStack Table",
    url: "https://tanstack.com/table/latest/docs/overview",
    virtualization: "Composed with a virtualization library such as TanStack Virtual",
  },
  {
    approach: "Integrated React data grid",
    benchmarkStatus: "Pinned harness not added yet",
    library: "AG Grid Community",
    url: "https://www.ag-grid.com/react-data-grid/getting-started/",
    virtualization: "Built-in row and column DOM virtualization",
  },
  {
    approach: "Integrated Material UI data grid",
    benchmarkStatus: "Pinned harness not added yet",
    library: "MUI X Data Grid Community",
    url: "https://mui.com/x/react-data-grid/",
    virtualization: "Built-in row and column virtualization",
  },
];

const queryColumns: TableDataColumn<BenchmarkRow>[] = [
  { accessor: "id", id: "id", type: "number" },
  { accessor: "name", id: "name", type: "string" },
  { accessor: "region", id: "region", type: "string" },
  { accessor: "stage", id: "stage", type: "string" },
  { accessor: "value", id: "value", type: "number" },
];

function BenchmarksPage() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [reportError, setReportError] = useState(false);
  const [browserResults, setBrowserResults] = useState<BrowserComparisonResult[]>([]);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("./benchmarks/query.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<BenchmarkReport>;
      })
      .then((nextReport) => {
        if (!cancelled) setReport(nextReport);
      })
      .catch(() => {
        if (!cancelled) setReportError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const environment = useMemo(() => {
    if (!report) return null;
    const parts = [
      report.environment.platform,
      report.environment.arch,
      report.environment.cpuModel,
      report.environment.bun ? `Bun ${report.environment.bun}` : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [report]);

  const runBrowserComparison = () => {
    setRunning(true);
    setBrowserError(null);
    window.setTimeout(() => {
      try {
        setBrowserResults(runQuickComparison());
      } catch (error) {
        setBrowserError(error instanceof Error ? error.message : String(error));
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="site-header__brand" href="./">
          @moritzbrantner/tables
        </a>
        <ExampleNav page="benchmarks" />
      </header>

      <ViewHeader
        className="hero"
        description="Performance evidence is kept reproducible and scoped. CI captures the repository benchmark suite; the browser comparison runs both implementations on your current device."
        eyebrow="Evidence"
        title="Benchmarks"
      />

      <div className="content-grid benchmark-grid">
        <TablePanel
          title="Latest Pages CI query benchmark"
          description="One warm-up and five timed samples per workload. The table shows the median and the individual samples captured by the Pages deployment runner."
        >
          {report ? (
            <>
              <p className="benchmark-environment">{environment}</p>
              <Table
                ariaLabel="Latest CI query benchmark results"
                columns={benchmarkColumns}
                density="compact"
                rowKey={(row) => `${row.workload}-${row.size}`}
                rows={report.results}
              />
              <p className="benchmark-footnote">
                {report.methodology.timing}. Sample count: {report.methodology.sampleCount}.
              </p>
            </>
          ) : reportError ? (
            <Alert>
              <AlertDescription>
                The generated CI snapshot is not available in this local build. GitHub Pages adds it after the site build by running the repository benchmark script.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="benchmark-footnote">Loading benchmark evidence…</p>
          )}
        </TablePanel>

        <TablePanel
          title="Same-browser quick comparison"
          description="This compares the table query model with an equivalent plain-JavaScript filter and stable multi-column sort on the same generated rows. It is a local reference, not a universal ranking."
        >
          <div className="benchmark-actions">
            <Button disabled={running} onClick={runBrowserComparison}>
              {running ? "Running…" : "Run in this browser"}
            </Button>
            <span>5 timed samples after warm-up · 1k, 10k, and 50k rows</span>
          </div>
          {browserError ? (
            <Alert>
              <AlertDescription>{browserError}</AlertDescription>
            </Alert>
          ) : null}
          {browserResults.length > 0 ? (
            <>
              <Table
                ariaLabel="Same-browser query comparison"
                columns={browserComparisonColumns}
                density="compact"
                rowKey="size"
                rows={browserResults}
              />
              <p className="benchmark-footnote">
                A ratio below 1.00 means the tables query completed faster in this run; above 1.00 means the reference JavaScript completed faster. Re-run before drawing conclusions from small deltas.
              </p>
            </>
          ) : null}
        </TablePanel>

        <TablePanel
          title="Comparable implementations"
          description="These are useful architectural comparison targets. Performance numbers stay blank until the repository owns a version-pinned, same-workload harness for them."
        >
          <Table
            ariaLabel="Comparable React table implementations"
            columns={comparisonTargetColumns}
            density="compact"
            rowKey="library"
            rows={comparisonTargets}
          />
          <p className="benchmark-footnote">
            This avoids mixing vendor demos, different machines, different row models, or feature sets into a misleading leaderboard.
          </p>
        </TablePanel>
      </div>
    </main>
  );
}

function runQuickComparison(): BrowserComparisonResult[] {
  return [1_000, 10_000, 50_000].map((size) => {
    const rows = createRows(size);
    const tablesOperation = () =>
      createTableModel({
        columns: queryColumns,
        filter: {
          columnFilters: [{ columnId: "stage", operator: "equals", value: "Proposal" }],
          query: "account",
        },
        rows,
        sort: [
          { columnId: "region", direction: "asc" },
          { columnId: "value", direction: "desc" },
        ],
      }).rows;
    const referenceOperation = () => referenceQuery(rows);

    const tableParity = tablesOperation();
    const referenceParity = referenceOperation();
    if (tableParity.length !== referenceParity.length) {
      throw new Error(`Benchmark parity failed at ${size.toLocaleString()} rows.`);
    }

    const tablesMedianMs = measureMedian(tablesOperation);
    const referenceMedianMs = measureMedian(referenceOperation);
    return {
      referenceMedianMs,
      ratio: referenceMedianMs === 0 ? 0 : round(tablesMedianMs / referenceMedianMs),
      size,
      tablesMedianMs,
    };
  });
}

function referenceQuery(rows: readonly BenchmarkRow[]) {
  return rows
    .filter((row) => row.stage === "Proposal" && row.name.toLowerCase().includes("account"))
    .toSorted((left, right) => {
      const region = left.region.localeCompare(right.region);
      return region || right.value - left.value;
    });
}

function measureMedian(operation: () => unknown) {
  operation();
  const samples = Array.from({ length: 5 }, () => {
    const start = performance.now();
    operation();
    return performance.now() - start;
  }).sort((left, right) => left - right);
  return round(samples[Math.floor(samples.length / 2)] ?? 0);
}

function createRows(size: number): BenchmarkRow[] {
  const regions = ["Europe", "North America", "Asia Pacific", "Latin America"];
  const stages = ["Discovery", "Proposal", "Review", "Closed"];
  return Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    name: `Account ${index % 2_000}`,
    region: regions[index % regions.length] ?? "Europe",
    stage: stages[(index * 7) % stages.length] ?? "Discovery",
    value: (index * 7_919) % 100_000,
  }));
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <BenchmarksPage />
  </StrictMode>,
);
