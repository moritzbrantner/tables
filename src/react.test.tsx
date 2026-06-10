import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VirtualTable } from "./react";
import type { TableColumn, TableState } from "./data";

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
  { accessor: "name", header: "Name", id: "name", sortable: true, width: 140 },
  { accessor: "value", header: "Value", id: "value", sortable: true, width: 100 },
];

describe("VirtualTable", () => {
  it("renders rows and sorts from the header", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={rows}
      />,
    );

    expect(screen.getByText("Alpha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /sort value ascending/i }));

    const cells = screen.getAllByRole("gridcell").map((cell) => cell.textContent);

    expect(cells.slice(0, 4)).toEqual(["Beta", "10", "Alpha", "20"]);
    expect(screen.getByRole("columnheader", { name: /value/i }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
  });

  it("shows an empty state after filtering through table state", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        emptyState="Nothing matched"
        height={240}
        rowKey="id"
        rows={rows}
        state={{ filter: { query: "not-found" } }}
      />,
    );

    expect(screen.getByText("Nothing matched")).toBeTruthy();
  });

  it("emits sort state without client-side sorting in manual mode", () => {
    const handleStateChange = vi.fn();

    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        mode="manual"
        onStateChange={handleStateChange}
        rowKey="id"
        rows={rows}
        totalRowCount={250}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sort value ascending/i }));

    expect(screen.getAllByRole("gridcell").map((cell) => cell.textContent).slice(0, 2)).toEqual([
      "Alpha",
      "20",
    ]);
    expect(handleStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          sort: [{ columnId: "value", direction: "asc" }],
        }),
        type: "sort",
      }),
    );
  });

  it("supports shift-click multi-sort state", () => {
    const handleStateChange = vi.fn();

    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        onStateChange={handleStateChange}
        rowKey="id"
        rows={rows}
        state={{ sort: [{ columnId: "name", direction: "asc" }] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sort value ascending/i }), {
      shiftKey: true,
    });

    expect(handleStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          sort: [
            { columnId: "name", direction: "asc" },
            { columnId: "value", direction: "asc" },
          ],
        }),
        type: "sort",
      }),
    );
  });

  it("opens the column menu from a visible header button", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /open column actions for value/i }));

    expect(screen.getByRole("dialog", { name: /column actions for value/i })).toBeTruthy();
  });

  it("opens the column menu from a header context menu", () => {
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

    fireEvent.contextMenu(screen.getByRole("button", { name: /sort value ascending/i }));

    expect(screen.getByRole("dialog", { name: /column actions for value/i })).toBeTruthy();
  });

  it("sorts from explicit column menu actions", () => {
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

    fireEvent.contextMenu(screen.getByRole("button", { name: /sort value ascending/i }));
    fireEvent.click(screen.getByRole("button", { name: /sort ascending/i }));
    expect(screen.getAllByRole("gridcell").map((cell) => cell.textContent).slice(0, 2)).toEqual([
      "Beta",
      "10",
    ]);

    fireEvent.contextMenu(screen.getByRole("button", { name: /sort value descending/i }));
    fireEvent.click(screen.getByRole("button", { name: /sort descending/i }));
    expect(screen.getAllByRole("gridcell").map((cell) => cell.textContent).slice(0, 2)).toEqual([
      "Gamma",
      "30",
    ]);

    fireEvent.contextMenu(screen.getByRole("button", { name: /clear sort for value/i }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: /column actions for value/i })).getByRole(
        "button",
        { name: /^clear sort$/i },
      ),
    );
    expect(screen.getAllByRole("gridcell").map((cell) => cell.textContent).slice(0, 2)).toEqual([
      "Alpha",
      "20",
    ]);
  });

  it("applies a string filter from the column menu", () => {
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

    fireEvent.contextMenu(screen.getByRole("button", { name: /sort name ascending/i }));
    const dialog = screen.getByRole("dialog", { name: /column actions for name/i });
    fireEvent.change(within(dialog).getByLabelText("Value"), {
      target: { value: "bet" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("applies a number comparison filter from the column menu", () => {
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

    fireEvent.contextMenu(screen.getByRole("button", { name: /sort value ascending/i }));
    const dialog = screen.getByRole("dialog", { name: /column actions for value/i });
    fireEvent.change(within(dialog).getByLabelText("Filter"), {
      target: { value: "gte" },
    });
    fireEvent.change(within(dialog).getByLabelText("Value"), {
      target: { value: "20" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Gamma")).toBeTruthy();
    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("clears a column filter from the column menu", () => {
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

    fireEvent.contextMenu(screen.getByRole("button", { name: /sort name ascending/i }));
    let dialog = screen.getByRole("dialog", { name: /column actions for name/i });
    fireEvent.change(within(dialog).getByLabelText("Value"), {
      target: { value: "bet" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    fireEvent.contextMenu(screen.getByRole("button", { name: /sort name ascending/i }));
    dialog = screen.getByRole("dialog", { name: /column actions for name/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /clear filter/i }));

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("Gamma")).toBeTruthy();
  });

  it("leaves the native context menu alone when columnMenu is omitted", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={rows}
      />,
    );

    const header = screen.getByRole("button", { name: /sort value ascending/i }).parentElement;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    expect(header?.dispatchEvent(event)).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the column menu from the keyboard and restores focus on Escape", () => {
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

    const trigger = screen.getByRole("button", { name: /open column actions for value/i });

    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: /column actions for value/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("selects rows in uncontrolled single-selection mode", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={rows}
        selectionMode="single"
      />,
    );

    fireEvent.click(screen.getByRole("row", { name: /beta 10/i }));

    expect(screen.getByRole("row", { name: /beta 10/i }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("emits controlled selection state", () => {
    const handleStateChange = vi.fn();

    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        onStateChange={handleStateChange}
        rowKey="id"
        rows={rows}
        selectionMode="single"
        state={{ selection: { selectedRowKeys: [] } }}
      />,
    );

    fireEvent.click(screen.getByRole("row", { name: /gamma 30/i }));

    expect(handleStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          selection: { selectedRowKeys: ["3"] },
        }),
        type: "selection",
      }),
    );
  });

  it("supports multiple selection toggles and shift ranges", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={rows}
        selectionMode="multiple"
      />,
    );

    fireEvent.click(screen.getByRole("row", { name: /alpha 20/i }));
    fireEvent.click(screen.getByRole("row", { name: /gamma 30/i }), { shiftKey: true });

    expect(screen.getByRole("row", { name: /alpha 20/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("row", { name: /beta 10/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("row", { name: /gamma 30/i }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("row", { name: /beta 10/i }), { ctrlKey: true });
    expect(screen.getByRole("row", { name: /beta 10/i }).getAttribute("aria-selected")).toBe("false");
  });

  it("selects and clicks rows from the keyboard", () => {
    const handleRowClick = vi.fn();

    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        onRowClick={handleRowClick}
        rowKey="id"
        rows={rows}
        selectionMode="single"
      />,
    );

    const row = screen.getByRole("row", { name: /alpha 20/i });

    fireEvent.keyDown(row, { key: "Enter" });

    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(handleRowClick).toHaveBeenCalledWith(rows[0], 0);
  });

  it("toggles multiple selection from the keyboard", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={rows}
        selectionMode="multiple"
      />,
    );

    const row = screen.getByRole("row", { name: /alpha 20/i });

    fireEvent.keyDown(row, { key: " " });
    expect(row.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(row, { key: " " });
    expect(row.getAttribute("aria-selected")).toBe("false");
  });

  it("does not select non-selectable rows", () => {
    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        isRowSelectable={(row) => row.id !== "2"}
        rowKey="id"
        rows={rows}
        selectionMode="single"
      />,
    );

    fireEvent.click(screen.getByRole("row", { name: /beta 10/i }));

    expect(screen.getByRole("row", { name: /beta 10/i }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("emits column sizing while resizing and does not sort", () => {
    const handleStateChange = vi.fn();

    render(
      <VirtualTable
        columnResizing
        columnVirtualization={false}
        columns={columns}
        height={240}
        onStateChange={handleStateChange}
        rowKey="id"
        rows={rows}
      />,
    );

    fireEvent(
      screen.getByRole("button", { name: /resize value/i }),
      createPointerEvent("pointerdown", 0),
    );
    fireEvent(window, createPointerEvent("pointermove", 40));
    fireEvent(window, createPointerEvent("pointerup", 40));

    expect(handleStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          columnSizing: expect.objectContaining({ value: 140 }),
        }),
        type: "columnSizing",
      }),
    );
    expect(screen.getAllByRole("gridcell").map((cell) => cell.textContent).slice(0, 2)).toEqual([
      "Alpha",
      "20",
    ]);
  });

  it("resets column sizing on resize handle double-click", () => {
    const handleStateChange = vi.fn();

    render(
      <VirtualTable
        columnResizing
        columnVirtualization={false}
        columns={columns}
        height={240}
        onStateChange={handleStateChange}
        rowKey="id"
        rows={rows}
        state={{ columnSizing: { value: 180 } }}
      />,
    );

    fireEvent.doubleClick(screen.getByRole("button", { name: /resize value/i }));

    expect(handleStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          columnSizing: {},
        }),
        type: "columnSizing",
      }),
    );
  });

  it("renders sticky columns outside the center virtual range", () => {
    const stickyColumns: TableColumn<Row>[] = [
      { ...columns[0], sticky: "left" },
      columns[1],
      { accessor: "id", header: "ID", id: "id", sticky: "right", width: 80 },
    ];

    render(
      <VirtualTable
        columns={stickyColumns}
        height={240}
        rowKey="id"
        rows={rows}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /name/i }).className).toContain(
      "mb-table__header-cell--sticky-left",
    );
    expect(screen.getByRole("columnheader", { name: /id/i }).className).toContain(
      "mb-table__header-cell--sticky-right",
    );
  });

  it("exposes loading as a status", () => {
    render(
      <VirtualTable
        columns={columns}
        height={240}
        loading
        loadingState="Loading test rows"
        rowKey="id"
        rows={rows}
      />,
    );

    expect(screen.getByRole("status").textContent).toBe("Loading test rows");
  });

  it("hides the menu trigger when button menus are disabled", () => {
    render(
      <VirtualTable
        columnMenu={{ filter: true, sort: true, trigger: "context" }}
        columnVirtualization={false}
        columns={columns}
        height={240}
        rowKey="id"
        rows={rows}
      />,
    );

    expect(screen.queryByRole("button", { name: /open column actions for value/i })).toBeNull();
  });
});

function createPointerEvent(type: string, clientX: number) {
  const event = new Event(type, { bubbles: true });

  Object.defineProperties(event, {
    clientX: { value: clientX },
    pointerId: { value: 1 },
  });

  return event;
}
