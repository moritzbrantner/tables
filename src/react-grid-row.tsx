import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

import { getColumnValue, type TableRowKey } from "./data";
import type { GridPosition } from "./grid-navigation";
import {
  cellClassName,
  getStickyStyle,
  renderSpacer,
  type ColumnEntry,
} from "./react-grid-columns";

export type GridRowSharedProps<TRow> = {
  gridTemplateColumns: string;
  handleGridCellKeyDown: (
    event: KeyboardEvent<HTMLElement>,
    row: TRow,
    rowIndex: number,
    key: TableRowKey,
    columnIndex: number,
  ) => void;
  handleRowClick: (
    event: ReactMouseEvent<HTMLDivElement>,
    row: TRow,
    rowIndex: number,
    key: TableRowKey,
  ) => void;
  leftEntries: readonly ColumnEntry<TRow>[];
  navigationColumnIndexById: ReadonlyMap<string, number>;
  offsetAfter: number;
  offsetBefore: number;
  resolvedRowIndexOffset: number;
  rightEntries: readonly ColumnEntry<TRow>[];
  rovingGridPosition: GridPosition;
  setActiveGridPosition: (position: GridPosition) => void;
  showRowIndex: boolean;
  visibleCenterEntries: readonly ColumnEntry<TRow>[];
};

export function GridRow<TRow>({
  gridTemplateColumns,
  handleGridCellKeyDown,
  handleRowClick,
  interactive,
  leftEntries,
  navigationColumnIndexById,
  offsetAfter,
  offsetBefore,
  resolvedRowIndexOffset,
  rightEntries,
  rovingGridPosition,
  row,
  rowIndex,
  rowKeyValue,
  selectable,
  selected,
  selectionEnabled,
  setActiveGridPosition,
  showRowIndex,
  visibleCenterEntries,
}: GridRowSharedProps<TRow> & {
  interactive: boolean;
  row: TRow;
  rowIndex: number;
  rowKeyValue: TableRowKey;
  selectable: boolean;
  selected: boolean;
  selectionEnabled: boolean;
}) {
  const renderRowCell = (
    entry: ColumnEntry<TRow>,
    columnIndex: number,
    sticky: "left" | "right" | null,
  ) => {
    const value = getColumnValue(entry.column, row, rowIndex);

    return (
      <div
        aria-colindex={entry.originalIndex + (showRowIndex ? 2 : 1)}
        className={cellClassName("mb-table__cell", entry.column, { sticky })}
        data-grid-column-index={columnIndex}
        data-grid-row-index={rowIndex}
        key={entry.column.id}
        onFocus={() => setActiveGridPosition({ columnIndex, rowIndex })}
        onKeyDown={(event) =>
          handleGridCellKeyDown(event, row, rowIndex, rowKeyValue, columnIndex)
        }
        role="gridcell"
        style={getStickyStyle(entry)}
        tabIndex={
          rovingGridPosition.rowIndex === rowIndex &&
          rovingGridPosition.columnIndex === columnIndex
            ? 0
            : -1
        }
        title={typeof value === "string" ? value : undefined}
      >
        {entry.column.cell
          ? entry.column.cell({ columnId: entry.column.id, row, rowIndex, value })
          : renderCellValue(value)}
      </div>
    );
  };

  return (
    <div
      aria-rowindex={resolvedRowIndexOffset + rowIndex + 2}
      aria-selected={selectionEnabled ? selected : undefined}
      className={[
        "mb-table__row",
        selected ? "mb-table__row--selected" : "",
        selectable ? "mb-table__row--selectable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={interactive ? (event) => handleRowClick(event, row, rowIndex, rowKeyValue) : undefined}
      role="row"
      style={{ gridTemplateColumns }}
    >
      {showRowIndex ? (
        <div
          aria-colindex={1}
          className="mb-table__cell mb-table__index-cell mb-table__cell--sticky-left"
          data-grid-column-index={0}
          data-grid-row-index={rowIndex}
          onFocus={() => setActiveGridPosition({ columnIndex: 0, rowIndex })}
          onKeyDown={(event) => handleGridCellKeyDown(event, row, rowIndex, rowKeyValue, 0)}
          role="rowheader"
          style={{ left: 0 }}
          tabIndex={
            rovingGridPosition.rowIndex === rowIndex &&
            rovingGridPosition.columnIndex === 0
              ? 0
              : -1
          }
        >
          {resolvedRowIndexOffset + rowIndex + 1}
        </div>
      ) : null}
      {leftEntries.map((entry) =>
        renderRowCell(entry, navigationColumnIndexById.get(entry.column.id) ?? 0, "left"),
      )}
      {renderSpacer("before", offsetBefore)}
      {visibleCenterEntries.map((entry) =>
        renderRowCell(entry, navigationColumnIndexById.get(entry.column.id) ?? 0, null),
      )}
      {renderSpacer("after", offsetAfter)}
      {rightEntries.map((entry) =>
        renderRowCell(entry, navigationColumnIndexById.get(entry.column.id) ?? 0, "right"),
      )}
    </div>
  );
}

function renderCellValue(value: unknown) {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toLocaleString();
  }

  return String(value);
}
