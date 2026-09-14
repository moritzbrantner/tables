import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { VirtualTable, type TableColumn } from "./react";

type Row = {
  id: string;
  name: string;
  region: string;
  total: number;
};

const columns: TableColumn<Row>[] = [
  { accessor: "name", header: "Name", id: "name" },
  { accessor: "region", header: "Region", id: "region" },
  { accessor: "total", header: "Total", id: "total" },
];

describe("VirtualTable data lifetime", () => {
  it("keeps table view state when a changing data source supplies a new row snapshot", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={[{ id: "1", name: "Alpha", region: "EU", total: 10 }]}
        showRowIndex
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open table options" }));
    await user.click(screen.getByRole("button", { name: "Move Total up" }));
    await user.click(screen.getByRole("checkbox", { name: "Region" }));

    rerender(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={[{ id: "2", name: "Beta", region: "NA", total: 20 }]}
        showRowIndex
      />,
    );

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Region" })).not.toBeInTheDocument();

    const visibleHeaders = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim())
      .filter(Boolean);
    expect(visibleHeaders).toEqual(["Name", "Total"]);
  });
});
