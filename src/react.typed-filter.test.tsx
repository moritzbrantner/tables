import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TableColumn } from "./data";
import { VirtualTable } from "./react";

type Row = {
  id: string;
  name: string;
  stage: "Closed" | "Proposal";
  value: number;
};

const rows: Row[] = [
  { id: "1", name: "Alpha", stage: "Proposal", value: 20 },
  { id: "2", name: "Beta", stage: "Closed", value: 10 },
];

const columns: TableColumn<Row>[] = [
  { accessor: "name", header: "Name", id: "name", sortable: true, type: "string" },
  {
    accessor: "stage",
    filterOptions: ["Proposal", "Closed"],
    header: "Stage",
    id: "stage",
    sortable: true,
    type: "string",
  },
  { accessor: "value", header: "Value", id: "value", sortable: true, type: "number" },
];

describe("typed column filters", () => {
  it("uses a text input for string columns", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /open column actions for name/i }));
    const value = within(screen.getByRole("dialog", { name: /column actions for name/i })).getByLabelText(
      "Value",
    ) as HTMLInputElement;

    expect(value.tagName).toBe("INPUT");
    expect(value.type).toBe("text");
  });

  it("uses a number input for number columns", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /open column actions for value/i }));
    const value = within(screen.getByRole("dialog", { name: /column actions for value/i })).getByLabelText(
      "Value",
    ) as HTMLInputElement;

    expect(value.tagName).toBe("INPUT");
    expect(value.type).toBe("number");
  });

  it("uses direct multi-select enum filters without an operator dropdown", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /open column actions for stage/i }));
    const dialog = screen.getByRole("dialog", { name: /column actions for stage/i });

    expect(within(dialog).queryByLabelText("Filter")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /apply/i })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Proposal" }));
    expect(
      within(dialog).getByRole("button", { name: "Proposal" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByText("Beta")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Closed" }));
    expect(
      within(dialog).getByRole("button", { name: "Closed" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Proposal" }));
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.getByText("Beta")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Closed" }));
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });
});

function renderTable() {
  render(
    <VirtualTable
      columnMenu
      columnVirtualization={false}
      columns={columns}
      height={240}
      rowKey="id"
      rows={rows}
    />,
  );
}
