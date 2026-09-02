import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table, type TableColumnDef } from "./table";

type ResultRow = {
  algorithm: string;
  objects: number;
  timeMs: number;
};

const rows: ResultRow[] = [
  { algorithm: "Naive", objects: 100, timeMs: 2.4 },
  { algorithm: "Uniform grid", objects: 500, timeMs: 1.2 },
];

const columns: TableColumnDef<ResultRow>[] = [
  { accessor: "algorithm", header: "Algorithm", id: "algorithm", minWidth: 180 },
  { accessor: "objects", align: "end", header: "Objects", id: "objects", width: 120 },
  {
    accessor: "timeMs",
    align: "end",
    cell: (value) => `${Number(value).toFixed(1)} ms`,
    header: "Time",
    id: "time",
    width: 120,
  },
];

describe("Table", () => {
  it("renders native table semantics without requiring a virtual viewport", () => {
    render(
      <Table
        ariaLabel="Collision benchmark results"
        columns={columns}
        minWidth="42rem"
        rowKey="algorithm"
        rows={rows}
      />,
    );

    const table = screen.getByRole("table", { name: "Collision benchmark results" });
    const renderedRows = within(table).getAllByRole("row");

    expect(renderedRows).toHaveLength(3);
    expect(within(table).getByRole("columnheader", { name: "Algorithm" })).toBeTruthy();
    expect(within(table).getByText("Uniform grid")).toBeTruthy();
    expect(within(table).getByText("1.2 ms")).toBeTruthy();
    expect(table.style.minWidth).toBe("42rem");
  });

  it("renders an optional caption and empty state with the correct span", () => {
    render(
      <Table
        caption="Measured backends"
        columns={columns}
        emptyState="No measurements yet"
        rows={[]}
      />,
    );

    expect(screen.getByRole("table", { name: "Measured backends" })).toBeTruthy();

    const emptyCell = screen.getByText("No measurements yet");
    expect(emptyCell.getAttribute("colspan")).toBe(String(columns.length));
  });

  it("supports host styling hooks without changing semantic markup", () => {
    render(
      <Table
        className="host-table"
        columns={columns}
        density="compact"
        rowClassName={(row) => `row-${row.objects}`}
        rows={rows}
        striped
        tableClassName="host-table-element"
        tableProps={{ id: "results-table" }}
      />,
    );

    const table = screen.getByRole("table");
    const container = table.closest(".mb-native-table");

    expect(table.id).toBe("results-table");
    expect(container?.classList.contains("host-table")).toBe(true);
    expect(container?.classList.contains("mb-native-table--compact")).toBe(true);
    expect(container?.classList.contains("mb-native-table--striped")).toBe(true);
    expect(table.classList.contains("host-table-element")).toBe(true);
    expect(table.querySelector(".row-500")).toBeTruthy();
  });
});
