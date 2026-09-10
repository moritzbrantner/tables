export type GridPosition = {
  columnIndex: number;
  rowIndex: number;
};

export type GridNavigationKey =
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "End"
  | "Home"
  | "PageDown"
  | "PageUp";

export function getNextGridPosition({
  columnCount,
  ctrlKey = false,
  current,
  key,
  pageSize,
  rowCount,
}: {
  columnCount: number;
  ctrlKey?: boolean;
  current: GridPosition;
  key: string;
  pageSize: number;
  rowCount: number;
}): GridPosition | null {
  if (columnCount <= 0 || rowCount <= 0 || !isGridNavigationKey(key)) {
    return null;
  }

  const lastColumn = columnCount - 1;
  const lastRow = rowCount - 1;
  const columnIndex = clamp(current.columnIndex, 0, lastColumn);
  const rowIndex = clamp(current.rowIndex, 0, lastRow);

  switch (key) {
    case "ArrowDown":
      return { columnIndex, rowIndex: clamp(rowIndex + 1, 0, lastRow) };
    case "ArrowLeft":
      return { columnIndex: clamp(columnIndex - 1, 0, lastColumn), rowIndex };
    case "ArrowRight":
      return { columnIndex: clamp(columnIndex + 1, 0, lastColumn), rowIndex };
    case "ArrowUp":
      return { columnIndex, rowIndex: clamp(rowIndex - 1, 0, lastRow) };
    case "Home":
      return ctrlKey ? { columnIndex: 0, rowIndex: 0 } : { columnIndex: 0, rowIndex };
    case "End":
      return ctrlKey
        ? { columnIndex: lastColumn, rowIndex: lastRow }
        : { columnIndex: lastColumn, rowIndex };
    case "PageDown":
      return {
        columnIndex,
        rowIndex: clamp(rowIndex + Math.max(1, pageSize), 0, lastRow),
      };
    case "PageUp":
      return {
        columnIndex,
        rowIndex: clamp(rowIndex - Math.max(1, pageSize), 0, lastRow),
      };
  }
}

function isGridNavigationKey(key: string): key is GridNavigationKey {
  return (
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "End" ||
    key === "Home" ||
    key === "PageDown" ||
    key === "PageUp"
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
