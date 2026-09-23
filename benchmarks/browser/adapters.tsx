import { useLayoutEffect, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi } from "ag-grid-community";
import { DataGrid, gridFilteredSortedRowIdsSelector, useGridApiRef, type GridColDef } from "@mui/x-data-grid";
import { VirtualTable } from "../../src/react";
import { createTableWindowModel } from "../../src/query-window";
import type { TableColumn } from "../../src/react-column";
import type { Query, Row, Scope, Provider } from "./fixture";
import { pageSize } from "./fixture";

ModuleRegistry.registerModules([AllCommunityModule]);
export type Snapshot = { ids: number[]; count: number };
export type Probe = { ready: Promise<void>; snapshot: () => Snapshot };
export type AdapterProps = {
  rows: Row[]; query: Query; scope: Scope; probe: (value: Probe) => void;
};
const keys = ["id", "name", "bucket", "value"] as const;
const tableColumns: TableColumn<Row>[] = keys.map((id) => ({ id, accessor: id, header: id, width: id === "name" ? 320 : 160, type: id === "name" ? "string" : "number" }));
const agColumns: ColDef<Row>[] = keys.map((field) => ({ field, width: field === "name" ? 320 : 160, filter: field === "name" ? "agTextColumnFilter" : false, sortable: true }));
const muiColumns: GridColDef<Row>[] = keys.map((field) => ({ field, width: field === "name" ? 320 : 160, type: field === "name" ? "string" : "number" }));
const getRowKey = (row: Row) => row.id;
const theme = themeQuartz.withParams({ rowHeight: 32, headerHeight: 40 });

export function Adapter({ provider, ...props }: AdapterProps & { provider: Provider }) {
  if (provider === "ag-grid") return <AgAdapter {...props} />;
  if (provider === "mui") return <MuiAdapter {...props} />;
  return <TablesAdapter {...props} />;
}

function TablesAdapter({ rows, query, scope, probe }: AdapterProps) {
  const model = useMemo(() => createTableWindowModel({
    rows, columns: tableColumns,
    filter: scope === "client" ? { query: query.query, queryColumnIds: ["name"] } : null,
    sort: scope === "client" && query.descending !== null ? [{ columnId: "value", direction: query.descending ? "desc" : "asc" }] : [],
    window: { offset: scope === "client" ? query.page * pageSize : 0, limit: pageSize },
  }), [rows, query, scope]);
  useLayoutEffect(() => probe({ ready: Promise.resolve(), snapshot: () => ({ ids: model.rows.map(getRowKey), count: model.filteredRowCount }) }), [model, probe]);
  return <VirtualTable columns={tableColumns} rows={model.rows} rowKey={getRowKey} mode="manual"
    ariaLabel="Tables reference grid" height={400} rowHeight={32} overscan={4}
    rowIndexOffset={model.rowIndexOffset} totalRowCount={model.totalRowCount}
    filteredRowCount={model.filteredRowCount} sortedRowCount={model.sortedRowCount} />;
}

function AgAdapter({ rows, query, scope, probe }: AdapterProps) {
  const api = useRef<GridApi<Row> | null>(null);
  const previous = useRef({ filter: "", descending: null as boolean | null });
  const apply = () => {
    const grid = api.current;
    if (!grid) return;
    const filter = scope === "client" ? query.query : "";
    const descending = scope === "client" ? query.descending : null;
    // Applying a page must not force a fresh filter/sort in the reference grid.
    // Only changed commands are sent, just as controlled React props are reused.
    const filterChanged = previous.current.filter !== filter;
    const sortChanged = previous.current.descending !== descending;
    previous.current = { filter, descending };
    const filterReady = filterChanged ? grid.setColumnFilterModel("name", filter
      ? { filterType: "text", type: "contains", filter } : null) : Promise.resolve();
    const ready = filterReady.then(() => {
      if (grid.isDestroyed()) return;
      if (filterChanged) grid.onFilterChanged();
      if (sortChanged) grid.applyColumnState({ state: [{ colId: "value", sort: descending === null ? null : descending ? "desc" : "asc" }], defaultState: { sort: null } });
      grid.paginationGoToPage(scope === "client" ? query.page : 0);
    });
    probe({ ready, snapshot: () => {
      const ordered: number[] = [];
      grid.forEachNodeAfterFilterAndSort((node) => { if (node.data) ordered.push(node.data.id); });
      const offset = scope === "client" ? query.page * pageSize : 0;
      return { ids: ordered.slice(offset, offset + pageSize), count: ordered.length };
    } });
  };
  useLayoutEffect(apply, [rows, query, scope, probe]);
  return <AgGridReact<Row> rowData={rows} columnDefs={agColumns} theme={theme}
    getRowId={(params) => String(params.data.id)} pagination paginationPageSize={pageSize}
    paginationPageSizeSelector={false} suppressPaginationPanel animateRows={false}
    rowBuffer={4} rowHeight={32} headerHeight={40}
    onGridReady={(event) => { api.current = event.api; apply(); }} />;
}

function MuiAdapter({ rows, query, scope, probe }: AdapterProps) {
  const api = useGridApiRef();
  const filterModel = useMemo(() => ({ items: scope === "client" && query.query
    ? [{ id: 1, field: "name", operator: "contains", value: query.query }] : [] }), [scope, query.query]);
  const sortModel = useMemo(() => scope === "client" && query.descending !== null
    ? [{ field: "value", sort: query.descending ? "desc" as const : "asc" as const }] : [], [scope, query.descending]);
  const paginationModel = useMemo(() => ({ page: scope === "client" ? query.page : 0, pageSize }), [scope, query.page]);
  useLayoutEffect(() => probe({ ready: Promise.resolve(), snapshot: () => {
    const ordered = gridFilteredSortedRowIdsSelector(api);
    const offset = scope === "client" ? query.page * pageSize : 0;
    return { ids: ordered.slice(offset, offset + pageSize).map(Number), count: ordered.length };
  } }), [rows, query, scope, probe, api]);
  return <DataGrid<Row> apiRef={api} rows={rows} columns={muiColumns} rowHeight={32} columnHeaderHeight={40}
    filterModel={filterModel} sortModel={sortModel} paginationModel={paginationModel}
    pageSizeOptions={[pageSize]} hideFooter disableRowSelectionOnClick disableColumnMenu
    rowBufferPx={128} sx={{ height: 400 }} />;
}
