import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VirtualTable, type TableColumn } from "./react";

type Row = {
  id: string;
  name: string;
  value: number;
};

const rows: Row[] = [
  { id: "1", name: "Alpha", value: 20 },
  { id: "2", name: "Beta", value: 10 },
  { id: "3", name: "Gamma", value: 30 },
];

const columns: TableColumn<Row>[] = [
  { accessor: "name", header: "Name", id: "name", width: 140 },
  { accessor: "value", header: "Value", id: "value", width: 100 },
];

describe("VirtualTable keyboard grid", () => {
  it("uses one roving data-cell tab stop and navigates with arrows and boundaries", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={rows}
      />,
    );

    const cells = screen.getAllByRole("gridcell") as HTMLElement[];
    expect(cells.map((cell) => cell.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);

    cells[0].focus();
    fireEvent.keyDown(cells[0], { key: "ArrowRight" });
    expect(document.activeElement?.textContent).toBe("20");

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("10");

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement?.textContent).toBe("Beta");

    fireEvent.keyDown(document.activeElement as HTMLElement, { ctrlKey: true, key: "End" });
    expect(document.activeElement?.textContent).toBe("30");
  });

  it("keeps nested controls independently operable", () => {
    const interactiveColumns: TableColumn<Row>[] = [
      {
        accessor: "name",
        cell: (value) => <button type="button">Open {String(value)}</button>,
        header: "Name",
        id: "name",
      },
      { accessor: "value", header: "Value", id: "value" },
    ];

    render(
      <VirtualTable
        columnVirtualization={false}
        columns={interactiveColumns}
        height={240}
        rowKey="id"
        rows={rows}
      />,
    );

    const nestedButton = screen.getByRole("button", { name: "Open Alpha" });
    nestedButton.focus();
    fireEvent.keyDown(nestedButton, { key: "ArrowRight" });

    expect(document.activeElement).toBe(nestedButton);
  });

  it("activates and selects the focused row from a grid cell", () => {
    const onRowClick = vi.fn();

    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        onRowClick={onRowClick}
        rowKey="id"
        rows={rows}
        selectionMode="single"
      />,
    );

    const row = screen.getByRole("row", { name: /alpha 20/i });
    const cell = within(row).getAllByRole("gridcell")[0] as HTMLElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: "Enter" });

    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(onRowClick).toHaveBeenCalledWith(rows[0], 0);
  });

  it("accounts for the header row in grid row semantics", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        mode="manual"
        rowKey="id"
        rows={rows.slice(0, 1)}
        totalRowCount={250}
      />,
    );

    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("251");
    const renderedRows = screen.getAllByRole("row");
    expect(renderedRows[0].getAttribute("aria-rowindex")).toBe("1");
    expect(renderedRows[1].getAttribute("aria-rowindex")).toBe("2");
  });

  it("resizes columns from the keyboard", () => {
    const onStateChange = vi.fn();

    render(
      <VirtualTable
        columnResizing
        columnVirtualization={false}
        columns={columns}
        height={240}
        onStateChange={onStateChange}
        rowKey="id"
        rows={rows}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /resize value/i }), {
      key: "ArrowRight",
    });

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          columnSizing: expect.objectContaining({ value: 108 }),
        }),
        type: "columnSizing",
      }),
    );
  });
});
