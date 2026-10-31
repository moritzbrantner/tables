import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { TableRowKey } from "./data";
import { getNextGridPosition, type GridPosition } from "./grid-navigation";
import type { TableColumn } from "./react-column";
import type { ColumnEntry } from "./react-grid-columns";
import type { TableSelectionMode } from "./react-grid-selection";
import type { ScrollOffset } from "./react-grid-window";
import type { VirtualRange } from "./virtualization";

/** Roving-tabindex cell focus and keyboard navigation across the virtualized grid. */
export function useGridFocus<TRow>({
  centerEntries,
  centerWidths,
  columnRange,
  leftEntries,
  navigationColumnIndexById,
  navigationColumnOffset,
  navigationColumns,
  onRowClick,
  rightEntries,
  rowCount,
  rowHeight,
  rowRange,
  scrollOffsetRef,
  scrollRef,
  scrollTo,
  selectionMode,
  showRowIndex,
  stickyLeftWidth,
  stickyRightWidth,
  updateSelectionForRow,
  viewport,
  visibleCenterEntries,
}: {
  centerEntries: readonly ColumnEntry<TRow>[];
  centerWidths: readonly number[];
  columnRange: VirtualRange;
  leftEntries: readonly ColumnEntry<TRow>[];
  navigationColumnIndexById: ReadonlyMap<string, number>;
  navigationColumnOffset: number;
  navigationColumns: readonly TableColumn<TRow>[];
  onRowClick: ((row: TRow, rowIndex: number) => void) | undefined;
  rightEntries: readonly ColumnEntry<TRow>[];
  rowCount: number;
  rowHeight: number;
  rowRange: VirtualRange;
  scrollOffsetRef: RefObject<ScrollOffset>;
  scrollRef: RefObject<HTMLElement | null>;
  scrollTo: (next: ScrollOffset) => void;
  selectionMode: TableSelectionMode;
  showRowIndex: boolean;
  stickyLeftWidth: number;
  stickyRightWidth: number;
  updateSelectionForRow: (
    row: TRow,
    rowIndex: number,
    key: TableRowKey,
    options?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  ) => void;
  viewport: { height: number; width: number };
  visibleCenterEntries: readonly ColumnEntry<TRow>[];
}) {
  const pendingGridFocusRef = useRef<GridPosition | null>(null);

  const [activeGridPosition, setActiveGridPosition] = useState<GridPosition>({
    columnIndex: 0,
    rowIndex: 0,
  });
  const navigationColumnCount = navigationColumns.length + navigationColumnOffset;
  const gridPageSize = Math.max(
    1,
    Math.floor(Math.max(1, viewport.height - rowHeight) / rowHeight),
  );
  const renderedNavigationColumnIndices = useMemo(() => {
    const indices: number[] = showRowIndex ? [0] : [];

    for (const entry of [
      ...leftEntries,
      ...visibleCenterEntries,
      ...rightEntries,
    ]) {
      const columnIndex = navigationColumnIndexById.get(entry.column.id);
      if (columnIndex !== undefined) {
        indices.push(columnIndex);
      }
    }

    return indices;
  }, [
    leftEntries,
    rightEntries,
    navigationColumnIndexById,
    showRowIndex,
    visibleCenterEntries,
  ]);
  const activeGridCellIsRendered =
    activeGridPosition.rowIndex >= rowRange.startIndex &&
    activeGridPosition.rowIndex < rowRange.endIndex &&
    renderedNavigationColumnIndices.includes(activeGridPosition.columnIndex);
  const rovingGridPosition = activeGridCellIsRendered
    ? activeGridPosition
    : {
        columnIndex: renderedNavigationColumnIndices[0] ?? 0,
        rowIndex: rowRange.startIndex,
      };

  useEffect(() => {
    setActiveGridPosition((current) => {
      const rowIndex = rowCount > 0
        ? Math.min(current.rowIndex, rowCount - 1)
        : 0;
      const columnIndex = navigationColumnCount > 0
        ? Math.min(current.columnIndex, navigationColumnCount - 1)
        : 0;

      return rowIndex === current.rowIndex && columnIndex === current.columnIndex
        ? current
        : { columnIndex, rowIndex };
    });
  }, [rowCount, navigationColumnCount]);

  useLayoutEffect(() => {
    const pending = pendingGridFocusRef.current;
    if (!pending) {
      return;
    }

    const cell = scrollRef.current?.querySelector<HTMLElement>(
      `[data-grid-row-index="${pending.rowIndex}"][data-grid-column-index="${pending.columnIndex}"]`,
    );
    if (cell) {
      pendingGridFocusRef.current = null;
      cell.focus({ preventScroll: true });
    }
  }, [activeGridPosition, columnRange, rowRange, scrollRef]);

  const focusGridPosition = useCallback(
    (position: GridPosition) => {
      if (
        position.rowIndex < 0 ||
        position.rowIndex >= rowCount ||
        position.columnIndex < 0 ||
        position.columnIndex >= navigationColumnCount
      ) {
        return;
      }

      let nextTop = scrollOffsetRef.current.top;
      if (position.rowIndex < rowRange.startIndex) {
        nextTop = position.rowIndex * rowHeight;
      } else if (position.rowIndex >= rowRange.endIndex) {
        const bodyViewportHeight = Math.max(rowHeight, viewport.height - rowHeight);
        nextTop = Math.max(0, (position.rowIndex + 1) * rowHeight - bodyViewportHeight);
      }

      let nextLeft = scrollOffsetRef.current.left;
      const navigationIndex = position.columnIndex - navigationColumnOffset;
      const targetColumn = navigationColumns[navigationIndex];
      if (targetColumn && targetColumn.sticky === undefined) {
        const centerIndex = centerEntries.findIndex(
          (entry) => entry.column.id === targetColumn.id,
        );
        if (centerIndex >= 0) {
          const targetStart =
            stickyLeftWidth +
            centerWidths.slice(0, centerIndex).reduce((sum, width) => sum + width, 0);
          const targetEnd = targetStart + (centerWidths[centerIndex] ?? 0);
          const visibleStart = nextLeft + stickyLeftWidth;
          const visibleEnd = nextLeft + Math.max(1, viewport.width - stickyRightWidth);

          if (targetStart < visibleStart) {
            nextLeft = Math.max(0, targetStart - stickyLeftWidth);
          } else if (targetEnd > visibleEnd) {
            nextLeft = Math.max(
              0,
              targetEnd - Math.max(1, viewport.width - stickyRightWidth),
            );
          }
        }
      }

      pendingGridFocusRef.current = position;
      scrollTo({ left: nextLeft, top: nextTop });
      setActiveGridPosition(position);
    },
    [
      centerEntries,
      centerWidths,
      navigationColumnCount,
      navigationColumnOffset,
      navigationColumns,
      rowCount,
      rowHeight,
      rowRange.endIndex,
      rowRange.startIndex,
      scrollOffsetRef,
      scrollTo,
      stickyLeftWidth,
      stickyRightWidth,
      viewport.height,
      viewport.width,
    ],
  );

  const handleGridCellKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLElement>,
      row: TRow,
      rowIndex: number,
      key: TableRowKey,
      columnIndex: number,
    ) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      const nextPosition = getNextGridPosition({
        columnCount: navigationColumnCount,
        ctrlKey: event.ctrlKey || event.metaKey,
        current: { columnIndex, rowIndex },
        key: event.key,
        pageSize: gridPageSize,
        rowCount: rowCount,
      });
      if (nextPosition) {
        event.preventDefault();
        focusGridPosition(nextPosition);
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      updateSelectionForRow(row, rowIndex, key, {
        ctrlKey: selectionMode === "multiple" ? true : event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
      onRowClick?.(row, rowIndex);
    },
    [
      focusGridPosition,
      gridPageSize,
      rowCount,
      navigationColumnCount,
      onRowClick,
      selectionMode,
      updateSelectionForRow,
    ],
  );

  return { handleGridCellKeyDown, rovingGridPosition, setActiveGridPosition };
}
