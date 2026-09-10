import { describe, expect, it } from "vitest";

import { createDefaultTableState } from "./data";
import {
  TABLE_VIEW_STATE_VERSION,
  createDefaultTableViewState,
  decodeTableViewState,
  encodeTableViewState,
  tableStateToViewState,
  viewStateToTableState,
  type TableViewState,
} from "./view-state";

describe("table view-state codec", () => {
  it("round-trips durable state with arbitrary identifiers and typed filter values", () => {
    const state: TableViewState = {
      columnOrder: ["a,b|c?&=漢字", "date"],
      columnSizing: { "a,b|c?&=漢字": 173.5 },
      columnVisibility: { date: false },
      filter: {
        columnFilters: [
          {
            columnId: "date",
            operator: "between",
            value: [new Date("2026-09-01T10:30:00.000Z"), new Date("2026-09-10T12:45:00.000Z")],
          },
          {
            columnId: "a,b|c?&=漢字",
            operator: "in",
            value: ["a,b", "x|y", true, 3, null],
          },
        ],
        query: "München & México = 1|2,3",
        queryColumnIds: ["a,b|c?&=漢字"],
      },
      sort: [{ columnId: "a,b|c?&=漢字", direction: "desc" }],
      version: TABLE_VIEW_STATE_VERSION,
    };

    expect(decodeTableViewState(encodeTableViewState(state))).toEqual(state);
  });

  it("round-trips through URLSearchParams without delimiter assumptions", () => {
    const state: TableViewState = {
      ...createDefaultTableViewState(),
      filter: { query: "a&b=c?d/e" },
      sort: [{ columnId: "amount,total", direction: "asc" }],
    };
    const params = new URLSearchParams();
    params.set("table", encodeTableViewState(state));

    expect(decodeTableViewState(params.get("table"))).toEqual(state);
  });

  it("falls back safely for malformed and unknown-version input", () => {
    const fallback = createDefaultTableViewState();

    expect(decodeTableViewState("not-json")).toEqual(fallback);
    expect(decodeTableViewState(JSON.stringify({ version: 999, sort: [] }))).toEqual(fallback);
    expect(decodeTableViewState(null)).toEqual(fallback);
  });

  it("keeps valid fields while dropping malformed entries", () => {
    const decoded = decodeTableViewState(
      JSON.stringify({
        columnOrder: ["valid", 3],
        columnSizing: { bad: "wide", valid: 144 },
        columnVisibility: { bad: "false", valid: false },
        filter: {
          columnFilters: [
            { columnId: "valid", operator: "equals", value: { kind: "number", value: "4" } },
            { columnId: 3, operator: "equals" },
            { columnId: "bad-operator", operator: "wat" },
          ],
          query: "needle",
        },
        sort: [
          { columnId: "valid", direction: "asc" },
          { columnId: "bad", direction: "sideways" },
        ],
        version: TABLE_VIEW_STATE_VERSION,
      }),
    );

    expect(decoded).toEqual({
      columnOrder: ["valid"],
      columnSizing: { valid: 144 },
      columnVisibility: { valid: false },
      filter: {
        columnFilters: [{ columnId: "valid", operator: "equals", value: 4 }],
        query: "needle",
      },
      sort: [{ columnId: "valid", direction: "asc" }],
      version: TABLE_VIEW_STATE_VERSION,
    });
  });

  it("serializes only durable table state and excludes selection and predicates", () => {
    type Row = { id: string; name: string };
    const state = createDefaultTableState<Row>({
      columnOrder: ["name"],
      columnSizing: { name: 180 },
      columnVisibility: { id: false },
      filter: {
        predicate: (row) => row.name.startsWith("A"),
        query: "alpha",
      },
      selection: { selectedRowKeys: ["secret-row-id"] },
      sort: [{ columnId: "name", direction: "asc" }],
    });

    const viewState = tableStateToViewState(state);
    expect(viewState).toEqual({
      columnOrder: ["name"],
      columnSizing: { name: 180 },
      columnVisibility: { id: false },
      filter: { query: "alpha" },
      sort: [{ columnId: "name", direction: "asc" }],
      version: TABLE_VIEW_STATE_VERSION,
    });
    expect(JSON.stringify(viewState)).not.toContain("secret-row-id");
    expect(viewState.filter).not.toHaveProperty("predicate");
  });

  it("converts decoded view state back to independently controllable table fields", () => {
    type Row = { id: string };
    const viewState: TableViewState = {
      columnOrder: ["id"],
      columnSizing: { id: 120 },
      columnVisibility: { id: true },
      filter: { query: "abc" },
      sort: [{ columnId: "id", direction: "desc" }],
      version: TABLE_VIEW_STATE_VERSION,
    };

    expect(viewStateToTableState<Row>(viewState)).toEqual({
      columnOrder: ["id"],
      columnSizing: { id: 120 },
      columnVisibility: { id: true },
      filter: { query: "abc", columnFilters: undefined, queryColumnIds: undefined },
      sort: [{ columnId: "id", direction: "desc" }],
    });
  });
});
