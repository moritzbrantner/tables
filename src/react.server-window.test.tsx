// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VirtualTable, type TableColumn } from "./react";

type Row = { id: number; name: string };

const columns: TableColumn<Row>[] = [
  { accessor: "id", id: "id" },
  { accessor: "name", id: "name" },
];

describe("VirtualTable manual server windows", () => {
  it("reports global ARIA and visible row positions for a later window", () => {
    render(
      <VirtualTable
        columns={columns}
        mode="manual"
        rowIndexOffset={20}
        rowKey="id"
        rows={[
          { id: 21, name: "Twenty one" },
          { id: 22, name: "Twenty two" },
        ]}
        showRowIndex
        totalRowCount={100}
      />,
    );

    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-rowcount")).toBe("101");

    const dataRows = screen.getAllByRole("row").slice(1);
    expect(dataRows[0]?.getAttribute("aria-rowindex")).toBe("22");
    expect(screen.getByRole("rowheader", { name: "21" })).toBeTruthy();
  });
});
