import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { VirtualTable, createTableWindowModel, type TableColumn } from "@moritzbrantner/tables";
import { loadTableWasmKernel } from "@moritzbrantner/tables/wasm";
import { Button, ViewHeader } from "./demo-ui";
import { ExampleNav } from "./playground/example-nav";
import { TablePanel } from "./playground/table-panel";
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
function readLocation() {
  const params = new URLSearchParams(location.search);
  const requested = Number(params.get("offset") ?? 0);
  return { offset: Number.isSafeInteger(requested) && requested >= 0 ? requested : 0,
    query: params.get("query") ?? "", descending: params.get("sort") !== "asc" };
}
function WindowedPage() {
  const [view, setView] = useState(readLocation);
  const [backend, setBackend] = useState("Loading Rust/Wasm");
  useEffect(() => {
    let live = true;
    void loadTableWasmKernel().then((kernel) => { if (live) setBackend(kernel ? "Rust/Wasm · bounded query result" : "TypeScript fallback · full query then slice"); });
    const onPop = () => setView(readLocation());
    window.addEventListener("popstate", onPop);
    return () => { live = false; window.removeEventListener("popstate", onPop); };
  }, []);
  // Query changes and kernel activation both render this page.
  const model = createTableWindowModel({ rows, columns,
    filter: { query: view.query, queryColumnIds: ["name"] },
    sort: [{ columnId: "value", direction: view.descending ? "desc" : "asc" }],
    window: { offset: view.offset, limit: pageSize },
  });
  const change = (patch: Partial<typeof view>) => {
    const next = { ...view, ...patch };
    const params = new URLSearchParams({ offset: String(next.offset), query: next.query, sort: next.descending ? "desc" : "asc" });
    history.pushState(null, "", `?${params}`);
    setView(next);
  };
  return <main className="app-shell windowed-shell">
    <header className="site-header">
      <a className="site-header__brand" href="./">@moritzbrantner/tables</a>
      <ExampleNav page="windowed" />
    </header>
    <ViewHeader className="hero" eyebrow="Bounded results" title="Windowed queries"
      description="Filter and sort 100,000 source rows while transferring only the requested 100-row result window." />
    <div className="content-grid windowed-content">
      <TablePanel title="Account results" description="Query the complete dataset, then render only the requested page.">
        <p className="benchmark-environment" role="status" data-testid="query-backend">{backend}</p>
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
          <div className="benchmark-actions">
            <Button disabled={model.rowIndexOffset === 0}
              onClick={() => change({ offset: Math.max(0, model.rowIndexOffset - pageSize) })}>Previous page</Button>
            <Button disabled={model.rowIndexOffset + model.rows.length >= model.filteredRowCount}
              onClick={() => change({ offset: model.rowIndexOffset + pageSize })}>Next page</Button>
          </div>
        </div>
        <p className="windowed-count" data-testid="window-count">{model.rows.length} returned · {model.filteredRowCount.toLocaleString()} matching · offset {model.rowIndexOffset.toLocaleString()}</p>
        <VirtualTable ariaLabel="Windowed account results" columns={columns} rows={model.rows} rowKey={rowKey} mode="manual" height={440} rowHeight={32}
          totalRowCount={model.totalRowCount} filteredRowCount={model.filteredRowCount} sortedRowCount={model.sortedRowCount} rowIndexOffset={model.rowIndexOffset} />
        <p className="benchmark-footnote">Counts refer to the full matching dataset. Row positions remain global. URL parameters retain the query, sort direction and result offset.</p>
      </TablePanel>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<WindowedPage />);
