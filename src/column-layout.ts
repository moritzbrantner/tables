import type {
  TableColumnOrderState,
  TableColumnSticky,
  TableColumnVisibilityState,
} from "./data";

type LayoutColumn = {
  id: string;
  sticky?: TableColumnSticky;
};

export function resolveColumnOrder<TColumn extends { id: string }>(
  columns: readonly TColumn[],
  columnOrder?: TableColumnOrderState,
): TColumn[] {
  const remaining = new Map(columns.map((column) => [column.id, column]));
  const ordered: TColumn[] = [];

  for (const columnId of columnOrder ?? []) {
    const column = remaining.get(columnId);
    if (column) {
      ordered.push(column);
      remaining.delete(columnId);
    }
  }

  for (const column of columns) {
    if (remaining.has(column.id)) {
      ordered.push(column);
    }
  }

  return ordered;
}

export function resolveRenderedColumnOrder<TColumn extends LayoutColumn>(
  columns: readonly TColumn[],
  columnOrder?: TableColumnOrderState,
): TColumn[] {
  const orderedColumns = resolveColumnOrder(columns, columnOrder);
  const left: TColumn[] = [];
  const center: TColumn[] = [];
  const right: TColumn[] = [];

  for (const column of orderedColumns) {
    const stickyGroup = getColumnStickyGroup(column);

    if (stickyGroup === "left") {
      left.push(column);
    } else if (stickyGroup === "right") {
      right.push(column);
    } else {
      center.push(column);
    }
  }

  return [...left, ...center, ...right];
}

export function getColumnStickyGroup(column: Pick<LayoutColumn, "sticky">) {
  return column.sticky === "left" ? "left" : column.sticky === "right" ? "right" : "center";
}

export function isColumnVisible(
  columnVisibility: TableColumnVisibilityState | undefined,
  columnId: string,
) {
  return columnVisibility?.[columnId] !== false;
}
