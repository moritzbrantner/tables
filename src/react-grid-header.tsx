import {
  getColumnMenuId,
  hasActiveColumnFilter,
  hasColumnMenuActions,
  isButtonMenuEnabled,
  isContextMenuEnabled,
  type resolveColumnMenuOptions,
} from "./column-menu";
import {
  getNextSortState,
  isColumnSortable,
  type TableFilter,
  type TableSortRule,
  type TableSortState,
} from "./data";
import type { TableMessages } from "./messages";
import { getColumnLabel, type TableColumn } from "./react-column";
import {
  cellClassName,
  getStickyStyle,
  renderSpacer,
  type ColumnEntry,
} from "./react-grid-columns";
import { tableMenuId, type GridMenuController } from "./react-grid-menu";
import type { useColumnResize } from "./react-grid-resize";

export function GridHeader<TRow>({
  columnMenuOptions,
  columnResizing,
  filter,
  gridTemplateColumns,
  leftEntries,
  menu,
  messages,
  offsetAfter,
  offsetBefore,
  resize,
  rightEntries,
  setSort,
  showRowIndex,
  sort,
  visibleCenterEntries,
}: {
  columnMenuOptions: ReturnType<typeof resolveColumnMenuOptions>;
  columnResizing: boolean;
  filter: TableFilter<TRow> | null;
  gridTemplateColumns: string;
  leftEntries: readonly ColumnEntry<TRow>[];
  menu: GridMenuController<TRow>;
  messages: TableMessages;
  offsetAfter: number;
  offsetBefore: number;
  resize: ReturnType<typeof useColumnResize<TRow>>;
  rightEntries: readonly ColumnEntry<TRow>[];
  setSort: (sort: TableSortState) => void;
  showRowIndex: boolean;
  sort: TableSortState;
  visibleCenterEntries: readonly ColumnEntry<TRow>[];
}) {
  const { menuState } = menu;
  const updateSort = (column: TableColumn<TRow>, multi: boolean) => {
    if (!isColumnSortable(column)) {
      return;
    }

    setSort(getNextSortState(sort, column.id, multi));
  };

  const renderHeaderCell = (entry: ColumnEntry<TRow>, sticky: "left" | "right" | null) => {
    const { column, originalIndex, width } = entry;
    const hasMenuActions = hasColumnMenuActions(column, columnMenuOptions);
    const showMenuButton = isButtonMenuEnabled(columnMenuOptions) && hasMenuActions;
    const isMenuOpen = menuState?.kind === "column" && menuState.columnId === column.id;
    const canResize = columnResizing && column.resizable !== false;
    const label = getColumnLabel(column);
    const menuId = getColumnMenuId(column.id);
    const sortRule = getSortRule(sort, column.id);

    return (
      <div
        aria-colindex={originalIndex + (showRowIndex ? 2 : 1)}
        aria-sort={isColumnSortable(column) ? getAriaSort(sort, column.id) : undefined}
        className={cellClassName("mb-table__header-cell", column, {
          filtered: hasActiveColumnFilter(filter, column.id),
          menuOpen: isMenuOpen,
          resizing: resize.resizeState?.columnId === column.id,
          sticky,
        })}
        key={column.id}
        onContextMenu={(event) => menu.handleHeaderContextMenu(event, column)}
        onKeyDown={(event) => menu.handleHeaderKeyDown(event, column)}
        role="columnheader"
        style={getStickyStyle(entry)}
        tabIndex={isContextMenuEnabled(columnMenuOptions) && hasMenuActions ? 0 : undefined}
      >
        <span className="mb-table__header-label">{column.header}</span>
        {isColumnSortable(column) ? (
          <button
            aria-label={getSortButtonLabel(messages, label, sortRule)}
            className="mb-table__sort-button"
            onClick={(event) => updateSort(column, event.shiftKey)}
            type="button"
          >
            <span aria-hidden="true" className="mb-table__sort-indicator">
              {getSortIndicator(sort, column.id)}
            </span>
          </button>
        ) : null}
        {showMenuButton ? (
          <button
            aria-controls={isMenuOpen ? menuId : undefined}
            aria-expanded={isMenuOpen}
            aria-haspopup="dialog"
            aria-label={messages.openColumnActions(label)}
            className={[
              "mb-table__column-menu-trigger",
              isMenuOpen ? "mb-table__column-menu-trigger--open" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={(event) => menu.handleMenuButtonClick(event, column)}
            type="button"
          >
            ...
          </button>
        ) : null}
        {canResize ? (
          <button
            aria-label={messages.resizeColumn(label)}
            className="mb-table__resize-handle"
            onDoubleClick={(event) => resize.resetColumnWidth(event, column)}
            onKeyDown={(event) => resize.handleResizeKeyDown(event, column, width)}
            onPointerDown={(event) => resize.handleResizePointerDown(event, column, width)}
            type="button"
          />
        ) : null}
      </div>
    );
  };

  return (
    <div
      aria-rowindex={1}
      className="mb-table__header"
      role="row"
      style={{ gridTemplateColumns }}
    >
      {showRowIndex ? (
        <div
          aria-colindex={1}
          className={[
            "mb-table__header-cell",
            "mb-table__index-header",
            "mb-table__header-cell--sticky-left",
            menuState?.kind === "table" ? "mb-table__header-cell--menu-open" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="columnheader"
          style={{ left: 0 }}
        >
          <button
            aria-controls={menuState?.kind === "table" ? tableMenuId : undefined}
            aria-expanded={menuState?.kind === "table"}
            aria-haspopup="dialog"
            aria-label={messages.openTableOptions}
            className="mb-table__index-menu-trigger"
            onClick={menu.handleTableMenuButtonClick}
            type="button"
          />
        </div>
      ) : null}
      {leftEntries.map((entry) => renderHeaderCell(entry, "left"))}
      {renderSpacer("before", offsetBefore)}
      {visibleCenterEntries.map((entry) => renderHeaderCell(entry, null))}
      {renderSpacer("after", offsetAfter)}
      {rightEntries.map((entry) => renderHeaderCell(entry, "right"))}
    </div>
  );
}

function getSortRule(sort: TableSortState, columnId: string): TableSortRule | null {
  return sort.find((rule) => rule.columnId === columnId) ?? null;
}

function getSortIndicator(sort: TableSortState, columnId: string) {
  const index = sort.findIndex((rule) => rule.columnId === columnId);
  const direction = index < 0 ? null : sort[index].direction;

  return (
    <>
      {index > 0 ? <span className="mb-table__sort-priority">{index + 1}</span> : null}
      <svg
        className="mb-table__sort-caret"
        data-sort-direction={direction ?? "none"}
        fill="none"
        focusable="false"
        height="14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        viewBox="0 0 16 16"
        width="14"
      >
        {direction === "asc" ? (
          <path d="M4 10 8 6l4 4" />
        ) : direction === "desc" ? (
          <path d="m4 6 4 4 4-4" />
        ) : (
          <>
            <path d="M4 6.5 8 3l4 3.5" />
            <path d="m4 9.5 4 3.5 4-3.5" />
          </>
        )}
      </svg>
    </>
  );
}

function getAriaSort(sort: TableSortState, columnId: string) {
  const index = sort.findIndex((rule) => rule.columnId === columnId);

  if (index < 0) {
    return "none";
  }

  if (index > 0) {
    return "other";
  }

  return sort[index].direction === "asc" ? "ascending" : "descending";
}

function getSortButtonLabel(
  messages: TableMessages,
  label: string,
  rule: TableSortRule | null,
) {
  if (!rule) {
    return messages.sortAscending(label);
  }

  if (rule.direction === "asc") {
    return messages.sortDescending(label);
  }

  return messages.clearSort(label);
}
