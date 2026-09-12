import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  DataTable,
  Table,
  VirtualTable,
  type TableColumnDef,
  type TableFilter,
} from "@moritzbrantner/tables";
import "../../styles.css";
import "../../table.css";
import {
  Label,
  SearchField,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
  ViewHeader,
} from "./demo-ui";
import { customerColumns, pipelineColumns } from "./playground/columns";
import {
  createAuditRows,
  createCustomerRows,
  createPipelineRows,
  formatCurrency,
  formatDate,
} from "./playground/data";
import { ExampleNav } from "./playground/example-nav";
import { updateFilterQuery } from "./playground/filter-query";
import { TablePanel } from "./playground/table-panel";
import type { AuditRow, PipelineRow, TableDensity } from "./playground/model";
import "./styles.css";

const semanticColumns: TableColumnDef<PipelineRow>[] = [
  { accessor: "account", header: "Account", id: "account", minWidth: 180 },
  { accessor: "owner", header: "Owner", id: "owner", minWidth: 140 },
  { accessor: "stage", header: "Stage", id: "stage", minWidth: 120 },
  {
    accessor: "amount",
    align: "end",
    cell: (value) => formatCurrency(Number(value)),
    header: "Amount",
    id: "amount",
    width: 140,
  },
];

const auditColumns: TableColumnDef<AuditRow>[] = [
  { accessor: "occurredAt", cell: (value) => formatDate(value as Date), header: "Time", id: "time" },
  { accessor: "actor", header: "Actor", id: "actor" },
  { accessor: "action", header: "Action", id: "action" },
  { accessor: "status", header: "Status", id: "status" },
];

function VariationsPage() {
  const pipelineRows = useMemo(() => createPipelineRows(5_000), []);
  const customerRows = useMemo(() => createCustomerRows(10_000), []);
  const auditRows = useMemo(() => createAuditRows(12), []);
  const [filter, setFilter] = useState<TableFilter<PipelineRow> | null>(null);
  const [density, setDensity] = useState<TableDensity>("comfortable");

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="site-header__brand" href="./">
          @moritzbrantner/tables
        </a>
        <ExampleNav page="variations" />
      </header>

      <ViewHeader
        className="hero"
        description="See the same table primitives assembled for reports, operational workflows, and wide virtualized datasets. Start with the smallest surface that fits, then add state and interaction only where it pays off."
        eyebrow="Composition gallery"
        title="Table variations"
      />

      <div className="content-grid variations-grid">
        <TablePanel
          title="1. Semantic results table"
          description="Use Table for compact results, reports, benchmark output, and document-flow content. No fixed viewport or grid behavior is required."
        >
          <CompositionList
            items={["Table", "native table semantics", "compact density", "host formatting"]}
          />
          <Table
            ariaLabel="Pipeline result sample"
            columns={semanticColumns}
            density="compact"
            rowKey="id"
            rows={pipelineRows.slice(0, 8)}
            striped
          />
        </TablePanel>

        <TablePanel
          title="2. Searchable operational table"
          description="Compose an application toolbar around DataTable when users need filtering, density controls, selection, resizing, and column menus."
        >
          <CompositionList
            items={["Toolbar", "SearchField", "DataTable", "column menu", "selection", "density"]}
          />
          <Toolbar className="table-toolbar" justify="between">
            <ToolbarGroup className="table-toolbar__search">
              <div className="search-control">
                <Label>Search pipeline</Label>
                <SearchField
                  inputProps={{ "aria-label": "Search pipeline variation" }}
                  onValueChange={(query) =>
                    setFilter((currentFilter) => updateFilterQuery(currentFilter, query))
                  }
                  placeholder="Account, owner, region..."
                  value={filter?.query ?? ""}
                />
              </div>
            </ToolbarGroup>
            <ToolbarSpacer />
            <ToolbarGroup>
              <ToggleGroup
                aria-label="Variation density"
                onValueChange={(value) => {
                  if (value) setDensity(value as TableDensity);
                }}
                type="single"
                value={density}
                variant="outline"
              >
                <ToggleGroupItem value="comfortable">comfortable</ToggleGroupItem>
                <ToggleGroupItem value="compact">compact</ToggleGroupItem>
              </ToggleGroup>
            </ToolbarGroup>
          </Toolbar>
          <DataTable
            ariaLabel="Searchable pipeline variation"
            columnMenu
            columnResizing
            columns={pipelineColumns}
            density={density}
            height={420}
            onStateChange={({ state, type }) => {
              if (type === "filter") setFilter(state.filter);
            }}
            rowKey="id"
            rows={pipelineRows}
            selectionMode="multiple"
            showRowIndex
            state={{ filter }}
          />
        </TablePanel>

        <TablePanel
          title="3. Wide virtualized workspace"
          description="Use VirtualTable directly when row and column virtualization, explicit sizing, and a fixed workspace are the primary constraints."
        >
          <CompositionList
            items={["VirtualTable", "row virtualization", "column virtualization", "resizing", "column menu"]}
          />
          <VirtualTable
            ariaLabel="Wide customer variation"
            columnMenu
            columnResizing
            columnVirtualization
            columns={customerColumns}
            height={460}
            rowKey="id"
            rows={customerRows}
            selectionMode="multiple"
          />
        </TablePanel>

        <TablePanel
          title="4. Lightweight audit report"
          description="The same package can stay intentionally boring for small datasets; virtualization is not the default answer."
        >
          <CompositionList items={["Table", "typed columns", "date formatting", "empty-state ready"]} />
          <Table
            ariaLabel="Audit report variation"
            columns={auditColumns}
            emptyState="No audit events"
            rowKey="id"
            rows={auditRows}
          />
        </TablePanel>
      </div>
    </main>
  );
}

function CompositionList({ items }: { items: readonly string[] }) {
  return (
    <div className="composition-summary" aria-label="Composition">
      <strong>Composed from</strong>
      <span>{items.join(" · ")}</span>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <VariationsPage />
  </StrictMode>,
);
