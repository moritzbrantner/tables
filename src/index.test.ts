import { describe, expect, test } from "vitest";

import * as publicApi from "./index";

const expectedRuntimeExports = [
  "DataTable",
  "Table",
  "VirtualTable",
  "applyTableFilter",
  "applyTableSort",
  "compareTableValues",
  "createDefaultTableState",
  "createTableModel",
  "getColumnValue",
  "getFixedVirtualRange",
  "getNextSortState",
  "getOffsets",
  "getVariableVirtualRange",
  "hasControlledStateKey",
  "mergeControlledTableState",
  "updateTableState",
];

describe("public package root", () => {
  test("exports the reviewed runtime surface", () => {
    expect(Object.keys(publicApi).sort()).toEqual([...expectedRuntimeExports].sort());
  });
});
