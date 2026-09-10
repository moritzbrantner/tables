import type { RefObject } from "react";

import {
  getColumnStickyGroup,
  isColumnVisible,
  resolveRenderedColumnOrder,
} from "./column-layout";
import type { TableColumnOrderState, TableColumnVisibilityState } from "./data";
import { getColumnLabel, type TableColumn } from "./react-column";

export function TableOptionsMenu<TRow>({
  columnOrder,
  columnVisibility,
  columns,
  id,
  menuRef,
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
  setColumnOrder: (columnOrder: TableColumnOrderState) => void;
  setColumnVisibility: (columnVisibility: TableColumnVisibilityState) => void;
  x: number;
  y: number;
}) {
  const orderedColumns = resolveRenderedColumnOrder(columns, columnOrder);
  const moveColumn = (columnId: string, offset: -1 | 1) => {
    const ids = orderedColumns.map((column) => column.id);
    const index = ids.indexOf(columnId);
    const nextIndex = index + offset;
    const column = orderedColumns[index];
    const nextColumn = orderedColumns[nextIndex];

    if (
      !column ||
      !nextColumn ||
      getColumnStickyGroup(column) !== getColumnStickyGroup(nextColumn)
    ) {
      return;
    }

    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    setColumnOrder(ids);
  };

  return (
    <div
      aria-label="Table options"
      className="mb-table__column-menu mb-table__table-menu"
      id={id}
      ref={menuRef}
      role="dialog"
      style={{ left: x, top: y }}
    >
      <div className="mb-table__table-menu-title">Columns</div>
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
            <div className="mb-table__table-menu-column" key={column.id}>
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
                <button
                  aria-label={`Move ${label} up`}
                  className="mb-table__table-menu-move"
                  disabled={!canMoveUp}
                  onClick={() => moveColumn(column.id, -1)}
                  type="button"
                >
                  <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
                    <path d="M4 10 8 6l4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
                  </svg>
                </button>
                <button
                  aria-label={`Move ${label} down`}
                  className="mb-table__table-menu-move"
                  disabled={!canMoveDown}
                  onClick={() => moveColumn(column.id, 1)}
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
          Show all columns
        </button>
        <button
          className="mb-table__column-menu-button"
          disabled={columnOrder.length === 0}
          onClick={() => setColumnOrder([])}
          type="button"
        >
          Reset order
        </button>
      </div>
    </div>
  );
}
