import { useCallback, useMemo, useState } from "react";

import {
  Alert,
  AlertDescription,
  DescriptionList,
  DescriptionListDetail,
  DescriptionListItem,
  DescriptionListTerm,
  Empty,
  EmptyDescription,
  EmptyHeader,
  Label,
  MetricStrip,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
  ViewHeader,
} from "../demo-ui";
import { SearchField } from "../demo-ui";
import {
  DataTable,
  VirtualTable,
  type TableFilter,
  type TableModel,
} from "@moritzbrantner/tables";
import "../../../styles.css";

import { auditColumns, customerColumns, pipelineColumns } from "./columns";
import {
  createAuditRows,
  createCustomerRows,
  createPipelineRows,
  formatCompact,
  formatCurrency,
  formatDate,
  formatPercent,
} from "./data";
import { ExampleNav } from "./example-nav";
import { getExamplePage } from "./example-routing";
import { TablePanel } from "./table-panel";
import type { AuditRow, CustomerRow, PipelineRow, TableDensity } from "./model";

export function App() {
  const page = getExamplePage();
  const pipelineRows = useMemo(() => createPipelineRows(50000), []);
  const denseRows = useMemo(() => createPipelineRows(100000), []);
  const customerRows = useMemo(() => createCustomerRows(25000), []);
  const auditRows = useMemo(() => createAuditRows(36), []);
  const [pipelineFilter, setPipelineFilter] = useState<TableFilter<PipelineRow> | null>({
    query: "",
  });
  const [customerFilter, setCustomerFilter] = useState<TableFilter<CustomerRow> | null>({
    query: "",
  });
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const [selectedPipelineRow, setSelectedPipelineRow] = useState<PipelineRow | null>(
    pipelineRows[0] ?? null,
  );
  const [selectedAuditRow, setSelectedAuditRow] = useState<AuditRow | null>(auditRows[0] ?? null);
  const [visibleRows, setVisibleRows] = useState(pipelineRows.length);
  const rowHeight = density === "compact" ? 36 : 44;
  const handleModelChange = useCallback((model: TableModel<PipelineRow>) => {
    setVisibleRows(model.rows.length);
  }, []);
  const heroDataset =
    page === "wide" ? "Customer accounts" : page === "states" ? "Audit events" : "Pipeline";
  const heroRows =
    page === "dense"
      ? denseRows.length
      : page === "wide"
        ? customerRows.length
        : page === "states"
          ? auditRows.length
          : pipelineRows.length;
  const heroMetrics = useMemo(
    () => [
      { id: "rows", label: "Rows", value: formatCompact(heroRows) },
      { id: "dataset", label: "Dataset", value: heroDataset },
      { id: "density", label: "Density", value: density },
      {
        id: "visible",
        label: "Visible",
        value: formatCompact(page === "examples" ? visibleRows : heroRows),
      },
    ],
    [density, heroDataset, heroRows, page, visibleRows],
  );

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="site-header__brand" href="./">
          @moritzbrantner/tables
        </a>
        <ExampleNav page={page} />
      </header>

      <ViewHeader
        className="hero"
        data-testid="examples-hero"
        description="Virtualized React tables for large operational datasets, typed columns, and explicit data workflows."
        eyebrow="Examples"
        title="@moritzbrantner/tables"
      >
        <MetricStrip className="hero__metrics" items={heroMetrics} />
      </ViewHeader>

      <div className="content-grid">
        {page === "dense" ? (
          <DenseDataPage
            denseRows={denseRows}
            filter={pipelineFilter}
            setFilter={setPipelineFilter}
          />
        ) : page === "wide" ? (
          <WideTablePage
            customerRows={customerRows}
            filter={customerFilter}
            setFilter={setCustomerFilter}
          />
        ) : page === "states" ? (
          <StatesPage
            auditRows={auditRows}
            selectedAuditRow={selectedAuditRow}
            setSelectedAuditRow={setSelectedAuditRow}
          />
        ) : (
          <OverviewPage
            density={density}
            onDensityChange={setDensity}
            onModelChange={handleModelChange}
            filter={pipelineFilter}
            rowHeight={rowHeight}
            rows={pipelineRows}
            selectedRow={selectedPipelineRow}
            setFilter={setPipelineFilter}
            setSelectedRow={setSelectedPipelineRow}
          />
        )}
      </div>
    </main>
  );
}

function OverviewPage({
  density,
  filter,
  onDensityChange,
  onModelChange,
  rowHeight,
  rows,
  selectedRow,
  setFilter,
  setSelectedRow,
}: {
  density: TableDensity;
  filter: TableFilter<PipelineRow> | null;
  onDensityChange: (density: TableDensity) => void;
  onModelChange: (model: TableModel<PipelineRow>) => void;
  rowHeight: number;
  rows: PipelineRow[];
  selectedRow: PipelineRow | null;
  setFilter: (filter: TableFilter<PipelineRow> | null) => void;
  setSelectedRow: (row: PipelineRow) => void;
}) {
  return (
    <>
      <Toolbar className="table-toolbar" justify="between">
        <ToolbarGroup className="table-toolbar__search">
          <SearchControl
            label="Search pipeline"
            onChange={(query) => setFilter(updateFilterQuery(filter, query))}
            placeholder="Account, owner, region..."
            value={filter?.query ?? ""}
          />
        </ToolbarGroup>
        <ToolbarSpacer />
        <ToolbarGroup>
          <DensityControl onChange={onDensityChange} value={density} />
        </ToolbarGroup>
      </Toolbar>

      <div className="split-layout">
        <TablePanel
          title="Pipeline overview"
          description="A 50,000-row sales pipeline with typed columns, virtual rows, filtering, sortable headers, and multi-row selection."
        >
          <VirtualTable
            ariaLabel="Pipeline overview"
            columnMenu
            columnResizing
            columns={pipelineColumns}
            height="min(620px, calc(100vh - 270px))"
            onModelChange={onModelChange}
            onRowClick={setSelectedRow}
            onStateChange={({ state }) => setFilter(state.filter)}
            rowHeight={rowHeight}
            rowKey="id"
            rows={rows}
            selectionMode="multiple"
            state={{ filter }}
          />
        </TablePanel>

        <TablePanel
          title="Selected row"
          description="Click to select. Ctrl/Cmd-click toggles rows; Shift-click selects a range."
        >
          <PipelineDetails row={selectedRow} />
        </TablePanel>
      </div>
    </>
  );
}

function DenseDataPage({
  denseRows,
  filter,
  setFilter,
}: {
  denseRows: PipelineRow[];
  filter: TableFilter<PipelineRow> | null;
  setFilter: (filter: TableFilter<PipelineRow> | null) => void;
}) {
  return (
    <>
      <Toolbar className="table-toolbar" justify="between">
        <ToolbarGroup className="table-toolbar__search">
          <SearchControl
            label="Search dense rows"
            onChange={(query) => setFilter(updateFilterQuery(filter, query))}
            placeholder="Account, owner, segment..."
            value={filter?.query ?? ""}
          />
        </ToolbarGroup>
      </Toolbar>
      <TablePanel
        title="Dense operational data"
        description="A compact 100,000-row table for scanning, filtering, sorting, and multi-row selection."
      >
        <DataTable
          ariaLabel="Dense pipeline table"
          columnMenu
          columnResizing
          columns={pipelineColumns}
          density="compact"
          height="min(680px, calc(100vh - 250px))"
          onStateChange={({ state }) => setFilter(state.filter)}
          rowKey="id"
          rows={denseRows}
          selectionMode="multiple"
          state={{ filter }}
        />
      </TablePanel>
    </>
  );
}

function WideTablePage({
  customerRows,
  filter,
  setFilter,
}: {
  customerRows: CustomerRow[];
  filter: TableFilter<CustomerRow> | null;
  setFilter: (filter: TableFilter<CustomerRow> | null) => void;
}) {
  return (
    <>
      <Toolbar className="table-toolbar" justify="between">
        <ToolbarGroup className="table-toolbar__search">
          <SearchControl
            label="Search customers"
            onChange={(query) => setFilter(updateFilterQuery(filter, query))}
            placeholder="Account, owner, plan..."
            value={filter?.query ?? ""}
          />
        </ToolbarGroup>
      </Toolbar>
      <TablePanel
        title="Wide customer table"
        description="Customer operations often span many fields; this view keeps horizontal scanning responsive."
      >
        <Alert className="table-note">
          <AlertDescription>
            Scroll across accounts, usage, revenue, ownership, renewal, and support columns.
          </AlertDescription>
        </Alert>
        <VirtualTable
          ariaLabel="Wide customer table"
          columnMenu
          columnResizing
          columnVirtualization
          columns={customerColumns}
          height="min(680px, calc(100vh - 290px))"
          onStateChange={({ state }) => setFilter(state.filter)}
          rowKey="id"
          rows={customerRows}
          selectionMode="multiple"
          state={{ filter }}
        />
      </TablePanel>
    </>
  );
}

function StatesPage({
  auditRows,
  selectedAuditRow,
  setSelectedAuditRow,
}: {
  auditRows: AuditRow[];
  selectedAuditRow: AuditRow | null;
  setSelectedAuditRow: (row: AuditRow) => void;
}) {
  return (
    <div className="states-grid">
      <TablePanel
        title="Loading"
        description="The table can keep its structure visible while rows are being refreshed."
      >
        <VirtualTable
          ariaLabel="Loading audit table"
          columns={auditColumns}
          height={260}
          loading
          loadingState="Loading audit events"
          rowKey="id"
          rows={auditRows.slice(0, 8)}
        />
      </TablePanel>

      <TablePanel
        title="Empty"
        description="Empty states can be supplied by the host application."
      >
        <VirtualTable
          ariaLabel="Empty audit table"
          columns={auditColumns}
          emptyState="No audit events match the current filters"
          height={260}
          rowKey="id"
          rows={[]}
        />
      </TablePanel>

      <TablePanel
        title="Row details"
        description="Clickable rows expose the selected record without changing table internals."
      >
        <VirtualTable
          ariaLabel="Interactive audit table"
          columns={auditColumns}
          height={300}
          onRowClick={setSelectedAuditRow}
          rowKey="id"
          rows={auditRows}
          selectionMode="single"
        />
        <AuditDetails row={selectedAuditRow} />
      </TablePanel>
    </div>
  );
}

function SearchControl({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="search-control">
      <Label>{label}</Label>
      <SearchField
        inputProps={{ "aria-label": label }}
        onValueChange={onChange}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function updateFilterQuery<TRow>(
  filter: TableFilter<TRow> | null,
  query: string,
): TableFilter<TRow> | null {
  if (!query.trim() && !filter?.columnFilters?.length) {
    return null;
  }

  return {
    ...(filter ?? {}),
    query,
  };
}

function DensityControl({
  onChange,
  value,
}: {
  onChange: (density: TableDensity) => void;
  value: TableDensity;
}) {
  return (
    <ToggleGroup
      aria-label="Table density"
      className="density-control"
      onValueChange={(nextValue) => {
        if (nextValue) {
          onChange(nextValue as TableDensity);
        }
      }}
      type="single"
      value={value}
      variant="outline"
    >
      {(["comfortable", "compact"] satisfies TableDensity[]).map((density) => (
        <ToggleGroupItem key={density} value={density}>
          {density}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function PipelineDetails({ row }: { row: PipelineRow | null }) {
  if (!row) {
    return <EmptyCard>No row selected.</EmptyCard>;
  }

  return (
    <DescriptionList className="detail-list">
      <Detail label="Account" value={row.account} />
      <Detail label="Owner" value={row.owner} />
      <Detail label="Stage" value={row.stage} />
      <Detail label="Amount" value={formatCurrency(row.amount)} />
      <Detail label="Probability" value={formatPercent(row.probability)} />
      <Detail label="Renewal" value={formatDate(row.renewalDate)} />
    </DescriptionList>
  );
}

function AuditDetails({ row }: { row: AuditRow | null }) {
  if (!row) {
    return <EmptyCard className="detail-list--inline">No audit row selected.</EmptyCard>;
  }

  return (
    <DescriptionList className="detail-list detail-list--inline">
      <Detail label="Resource" value={row.resource} />
      <Detail label="Actor" value={row.actor} />
      <Detail label="Action" value={row.action} />
      <Detail label="Status" value={row.status} />
      <Detail label="Occurred" value={formatDate(row.occurredAt)} />
    </DescriptionList>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <DescriptionListItem>
      <DescriptionListTerm>{label}</DescriptionListTerm>
      <DescriptionListDetail>{value}</DescriptionListDetail>
    </DescriptionListItem>
  );
}

function EmptyCard({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
