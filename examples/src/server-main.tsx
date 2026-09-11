import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  VirtualTable,
  applyTableFilter,
  applyTableSort,
  createDefaultTableState,
  createTableServerQueryKey,
  type TableFilter,
  type TableState,
} from "@moritzbrantner/tables";
import "../../styles.css";
import "./styles.css";

import { pipelineColumns } from "./playground/columns";
import { createPipelineRows } from "./playground/data";
import type { PipelineRow } from "./playground/model";

const pageSize = 20;

function ServerWorkflowExample() {
  const sourceRows = useMemo(() => createPipelineRows(240), []);
  const [state, setState] = useState<TableState<PipelineRow>>(() =>
    createDefaultTableState<PipelineRow>(),
  );
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const serverResult = useMemo(() => {
    const filteredRows = state.filter
      ? applyTableFilter(sourceRows, pipelineColumns, state.filter)
      : [...sourceRows];
    const sortedRows = applyTableSort(filteredRows, pipelineColumns, state.sort);

    return {
      filteredRowCount: filteredRows.length,
      rows: sortedRows.slice(offset, offset + pageSize),
      sortedRowCount: sortedRows.length,
      totalRowCount: sourceRows.length,
    };
  }, [offset, sourceRows, state.filter, state.sort]);

  const queryKey = createTableServerQueryKey(state, { limit: pageSize, offset });
  const currentStart = serverResult.rows.length > 0 ? offset + 1 : 0;
  const currentEnd = offset + serverResult.rows.length;
  const canGoBack = offset > 0;
  const canGoForward = currentEnd < serverResult.sortedRowCount;

  const updateQuery = (query: string) => {
    const filter: TableFilter<PipelineRow> | null = query.trim() ? { query } : null;
    setOffset(0);
    setState((current) => ({ ...current, filter }));
  };

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="site-header__brand" href="./">@moritzbrantner/tables</a>
        <a href="./">Back to examples</a>
      </header>

      <section className="hero" data-testid="server-workflow">
        <p>Server/manual workflow</p>
        <h1>External query ownership</h1>
        <p>
          The package emits table state and derives a deterministic query key. This example's local
          adapter stands in for a server; fetching remains outside the table package.
        </p>
      </section>

      <section className="table-panel">
        <div className="table-toolbar">
          <label className="search-control">
            <span>Search server rows</span>
            <input
              aria-label="Search server rows"
              onChange={(event) => updateQuery(event.currentTarget.value)}
              placeholder="Account, owner, region..."
              value={state.filter?.query ?? ""}
            />
          </label>
          <button onClick={() => setRefreshing((current) => !current)} type="button">
            {refreshing ? "Finish refresh" : "Simulate refresh"}
          </button>
        </div>

        <p aria-live="polite" data-testid="server-window-status">
          {refreshing ? "Refreshing while the current server window remains mounted. " : ""}
          Showing rows {currentStart}–{currentEnd} of {serverResult.sortedRowCount} matching rows
          ({serverResult.totalRowCount} total source rows).
        </p>
        <p>
          Query key: <code data-testid="server-query-key">{JSON.stringify(queryKey)}</code>
        </p>

        <VirtualTable
          ariaLabel="Server-driven pipeline table"
          columnMenu
          columns={pipelineColumns}
          filteredRowCount={serverResult.filteredRowCount}
          height={520}
          loading={refreshing}
          loadingState="Refreshing server rows; current rows remain visible"
          mode="manual"
          onStateChange={({ state: nextState, type }) => {
            if (type === "filter" || type === "sort") {
              setOffset(0);
            }
            setState(nextState);
          }}
          rowKey="id"
          rows={serverResult.rows}
          sortedRowCount={serverResult.sortedRowCount}
          state={state}
          totalRowCount={serverResult.sortedRowCount}
        />

        <div className="table-toolbar">
          <button
            disabled={!canGoBack}
            onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
            type="button"
          >
            Previous window
          </button>
          <button
            disabled={!canGoForward}
            onClick={() => setOffset((current) => current + pageSize)}
            type="button"
          >
            Next window
          </button>
        </div>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <ServerWorkflowExample />
  </StrictMode>,
);
