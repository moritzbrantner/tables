import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VirtualTable, type TableColumn } from "./react";

type Row = {
  center: string;
  id: string;
  leftA: string;
  leftB: string;
  right: string;
};

const rows: Row[] = [
  {
    center: "Center value",
    id: "1",
    leftA: "Left A value",
    leftB: "Left B value",
    right: "Right value",
  },
];

const columns: TableColumn<Row>[] = [
  { accessor: "leftA", header: "Left A", id: "left-a", sticky: "left" },
  { accessor: "center", header: "Center", id: "center" },
  { accessor: "leftB", header: "Left B", id: "left-b", sticky: "left" },
  { accessor: "right", header: "Right", id: "right", sticky: "right" },
];

describe("sticky table options ordering", () => {
  it("matches rendered sticky groups and only reorders within a group", () => {
    const handleStateChange = vi.fn();

    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={240}
        onStateChange={handleStateChange}
        rowKey="id"
        rows={rows}
        showRowIndex
        state={{ columnOrder: ["center", "left-b", "right", "left-a"] }}
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent).slice(1),
    ).toEqual(["Left B", "Left A", "Center", "Right"]);

    fireEvent.click(screen.getByRole("button", { name: /open table options/i }));
    const dialog = screen.getByRole("dialog", { name: /table options/i });

    expect(
      within(dialog)
        .getAllByRole("checkbox")
        .map((checkbox) => checkbox.parentElement?.textContent),
    ).toEqual(["Left B", "Left A", "Center", "Right"]);

    expect(
      (within(dialog).getByRole("button", { name: /move left a down/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(dialog).getByRole("button", { name: /move center up/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(dialog).getByRole("button", { name: /move center down/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(dialog).getByRole("button", { name: /move right up/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: /move left b down/i }));

    expect(handleStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          columnOrder: ["left-a", "left-b", "center", "right"],
        }),
        type: "columnOrder",
      }),
    );
  });
});
