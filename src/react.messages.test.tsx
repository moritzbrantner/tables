// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VirtualTable, type TableColumn } from "./react";

type Row = { id: number; name: string };

const columns: TableColumn<Row>[] = [
  {
    accessor: "name",
    filterable: true,
    header: "Name",
    id: "name",
    resizable: true,
    sortable: true,
  },
];

describe("VirtualTable messages", () => {
  it("injects visible and ARIA copy without changing table state", () => {
    render(
      <VirtualTable
        columnMenu
        columnResizing
        columns={columns}
        messages={{
          emptyState: "Keine Zeilen",
          openColumnActions: (label) => `Spaltenaktionen für ${label} öffnen`,
          openTableOptions: "Tabellenoptionen öffnen",
          resizeColumn: (label) => `${label} Größe ändern`,
          sortAscending: (label) => `${label} aufsteigend sortieren`,
          tableAriaLabel: "Datentabelle",
        }}
        rowKey="id"
        rows={[]}
        showRowIndex
      />,
    );

    expect(screen.getByRole("grid", { name: "Datentabelle" })).toBeTruthy();
    expect(screen.getByText("Keine Zeilen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tabellenoptionen öffnen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Spaltenaktionen für Name öffnen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Name Größe ändern" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Name aufsteigend sortieren" })).toBeTruthy();
  });

  it("preserves explicitly null state renderers", () => {
    const { rerender } = render(
      <VirtualTable columns={columns} emptyState={null} rowKey="id" rows={[]} />,
    );

    expect(screen.queryByText("No rows")).toBeNull();

    rerender(
      <VirtualTable columns={columns} loading loadingState={null} rowKey="id" rows={[]} />,
    );

    expect(screen.queryByText("Loading rows")).toBeNull();
  });
});
