import { describe, expect, it } from "vitest";

import {
  applyTableFilter,
  applyTableSort,
  createTableModel,
  getNextSortState,
  type TableColumn,
} from "./data";

type Row = {
  active: boolean | null;
  createdAt: Date | null;
  id: string;
  name: string;
  region: string;
  score: number | null;
  tags?: readonly string[];
};

const rows: Row[] = [
  {
    active: true,
    createdAt: new Date("2026-01-03T00:00:00Z"),
    id: "a",
    name: "Alpha Enterprise",
    region: "Berlin",
    score: 30,
    tags: ["core", "eu"],
  },
  {
    active: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    id: "b",
    name: "Beta SMB",
    region: "Boston",
    score: 10,
    tags: ["edge"],
  },
  {
    active: true,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    id: "c",
    name: "Gamma Enterprise",
    region: "Tokyo",
    score: 20,
    tags: ["core", "apac"],
  },
  {
    active: null,
    createdAt: null,
    id: "d",
    name: "Äpfel Enterprise",
    region: "München",
    score: null,
  },
];

const columns: TableColumn<Row>[] = [
  { accessor: "id", header: "ID", id: "id", type: "string" },
  { accessor: "name", header: "Name", id: "name", type: "string" },
  { accessor: "region", header: "Region", id: "region", type: "string" },
  { accessor: "score", header: "Score", id: "score", sortable: true, type: "number" },
  { accessor: "createdAt", header: "Created", id: "createdAt", type: "date" },
  { accessor: "active", header: "Active", id: "active", type: "boolean" },
  { accessor: "tags", header: "Tags", id: "tags", type: "json" },
];

describe("table data semantics", () => {
  it("filters with a global query", () => {
    expect(applyTableFilter(rows, columns, { query: "enterprise" }).map((row) => row.id)).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("applies structured string, number, date, and boolean filters", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "name", operator: "contains", value: "enterprise" }],
      }).map((row) => row.id),
    ).toEqual(["a", "c", "d"]);

    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "score", operator: "gte", value: 20 }],
      }).map((row) => row.id),
    ).toEqual(["a", "c"]);

    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{
          columnId: "createdAt",
          operator: "between",
          value: [new Date("2026-01-02T00:00:00Z"), new Date("2026-01-03T00:00:00Z")],
        }],
      }).map((row) => row.id),
    ).toEqual(["a", "c"]);

    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "active", operator: "equals", value: true }],
      }).map((row) => row.id),
    ).toEqual(["a", "c"]);
  });

  it("supports membership, null checks, JSON search, and unicode-insensitive search", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "region", operator: "in", value: ["Berlin", "Tokyo"] }],
      }).map((row) => row.id),
    ).toEqual(["a", "c"]);

    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "score", operator: "isNull" }],
      }).map((row) => row.id),
    ).toEqual(["d"]);

    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "score", operator: "equals", value: null }],
      }).map((row) => row.id),
    ).toEqual(["d"]);

    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "active", operator: "in", value: [true, null] }],
      }).map((row) => row.id),
    ).toEqual(["a", "c", "d"]);

    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "tags", operator: "equals", value: null }],
      }).map((row) => row.id),
    ).toEqual(["d"]);

    expect(applyTableFilter(rows, columns, { query: "apac" }).map((row) => row.id)).toEqual(["c"]);
    expect(applyTableFilter(rows, columns, { query: "ÄPFEL" }).map((row) => row.id)).toEqual(["d"]);
  });

  it("combines structured filtering with global search and custom predicate fallback", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "active", operator: "equals", value: true }],
        query: "tokyo",
      }).map((row) => row.id),
    ).toEqual(["c"]);

    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "active", operator: "equals", value: true }],
        predicate: (row, _rowIndex, query) => query === "special" && row.id === "a",
        query: "special",
      }).map((row) => row.id),
    ).toEqual(["a"]);
  });

  it("sorts stably and supports multi-sort plus sortAccessor", () => {
    expect(
      applyTableSort(rows, columns, [{ columnId: "score", direction: "asc" }]).map((row) => row.id),
    ).toEqual(["b", "c", "a", "d"]);

    const repeated = [
      { ...rows[0], id: "x", score: 20, region: "B" },
      { ...rows[1], id: "y", score: 20, region: "A" },
      { ...rows[2], id: "z", score: 20, region: "A" },
    ];
    expect(
      applyTableSort(repeated, columns, [
        { columnId: "score", direction: "asc" },
        { columnId: "region", direction: "asc" },
      ]).map((row) => row.id),
    ).toEqual(["y", "z", "x"]);

    const accessorColumns: TableColumn<Row>[] = [
      {
        accessor: "score",
        header: "Score",
        id: "score",
        sortAccessor: (row) => row.score == null ? null : -row.score,
        type: "number",
      },
    ];
    expect(
      applyTableSort(rows, accessorColumns, [{ columnId: "score", direction: "asc" }]).map((row) => row.id),
    ).toEqual(["a", "c", "b", "d"]);
  });

  it("creates a filtered and sorted model with stable counts", () => {
    const model = createTableModel({
      columns,
      filter: { query: "enterprise" },
      rows,
      sort: [{ columnId: "score", direction: "desc" }],
    });

    expect(model.totalRowCount).toBe(4);
    expect(model.filteredRowCount).toBe(3);
    expect(model.sortedRowCount).toBe(3);
    expect(model.rows.map((row) => row.id)).toEqual(["d", "a", "c"]);
  });

  it("cycles sort state and preserves multi-sort order", () => {
    expect(getNextSortState([], "score")).toEqual([{ columnId: "score", direction: "asc" }]);
    expect(getNextSortState([{ columnId: "score", direction: "asc" }], "score")).toEqual([
      { columnId: "score", direction: "desc" },
    ]);
    expect(getNextSortState([{ columnId: "score", direction: "desc" }], "score")).toEqual([]);
    expect(getNextSortState([{ columnId: "name", direction: "asc" }], "score", true)).toEqual([
      { columnId: "name", direction: "asc" },
      { columnId: "score", direction: "asc" },
    ]);
  });
});
