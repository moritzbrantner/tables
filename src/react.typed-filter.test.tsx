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

  it("uses an enum select and filters by the selected value", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /open column actions for stage/i }));
    const dialog = screen.getByRole("dialog", { name: /column actions for stage/i });
    const operator = within(dialog).getByLabelText("Filter") as HTMLSelectElement;
    const value = within(dialog).getByLabelText("Value") as HTMLSelectElement;

    expect(operator.value).toBe("equals");
    expect(value.tagName).toBe("SELECT");
    expect(Array.from(value.options).map((option) => option.value)).toEqual([
      "",
      "Proposal",
      "Closed",
    ]);

    fireEvent.change(value, { target: { value: "Closed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByText("Alpha")).toBeNull();
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
