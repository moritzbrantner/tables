import { useState, type DragEvent, type RefObject } from "react";

import {
  getColumnStickyGroup,
  isColumnVisible,
  resolveRenderedColumnOrder,
} from "./column-layout";
import type { TableColumnOrderState, TableColumnVisibilityState } from "./data";
import type { TableMessages } from "./messages";
import { getColumnLabel, type TableColumn } from "./react-column";

export function reorderTableColumns<TRow>(
  columns: readonly TableColumn<TRow>[],
  columnOrder: TableColumnOrderState,
  sourceColumnId: string,
  targetColumnId: string,
): TableColumnOrderState {
  const orderedColumns = resolveRenderedColumnOrder(columns, columnOrder);
  const sourceIndex = orderedColumns.findIndex((column) => column.id === sourceColumnId);
  const targetIndex = orderedColumns.findIndex((column) => column.id === targetColumnId);
  const sourceColumn = orderedColumns[sourceIndex];
  const targetColumn = orderedColumns[targetIndex];

  if (
    !sourceColumn ||
    !targetColumn ||
    sourceIndex === targetIndex ||
    getColumnStickyGroup(sourceColumn) !== getColumnStickyGroup(targetColumn)
  ) {
    return columnOrder;
  }

  const ids = orderedColumns.map((column) => column.id);
  const [movedColumnId] = ids.splice(sourceIndex, 1);
  if (!movedColumnId) {
    return columnOrder;
  }

  ids.splice(targetIndex, 0, movedColumnId);
  return ids;
}

export function TableOptionsMenu<TRow>({
  columnOrder,
  columnVisibility,
  columns,
  id,
  menuRef,
  messages,
  setColumnOrder,
  setColumnVisibility,
  x,
  y,
}: {
  columnOrder: TableColumnOrderState;
  columnVisibility: TableColumnVisibilityState;
  columns: readonly TableColumn<TRow>[];
  id: string;
  menuRef: RefObject<HTMLDivElement | null>;
  messages: TableMessages;
  setColumnOrder: (columnOrder: TableColumnOrderState) => void;
  setColumnVisibility: (columnVisibility: TableColumnVisibilityState) => void;
  x: number;
  y: number;
}) {
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const orderedColumns = resolveRenderedColumnOrder(columns, columnOrder);
  const moveColumn = (sourceColumnId: string, targetColumnId: string) => {
    const nextColumnOrder = reorderTableColumns(
      columns,
      columnOrder,
      sourceColumnId,
      targetColumnId,
    );
    if (nextColumnOrder !== columnOrder) {
      setColumnOrder(nextColumnOrder);
    }
  };
  const moveColumnByOffset = (columnId: string, offset: -1 | 1) => {
    const index = orderedColumns.findIndex((column) => column.id === columnId);
    const targetColumn = orderedColumns[index + offset];
    if (targetColumn) {
      moveColumn(columnId, targetColumn.id);
    }
  };
  const canDropOnColumn = (targetColumnId: string) => {
    if (!draggedColumnId || draggedColumnId === targetColumnId) {
      return false;
    }

    const draggedColumn = orderedColumns.find((column) => column.id === draggedColumnId);
    const targetColumn = orderedColumns.find((column) => column.id === targetColumnId);
    return Boolean(
      draggedColumn &&
        targetColumn &&
        getColumnStickyGroup(draggedColumn) === getColumnStickyGroup(targetColumn),
    );
  };
  const handleDragStart = (event: DragEvent<HTMLElement>, columnId: string) => {
    setDraggedColumnId(columnId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnId);
  };
  const handleDragOver = (event: DragEvent<HTMLDivElement>, targetColumnId: string) => {
    if (!canDropOnColumn(targetColumnId)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>, targetColumnId: string) => {
    if (!draggedColumnId || !canDropOnColumn(targetColumnId)) {
      return;
    }

    event.preventDefault();
    moveColumn(draggedColumnId, targetColumnId);
    setDraggedColumnId(null);
  };

  return (
    <div
      aria-label={messages.tableOptions}
      className="mb-table__column-menu mb-table__table-menu"
      id={id}
      ref={menuRef}
      role="dialog"
      style={{ left: x, top: y }}
    >
      <div className="mb-table__table-menu-title">{messages.columns}</div>
      <div className="mb-table__table-menu-columns">
        {orderedColumns.map((column, index) => {
          const label = getColumnLabel(column);
          const stickyGroup = getColumnStickyGroup(column);
          const previousColumn = orderedColumns[index - 1];
          const nextColumn = orderedColumns[index + 1];
          const canMoveUp =
            previousColumn !== undefined && getColumnStickyGroup(previousColumn) === stickyGroup;
          const canMoveDown =
            nextColumn !== undefined && getColumnStickyGroup(nextColumn) === stickyGroup;

          return (
            <div
              className="mb-table__table-menu-column"
              key={column.id}
              onDragOver={(event) => handleDragOver(event, column.id)}
              onDrop={(event) => handleDrop(event, column.id)}
            >
              <label className="mb-table__table-menu-visibility">
                <input
                  checked={isColumnVisible(columnVisibility, column.id)}
                  onChange={(event) =>
                    setColumnVisibility({
                      ...columnVisibility,
                      [column.id]: event.currentTarget.checked,
                    })
                  }
                  type="checkbox"
                />
                <span>{label}</span>
              </label>
              <div className="mb-table__table-menu-reorder">
                <span
                  aria-hidden="true"
                  className="mb-table__table-menu-move"
                  draggable
                  onDragEnd={() => setDraggedColumnId(null)}
                  onDragStart={(event) => handleDragStart(event, column.id)}
                  style={{ cursor: draggedColumnId === column.id ? "grabbing" : "grab" }}
                >
                  <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 16 16" width="14">
                    <circle cx="5" cy="4" r="1" />
                    <circle cx="11" cy="4" r="1" />
                    <circle cx="5" cy="8" r="1" />
                    <circle cx="11" cy="8" r="1" />
                    <circle cx="5" cy="12" r="1" />
                    <circle cx="11" cy="12" r="1" />
                  </svg>
                </span>
                <button
                  aria-label={messages.moveColumnUp(label)}
                  className="mb-table__table-menu-move"
                  disabled={!canMoveUp}
                  onClick={() => moveColumnByOffset(column.id, -1)}
                  type="button"
                >
                  <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
                    <path d="M4 10 8 6l4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
                  </svg>
                </button>
                <button
                  aria-label={messages.moveColumnDown(label)}
                  className="mb-table__table-menu-move"
                  disabled={!canMoveDown}
                  onClick={() => moveColumnByOffset(column.id, 1)}
                  type="button"
                >
                  <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
                    <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mb-table__table-menu-actions">
        <button
          className="mb-table__column-menu-button"
          disabled={Object.values(columnVisibility).every((visible) => visible !== false)}
          onClick={() => setColumnVisibility({})}
          type="button"
        >
          {messages.showAllColumns}
        </button>
        <button
          className="mb-table__column-menu-button"
          disabled={columnOrder.length === 0}
          onClick={() => setColumnOrder([])}
          type="button"
        >
          {messages.resetOrder}
        </button>
      </div>
    </div>
  );
}
