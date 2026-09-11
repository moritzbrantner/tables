import { describe, expect, it } from "vitest";

import { createDefaultTableState, type TableState } from "./data";
import {
  createTableServerQueryKey,
  createTableServerRequest,
  normalizeTableServerWindow,
} from "./server";

type Row = {
  id: number;
  name: string;
};

describe("table server requests", () => {
  it("derives the request only from server-owned query state and the requested window", () => {
    const state = createDefaultTableState<Row>({
      columnOrder: ["name", "id"],
      columnSizing: { name: 320 },
      columnVisibility: { id: false },
      filter: {
        predicate: (row) => row.id > 0,
        query: "café",
      },
      selection: { selectedRowKeys: [42] },
      sort: [{ columnId: "name", direction: "asc" }],
    });

    expect(createTableServerRequest(state, { limit: 25, offset: 50 })).toEqual({
      filter: { query: "café" },
      sort: [{ columnId: "name", direction: "asc" }],
      version: 1,
      window: { limit: 25, offset: 50 },
    });
  });

  it("keeps query keys stable when only display or selection state changes", () => {
    const first = createDefaultTableState<Row>({
      filter: { query: "north" },
      sort: [{ columnId: "name", direction: "desc" }],
    });
    const second: TableState<Row> = {
      ...first,
      columnOrder: ["name"],
      columnSizing: { name: 480 },
      columnVisibility: { id: false },
      selection: { selectedRowKeys: [7] },
    };

    expect(createTableServerQueryKey(first, { limit: 20, offset: 40 })).toEqual(
      createTableServerQueryKey(second, { limit: 20, offset: 40 }),
    );
  });

  it("normalizes invalid windows deterministically", () => {
    expect(normalizeTableServerWindow({ limit: Number.POSITIVE_INFINITY, offset: -3.8 })).toEqual({
      limit: 1,
      offset: 0,
    });
  });
});
