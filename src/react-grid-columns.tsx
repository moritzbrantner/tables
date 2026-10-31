import { useMemo, type CSSProperties } from "react";

import type { TableColumnSizingState } from "./data";
import type { TableColumn } from "./react-column";
import { createVariableVirtualLayout } from "./virtualization";

export type ColumnEntry<TRow> = {
  column: TableColumn<TRow>;
  originalIndex: number;
  right?: number;
  left?: number;
  width: number;
};

const defaultColumnWidth = 160;
const defaultMinColumnWidth = 72;
const defaultMaxColumnWidth = 640;

/** Column widths, sticky groups and the center-column layout, including any in-progress resize. */
export function useGridColumnLayout<TRow>({
  columnSizing,
  resizingColumn,
  rowIndexWidth,
  visibleColumns,
}: {
  columnSizing: TableColumnSizingState;
  resizingColumn: { columnId: string; currentWidth: number } | null;
  rowIndexWidth: number;
  visibleColumns: readonly TableColumn<TRow>[];
}) {
  const columnWidths = useMemo(
    () =>
      visibleColumns.map((column) =>
        resolveColumnWidth(
          column,
          resizingColumn?.columnId === column.id
            ? resizingColumn.currentWidth
            : columnSizing[column.id],
        ),
      ),
    [columnSizing, resizingColumn, visibleColumns],
  );

  const columnEntries = useMemo(
    () => createColumnEntries(visibleColumns, columnWidths, rowIndexWidth),
    [columnWidths, rowIndexWidth, visibleColumns],
  );
  const totalColumnWidth = useMemo(
    () => rowIndexWidth + columnWidths.reduce((sum, width) => sum + width, 0),
    [columnWidths, rowIndexWidth],
  );
  const stickyLeftWidth = useMemo(
    () => rowIndexWidth + columnEntries.left.reduce((sum, entry) => sum + entry.width, 0),
    [columnEntries.left, rowIndexWidth],
  );
  const stickyRightWidth = useMemo(
    () => columnEntries.right.reduce((sum, entry) => sum + entry.width, 0),
    [columnEntries.right],
  );
  const centerWidths = useMemo(
    () => columnEntries.center.map((entry) => entry.width),
    [columnEntries.center],
  );
  const centerLayout = useMemo(
    () => createVariableVirtualLayout(centerWidths),
    [centerWidths],
  );

  return {
    centerLayout,
    centerWidths,
    columnEntries,
    stickyLeftWidth,
    stickyRightWidth,
    totalColumnWidth,
  };
}

function resolveColumnWidth<TRow>(column: TableColumn<TRow>, width?: number): number {
  return clampColumnWidth(column, width ?? column.width ?? defaultColumnWidth);
}

export function clampColumnWidth<TRow>(column: TableColumn<TRow> | undefined, width: number): number {
  return Math.max(
    column?.minWidth ?? defaultMinColumnWidth,
    Math.min(column?.maxWidth ?? defaultMaxColumnWidth, width),
  );
}

function createColumnEntries<TRow>(
  columns: readonly TableColumn<TRow>[],
  columnWidths: readonly number[],
  leftStartOffset = 0,
) {
  const left: ColumnEntry<TRow>[] = [];
  const center: ColumnEntry<TRow>[] = [];
  const right: ColumnEntry<TRow>[] = [];
  let leftOffset = leftStartOffset;

  columns.forEach((column, originalIndex) => {
    const entry: ColumnEntry<TRow> = {
      column,
      originalIndex,
      width: columnWidths[originalIndex] ?? defaultColumnWidth,
    };

    if (column.sticky === "left") {
      left.push({
        ...entry,
        left: leftOffset,
      });
      leftOffset += entry.width;
      return;
    }

    if (column.sticky === "right") {
      right.push(entry);
      return;
    }

    center.push(entry);
  });

  let rightOffset = 0;
  const rightWithOffsets = [...right].reverse().map((entry) => {
    const nextEntry = {
      ...entry,
      right: rightOffset,
    };

    rightOffset += entry.width;

    return nextEntry;
  }).reverse();

  return {
    center,
    left,
    right: rightWithOffsets,
  };
}

export function createGridTemplateColumns(
  rowIndexWidth: number,
  leftWidths: readonly number[],
  offsetBefore: number,
  columnWidths: readonly number[],
  offsetAfter: number,
  rightWidths: readonly number[],
) {
  return [
    rowIndexWidth > 0 ? `${rowIndexWidth}px` : null,
    ...leftWidths.map((width) => `${width}px`),
    offsetBefore > 0 ? `${offsetBefore}px` : null,
    ...columnWidths.map((width) => `${width}px`),
    offsetAfter > 0 ? `${offsetAfter}px` : null,
    ...rightWidths.map((width) => `${width}px`),
  ]
    .filter(Boolean)
    .join(" ");
}

export function renderSpacer(position: "after" | "before", width: number) {
  return width > 0 ? (
    <div aria-hidden="true" className={`mb-table__spacer mb-table__spacer--${position}`} />
  ) : null;
}

export function getStickyStyle<TRow>(entry: ColumnEntry<TRow>): CSSProperties | undefined {
  if (entry.left !== undefined) {
    return { left: entry.left };
  }

  if (entry.right !== undefined) {
    return { right: entry.right };
  }

  return undefined;
}

export function cellClassName<TRow>(
  baseClassName: string,
  column: TableColumn<TRow>,
  state?: {
    filtered?: boolean;
    menuOpen?: boolean;
    resizing?: boolean;
    sticky?: "left" | "right" | null;
  },
) {
  return [
    baseClassName,
    column.align ? `${baseClassName}--${column.align}` : "",
    state?.filtered ? `${baseClassName}--filtered` : "",
    state?.menuOpen ? `${baseClassName}--menu-open` : "",
    state?.resizing ? `${baseClassName}--resizing` : "",
    state?.sticky ? `${baseClassName}--sticky-${state.sticky}` : "",
    column.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
