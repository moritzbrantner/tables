import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { VirtualTable, type TableColumn } from "@moritzbrantner/tables";
import { loadTableWasmKernel } from "@moritzbrantner/tables/wasm";
import { Button, ViewHeader } from "./demo-ui";
import { ExampleNav } from "./playground/example-nav";
import { TablePanel } from "./playground/table-panel";
import { createWindowedController, type WindowedView } from "./windowed-controller";
import "../../styles.css";
import "./styles.css";
import "./windowed.css";

type Row = { id: number; name: string; value: number };
const rows: Row[] = Array.from({ length: 100000 }, (_, id) => ({ id: id + 1, name: `Account ${id % 2000}`, value: (id * 7919) % 100000 }));
const columns: TableColumn<Row>[] = [
  { id: "id", accessor: "id", header: "ID", type: "number", width: 120 },
  { id: "name", accessor: "name", header: "Account", type: "string", width: 360 },
  { id: "value", accessor: "value", header: "Value", type: "number", width: 180 },
];
const pageSize = 100;
const rowKey = (row: Row) => row.id;
function readLocation(): WindowedView {
  const params = new URLSearchParams(location.search);
  const requested = Number(params.get("offset") ?? 0);
  return { offset: Number.isSafeInteger(requested) && requested >= 0 ? requested : 0,
    query: params.get("query") ?? "", descending: params.get("sort") !== "asc", reuse: params.get("mode") !== "window" };
}
function WindowedPage() {
  const [view, setView] = useState(readLocation);
  const currentView = useRef(view);
  // The controller is cheap and empty until the first command; never prepare a
  // query in render/useMemo or dispose a render-owned handle in effect cleanup.
  const [controller] = useState(() => createWindowedController(rows, columns, pageSize));
  const [result, setResult] = useState<ReturnType<typeof controller.read> | null>(null);
  const [backend, setBackend] = useState("Loading query engine");
  const refresh = useCallback((next: WindowedView) => {
    const page = controller.read(next);
    currentView.current = next;
    setView(next);
    setResult(page);
  }, [controller]);
  useEffect(() => {
    let live = true;
    refresh(currentView.current);
    void loadTableWasmKernel().then((kernel) => {
      if (!live) return;
      controller.dispose(); // Backend activation starts a new explicit lifetime.
      setBackend(kernel ? "Rust/Wasm" : "TypeScript compatibility");
      refresh(currentView.current);
    });
    const onPop = () => refresh(readLocation());
    window.addEventListener("popstate", onPop);
    return () => { live = false; window.removeEventListener("popstate", onPop); controller.dispose(); };
  }, [controller, refresh]);
  const change = (patch: Partial<WindowedView>) => {
    const next = { ...currentView.current, ...patch };
    const params = new URLSearchParams({ offset: String(next.offset), query: next.query,
      sort: next.descending ? "desc" : "asc", mode: next.reuse ? "session" : "window" });
    history.pushState(null, "", `?${params}`);
    refresh(next);
  };
  const model = result?.model;
  return <main className="app-shell windowed-shell">
    <header className="site-header">
      <a className="site-header__brand" href="./">@moritzbrantner/tables</a>
      <ExampleNav page="windowed" />
    </header>
    <ViewHeader className="hero" eyebrow="Bounded transfers" title="Windowed queries"
      description="Browse 100,000 source rows with 100-row transfers. Reuse a prepared result for repeated paging, or choose a lower-memory one-off query." />
    <div className="content-grid windowed-content">
      <TablePanel title="Account results" description="Query ownership stays outside React; only the requested page is rendered.">
        <p className="benchmark-environment" role="status" data-testid="query-backend"
          data-query-revision={result?.revision ?? 0} data-page-reads={result?.pageReads ?? 0}>
          {backend} · {view.reuse ? "prepared query session" : "bounded one-off query"}
        </p>
        <div className="windowed-toolbar">
          <label className="search-control windowed-search">Search accounts
            <input aria-label="Search accounts" className="demo-search-field" value={view.query}
              onChange={(event) => change({ query: event.target.value, offset: 0 })} />
          </label>
          <label className="search-control">Value order
            <select aria-label="Value order" className="demo-select" value={view.descending ? "desc" : "asc"}
              onChange={(event) => change({ descending: event.target.value === "desc", offset: 0 })}>
              <option value="desc">Highest first</option><option value="asc">Lowest first</option>
            </select>
          </label>
          <label className="search-control">Query lifetime
            <select aria-label="Query lifetime" className="demo-select" value={view.reuse ? "session" : "window"}
              onChange={(event) => change({ reuse: event.target.value === "session" })}>
              <option value="session">Prepared session</option><option value="window">One-off window</option>
            </select>
          </label>
          <div className="benchmark-actions">
            <Button disabled={!model || model.rowIndexOffset === 0}
              onClick={() => change({ offset: Math.max(0, (model?.rowIndexOffset ?? 0) - pageSize) })}>Previous page</Button>
            <Button disabled={!model || model.rowIndexOffset + model.rows.length >= model.filteredRowCount}
              onClick={() => change({ offset: (model?.rowIndexOffset ?? 0) + pageSize })}>Next page</Button>
          </div>
        </div>
        {model && <>
          <p className="windowed-count" data-testid="window-count">{model.rows.length} returned · {model.filteredRowCount.toLocaleString()} matching · offset {model.rowIndexOffset.toLocaleString()}</p>
          <VirtualTable ariaLabel="Windowed account results" columns={columns} rows={model.rows} rowKey={rowKey} mode="manual" height={440} rowHeight={32}
            totalRowCount={model.totalRowCount} filteredRowCount={model.filteredRowCount} sortedRowCount={model.sortedRowCount} rowIndexOffset={model.rowIndexOffset} />
        </>}
        <p className="benchmark-footnote">{view.reuse
          ? "Prepared sessions retain the complete matching order once. Page changes do not scan or sort again; changing the query or sort replaces and disposes that result."
          : "One-off windows avoid retaining a full result. Filtering and selection run for each page request."} Counts and row positions remain global. URL parameters retain all controls.</p>
      </TablePanel>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><WindowedPage /></StrictMode>);
