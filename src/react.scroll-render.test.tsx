import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VirtualTable, type TableColumn } from "./react";

type Row = { id: number };

const rows: Row[] = Array.from({ length: 1_000 }, (_, id) => ({ id }));

function renderGrid() {
  const cell = vi.fn(({ value }: { value: unknown }) => String(value));
  const columns: TableColumn<Row>[] = Array.from({ length: 12 }, (_, index) => ({
    accessor: "id",
    cell,
    header: `Column ${index}`,
    id: `column-${index}`,
    width: 200,
  }));
  const element = (rowHeight: number) => (
    <VirtualTable
      ariaLabel="Scroll"
      columns={columns}
      height={400}
      overscan={0}
      rowHeight={rowHeight}
      rowKey="id"
      rows={rows}
    />
  );
  const { container, rerender } = render(element(40));

  return {
    cell,
    element,
    rerender,
    scroller: container.querySelector(".mb-table__scroll") as HTMLElement,
  };
}

function renderedRowIndices(scroller: HTMLElement) {
  return Array.from(
    new Set(
      Array.from(scroller.querySelectorAll("[data-grid-row-index]")).map((cell) =>
        Number(cell.getAttribute("data-grid-row-index")),
      ),
    ),
  );
}

describe("VirtualTable scroll rendering", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not re-render cells for scroll events inside the rendered ranges", () => {
    const { cell, scroller } = renderGrid();

    // Any offset in (0, 40) renders rows 0-9; offset 0 ends one row earlier.
    scroller.scrollTop = 1;
    fireEvent.scroll(scroller);
    const before = renderedRowIndices(scroller);

    cell.mockClear();
    scroller.scrollTop = 39;
    fireEvent.scroll(scroller);
    scroller.scrollLeft = 10;
    fireEvent.scroll(scroller);

    expect(cell).not.toHaveBeenCalled();
    expect(renderedRowIndices(scroller)).toEqual(before);
  });

  it("re-renders when a scroll event crosses into a new range", () => {
    const { cell, scroller } = renderGrid();

    cell.mockClear();
    scroller.scrollTop = 4_000;
    fireEvent.scroll(scroller);

    expect(cell).toHaveBeenCalled();
    expect(renderedRowIndices(scroller)[0]).toBe(100);
  });

  it("uses the latest position when a later render has another cause", () => {
    const { element, rerender, scroller } = renderGrid();

    scroller.scrollTop = 41;
    fireEvent.scroll(scroller);
    scroller.scrollTop = 79;
    fireEvent.scroll(scroller);
    expect(renderedRowIndices(scroller)[0]).toBe(1);

    // At 30px rows, offset 79 starts at row 2; the last rendered offset, 41, would start at row 1.
    rerender(element(30));

    expect(renderedRowIndices(scroller)[0]).toBe(2);
  });
});
