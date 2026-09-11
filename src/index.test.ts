import { describe, expect, test } from "vitest";

import * as publicApi from "./index";

const expectedRuntimeExports = [
  "DataTable",
  "TABLE_SERVER_REQUEST_VERSION",
  "TABLE_VIEW_STATE_VERSION",
  "Table",
  "VirtualTable",
  "applyTableFilter",
  "applyTableSort",
  "compareTableValues",
  "createDefaultTableState",
  "createDefaultTableViewState",
  "createTableColumnDefHelper",
  "createTableColumnHelper",
  "createTableModel",
  "createTableServerQueryKey",
  "createTableServerRequest",
  "decodeTableViewState",
  "defaultTableMessages",
  "encodeTableServerRequest",
  "encodeTableViewState",
  "getColumnValue",
  "getFixedVirtualRange",
  "getNextSortState",
  "getOffsets",
  "getVariableVirtualRange",
  "hasControlledStateKey",
  "mergeControlledTableState",
  "normalizeTableServerWindow",
  "tableStateToViewState",
  "updateTableState",
  "viewStateToTableState",
];

describe("public package root", () => {
  test("exports the reviewed runtime surface", () => {
    expect(Object.keys(publicApi).sort()).toEqual([...expectedRuntimeExports].sort());
  });
});
