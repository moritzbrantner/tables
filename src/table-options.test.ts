import { describe, expect, it } from "vitest";

import type { TableColumn } from "./react-column";
import { reorderTableColumns } from "./table-options";

type Row = {
  id: string;
  name: string;
  region: string;
  total: number;
};

const columns: TableColumn<Row>[] = [
  { accessor: "id", header: "Id", id: "id", sticky: "left" },
  { accessor: "name", header: "Name", id: "name" },
  { accessor: "region", header: "Region", id: "region" },
  { accessor: "total", header: "Total", id: "total" },
];

describe("table column reordering", () => {
  it("moves a column to the target slot using the complete rendered order", () => {
    expect(reorderTableColumns(columns, [], "name", "total")).toEqual([
      "id",
      "region",
      "total",
      "name",
    ]);
  });

  it("uses the same operation for one-step moves", () => {
    expect(reorderTableColumns(columns, [], "total", "region")).toEqual([
      "id",
      "name",
      "total",
      "region",
    ]);
  });

  it("does not move columns across sticky groups", () => {
    const order = ["id", "name", "region", "total"];
    expect(reorderTableColumns(columns, order, "id", "name")).toBe(order);
  });
});
