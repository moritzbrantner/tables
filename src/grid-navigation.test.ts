import { describe, expect, it } from "vitest";

import { getNextGridPosition } from "./grid-navigation";

describe("grid navigation", () => {
  const options = {
    columnCount: 4,
    current: { columnIndex: 2, rowIndex: 5 },
    pageSize: 3,
    rowCount: 10,
  };

  it("moves one cell with arrow keys", () => {
    expect(getNextGridPosition({ ...options, key: "ArrowUp" })).toEqual({ columnIndex: 2, rowIndex: 4 });
    expect(getNextGridPosition({ ...options, key: "ArrowDown" })).toEqual({ columnIndex: 2, rowIndex: 6 });
    expect(getNextGridPosition({ ...options, key: "ArrowLeft" })).toEqual({ columnIndex: 1, rowIndex: 5 });
    expect(getNextGridPosition({ ...options, key: "ArrowRight" })).toEqual({ columnIndex: 3, rowIndex: 5 });
  });

  it("supports row and grid boundaries", () => {
    expect(getNextGridPosition({ ...options, key: "Home" })).toEqual({ columnIndex: 0, rowIndex: 5 });
    expect(getNextGridPosition({ ...options, key: "End" })).toEqual({ columnIndex: 3, rowIndex: 5 });
    expect(getNextGridPosition({ ...options, ctrlKey: true, key: "Home" })).toEqual({ columnIndex: 0, rowIndex: 0 });
    expect(getNextGridPosition({ ...options, ctrlKey: true, key: "End" })).toEqual({ columnIndex: 3, rowIndex: 9 });
  });

  it("pages and clamps without leaving the grid", () => {
    expect(getNextGridPosition({ ...options, key: "PageUp" })).toEqual({ columnIndex: 2, rowIndex: 2 });
    expect(getNextGridPosition({ ...options, key: "PageDown" })).toEqual({ columnIndex: 2, rowIndex: 8 });
    expect(
      getNextGridPosition({ ...options, current: { columnIndex: 0, rowIndex: 0 }, key: "ArrowUp" }),
    ).toEqual({ columnIndex: 0, rowIndex: 0 });
    expect(
      getNextGridPosition({ ...options, current: { columnIndex: 3, rowIndex: 9 }, key: "PageDown" }),
    ).toEqual({ columnIndex: 3, rowIndex: 9 });
  });

  it("ignores unrelated keys and empty grids", () => {
    expect(getNextGridPosition({ ...options, key: "Enter" })).toBeNull();
    expect(getNextGridPosition({ ...options, rowCount: 0, key: "ArrowDown" })).toBeNull();
  });
});
