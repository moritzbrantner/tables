import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { isColumnFilterable, isColumnSortable } from "./data";
import { VirtualTable, type TableColumn } from "./react";
import { Table } from "./table";

type Row = { id: number; name: string };

const rows: Row[] = [{ id: 7, name: "Seven" }];

describe("public React API", () => {
  it("enables sorting and filtering unless a column opts out", () => {
    expect(isColumnSortable({})).toBe(true);
    expect(isColumnSortable({ sortable: false })).toBe(false);
    expect(isColumnFilterable({})).toBe(true);
    expect(isColumnFilterable({ filterable: false })).toBe(false);

    const columns: TableColumn<Row>[] = [
      { accessor: "name", header: "Name", id: "name" },
      { accessor: "id", header: "Id", id: "id", sortable: false },
    ];

    render(<VirtualTable columnVirtualization={false} columns={columns} rowKey="id" rows={rows} />);

    expect(screen.getByRole("button", { name: "Sort Name ascending" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sort Id/ })).toBeNull();
  });

  it("forwards host props and refs on both surfaces", () => {
    const tableRef = createRef<HTMLDivElement>();
    const gridRef = createRef<HTMLElement>();

    render(
      <>
        <Table
          columns={[{ accessor: "name", cell: ({ value }) => `#${value}`, header: "Name", id: "name" }]}
          data-testid="semantic"
          ref={tableRef}
          rowKey="id"
          rows={rows}
        />
        <VirtualTable
          columnVirtualization={false}
          columns={[{ accessor: "name", header: "Name", id: "name" }]}
          data-testid="grid"
          ref={gridRef}
          rowKey="id"
          rows={rows}
          style={{ outline: "1px solid red" }}
        />
      </>,
    );

    expect(tableRef.current).toBe(screen.getByTestId("semantic"));
    expect(gridRef.current).toBe(screen.getByTestId("grid"));
    expect(gridRef.current?.style.outline).toBe("1px solid red");
    expect(screen.getByText("#Seven")).toBeTruthy();
  });
});
