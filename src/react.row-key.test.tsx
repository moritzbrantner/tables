import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VirtualTable, type TableColumn } from "./react";

type Row = {
  id: number;
  name: string;
};

const columns: TableColumn<Row>[] = [
  { accessor: "name", header: "Name", id: "name" },
];

describe("VirtualTable row keys", () => {
  it("preserves numeric property keys in selection state", async () => {
    const user = userEvent.setup();
    const onStateChange = vi.fn();

    render(
      <VirtualTable
        columnVirtualization={false}
        columns={columns}
        height={160}
        onStateChange={onStateChange}
        rowKey="id"
        rows={[{ id: 42, name: "Answer" }]}
        selectionMode="single"
      />,
    );

    await user.click(screen.getByRole("row", { name: /answer/i }));

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          selection: { selectedRowKeys: [42] },
        }),
        type: "selection",
      }),
    );
  });
});
