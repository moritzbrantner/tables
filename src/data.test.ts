import { describe, expect, it } from "vitest";

import {
  applyTableFilter,
  applyTableSort,
  createTableModel,
  getNextSortState,
  type TableColumn,
} from "./data";

type Row = {
  active: boolean;
  city: string;
  createdAt: Date;
  id: string;
  revenue: number;
  segment: string;
};

const columns: TableColumn<Row>[] = [
  { accessor: "active", header: "Active", id: "active", sortable: true, type: "boolean" },
  { accessor: "city", header: "City", id: "city", sortable: true },
  { accessor: "createdAt", header: "Created", id: "createdAt", sortable: true, type: "date" },
  { accessor: "segment", header: "Segment", id: "segment" },
  { accessor: "revenue", header: "Revenue", id: "revenue", sortable: true },
];

const rows: Row[] = [
  {
    active: true,
    city: "Berlin",
    createdAt: new Date("2024-01-04T00:00:00.000Z"),
    id: "a",
    revenue: 42,
    segment: "Enterprise",
  },
  {
    active: false,
    city: "Boston",
    createdAt: new Date("2024-01-24T00:00:00.000Z"),
    id: "b",
    revenue: 12,
    segment: "SMB",
  },
  {
    active: true,
    city: "Tokyo",
    createdAt: new Date("2024-02-14T00:00:00.000Z"),
    id: "c",
    revenue: 88,
    segment: "Enterprise",
  },
];

describe("table data helpers", () => {
  it("filters across visible columns", () => {
    expect(applyTableFilter(rows, columns, { query: "enterprise" }).map((row) => row.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("applies structured string filters", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "segment", operator: "contains", value: "enter" }],
      }).map((row) => row.id),
    ).toEqual(["a", "c"]);
  });

  it("applies structured number filters", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "revenue", operator: "gte", value: 42 }],
      }).map((row) => row.id),
    ).toEqual(["a", "c"]);
  });

  it("applies structured date ranges", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [
          {
            columnId: "createdAt",
            operator: "between",
            value: [
              new Date("2024-01-01T00:00:00.000Z"),
              new Date("2024-01-31T23:59:59.000Z"),
            ],
          },
        ],
      }).map((row) => row.id),
    ).toEqual(["a", "b"]);
  });

  it("applies structured boolean filters", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "active", operator: "equals", value: true }],
      }).map((row) => row.id),
    ).toEqual(["a", "c"]);
  });

  it("combines structured filters with global search", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [{ columnId: "segment", operator: "equals", value: "Enterprise" }],
        query: "tokyo",
      }).map((row) => row.id),
    ).toEqual(["c"]);
  });

  it("keeps query filtering when structured filters are cleared", () => {
    expect(
      applyTableFilter(rows, columns, {
        columnFilters: [],
        query: "boston",
      }).map((row) => row.id),
    ).toEqual(["b"]);
  });

  it("sorts stably by a selected column", () => {
    expect(
      applyTableSort(rows, columns, [{ columnId: "revenue", direction: "asc" }]).map(
        (row) => row.id,
      ),
    ).toEqual(["b", "a", "c"]);
  });

  it("creates a filtered and sorted table model", () => {
    expect(
      createTableModel({
        columns,
        filter: { query: "b" },
        rows,
        sort: [{ columnId: "revenue", direction: "desc" }],
      }),
    ).toMatchObject({
      filteredRowCount: 2,
      sortedRowCount: 2,
      totalRowCount: 3,
    });
  });

  it("cycles sort state", () => {
    expect(getNextSortState([], "city")).toEqual([{
      columnId: "city",
      direction: "asc",
    }]);
    expect(getNextSortState([{ columnId: "city", direction: "asc" }], "city")).toEqual([{
      columnId: "city",
      direction: "desc",
    }]);
    expect(getNextSortState([{ columnId: "city", direction: "desc" }], "city")).toEqual([]);
  });

  it("cycles sort state without removing other columns in multi-sort mode", () => {
    expect(
      getNextSortState([{ columnId: "city", direction: "asc" }], "revenue", true),
    ).toEqual([
      { columnId: "city", direction: "asc" },
      { columnId: "revenue", direction: "asc" },
    ]);
  });
});
