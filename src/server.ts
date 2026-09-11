import type { TableSortState, TableState } from "./data";
import {
  createDefaultTableViewState,
  encodeTableViewState,
  tableStateToViewState,
  type TableViewFilter,
} from "./view-state";

export const TABLE_SERVER_REQUEST_VERSION = 1 as const;

export type TableServerWindow = {
  limit: number;
  offset: number;
};

export type TableServerRequest = {
  filter: TableViewFilter | null;
  sort: TableSortState;
  version: typeof TABLE_SERVER_REQUEST_VERSION;
  window: TableServerWindow;
};

export type TableServerWindowResult<TRow> = {
  filteredRowCount?: number;
  rowIndexOffset: number;
  rows: readonly TRow[];
  sortedRowCount?: number;
  totalRowCount: number;
};

export function createTableServerRequest<TRow>(
  state: TableState<TRow>,
  window: TableServerWindow,
): TableServerRequest {
  const viewState = tableStateToViewState(state);

  return {
    filter: viewState.filter,
    sort: viewState.sort.map((rule) => ({ ...rule })),
    version: TABLE_SERVER_REQUEST_VERSION,
    window: normalizeTableServerWindow(window),
  };
}

export function encodeTableServerRequest(request: TableServerRequest): string {
  const viewState = createDefaultTableViewState();
  viewState.filter = request.filter;
  viewState.sort = request.sort.map((rule) => ({ ...rule }));

  return JSON.stringify({
    state: encodeTableViewState(viewState),
    version: TABLE_SERVER_REQUEST_VERSION,
    window: normalizeTableServerWindow(request.window),
  });
}

export function createTableServerQueryKey<TRow>(
  state: TableState<TRow>,
  window: TableServerWindow,
): readonly ["table-server-v1", string] {
  return [
    "table-server-v1",
    encodeTableServerRequest(createTableServerRequest(state, window)),
  ] as const;
}

export function normalizeTableServerWindow(window: TableServerWindow): TableServerWindow {
  return {
    limit: Math.max(1, Math.trunc(Number.isFinite(window.limit) ? window.limit : 1)),
    offset: Math.max(0, Math.trunc(Number.isFinite(window.offset) ? window.offset : 0)),
  };
}
