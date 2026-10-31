import {
  useMemo,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  ColumnMenu,
  getColumnMenuId,
  resolveColumnMenuOptions,
  type TableColumnMenuOptions,
} from "./column-menu";
import { isColumnVisible, resolveColumnOrder, resolveRenderedColumnOrder } from "./column-layout";
import {
  createTableModel,
  getTableRowKey,
  type TableModel,
  type TableRowKeyAccessor,
  type TableState,
  type TableStateChange,
} from "./data";
import {
  resolveTableMessages,
  type TableMessageOverrides,
} from "./messages";
import type { TableColumn } from "./react-column";
import { createGridTemplateColumns, useGridColumnLayout } from "./react-grid-columns";
import { useGridFocus } from "./react-grid-focus";
import { GridHeader } from "./react-grid-header";
import { tableMenuId, useGridMenu } from "./react-grid-menu";
import { useColumnResize, type ColumnResizeMode } from "./react-grid-resize";
import { GridRow, type GridRowSharedProps } from "./react-grid-row";
import { useRowSelection, type TableSelectionMode } from "./react-grid-selection";
import { useElementSize, useGridWindow } from "./react-grid-window";
import { TableOptionsMenu } from "./table-options";
import { useTableStateController } from "./use-table-state";

export type TableProcessingMode = "client" | "manual";

export type { TableSelectionMode } from "./react-grid-selection";

export { createTableColumnHelper } from "./react-column";
export type { TableColumn } from "./react-column";

export type { ColumnResizeMode } from "./react-grid-resize";

export type { TableColumnMenuOptions, TableColumnMenuTrigger } from "./column-menu";

type VirtualTableOwnProps<TRow> = {
  ariaLabel?: string;
  columnMenu?: boolean | TableColumnMenuOptions;
  columnOverscan?: number;
  columnResizeMode?: ColumnResizeMode;
  columnResizing?: boolean;
  columnVirtualization?: boolean;
  columns: readonly TableColumn<TRow>[];
  emptyState?: ReactNode;
  filteredRowCount?: number;
  height?: number | string;
  initialState?: Partial<TableState<TRow>>;
  /** Locale used by built-in client-side text matching and sorting. */
  locale?: string | readonly string[];
  messages?: TableMessageOverrides;
  isRowSelectable?: (row: TRow, rowIndex: number) => boolean;
  loading?: boolean;
  loadingState?: ReactNode;
  mode?: TableProcessingMode;
  onModelChange?: (model: TableModel<TRow>) => void;
  onRowClick?: (row: TRow, rowIndex: number) => void;
  onStateChange?: (change: TableStateChange<TRow>) => void;
  overscan?: number;
  rowHeight?: number;
  /** Zero-based position of the first supplied row within a manual/server result. */
  rowIndexOffset?: number;
  rowKey: TableRowKeyAccessor<TRow>;
  rows: readonly TRow[];
  selectionMode?: TableSelectionMode;
  showRowIndex?: boolean;
  sortedRowCount?: number;
  state?: Partial<TableState<TRow>>;
  striped?: boolean;
  totalRowCount?: number;
};

/** Remaining props, including `ref`, `className`, `style` and `data-*`, go to the host `<section>`. */
export type VirtualTableProps<TRow> = VirtualTableOwnProps<TRow> &
  Omit<ComponentPropsWithRef<"section">, keyof VirtualTableOwnProps<TRow> | "children">;

export type DataTableProps<TRow> = Omit<
  VirtualTableProps<TRow>,
  "columnVirtualization" | "overscan" | "rowHeight"
> & {
  density?: "comfortable" | "compact";
};

const defaultRowHeight = 44;
const defaultRowIndexWidth = 48;

export function DataTable<TRow>({
  density = "comfortable",
  ...props
}: DataTableProps<TRow>) {
  return (
    <VirtualTable
      {...props}
      overscan={density === "compact" ? 12 : 8}
      rowHeight={density === "compact" ? 36 : 44}
    />
  );
}

export function VirtualTable<TRow>({
  ariaLabel,
  columnMenu = false,
  columnOverscan = 1,
  columnResizeMode = "onChange",
  columnResizing = false,
  columnVirtualization = true,
  columns,
  emptyState,
  filteredRowCount,
  height = 520,
  initialState,
  isRowSelectable,
  loading = false,
  loadingState,
  locale,
  messages: messageOverrides,
  mode = "client",
  onModelChange,
  onRowClick,
  onStateChange,
  overscan = 8,
  rowHeight = defaultRowHeight,
  rowIndexOffset = 0,
  rowKey,
  rows,
  selectionMode = "none",
  showRowIndex = false,
  sortedRowCount,
  state,
  striped = true,
  totalRowCount,
  className,
  style,
  ...hostProps
}: VirtualTableProps<TRow>) {
  const messages = useMemo(() => resolveTableMessages(messageOverrides), [messageOverrides]);
  const resolvedAriaLabel = ariaLabel ?? messages.tableAriaLabel;
  const resolvedEmptyState = emptyState === undefined ? messages.emptyState : emptyState;
  const resolvedLoadingState = loadingState === undefined ? messages.loadingState : loadingState;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewport = useElementSize(scrollRef);
  const columnMenuOptions = useMemo(() => resolveColumnMenuOptions(columnMenu), [columnMenu]);
  const menu = useGridMenu<TRow>(columnMenuOptions);
  const { closeMenu, menuRef, menuState } = menu;
  const {
    activeState,
    setColumnOrder,
    setColumnSizing,
    setColumnVisibility,
    setFilter,
    setSelection,
    setSort,
  } = useTableStateController({ initialState, onStateChange, state });
  const resize = useColumnResize({
    columnResizeMode,
    columnSizing: activeState.columnSizing,
    columns,
    onResizeStart: menu.dismissMenu,
    setColumnSizing,
  });
  const orderedColumns = useMemo(
    () => resolveColumnOrder(columns, activeState.columnOrder),
    [activeState.columnOrder, columns],
  );
  const visibleColumns = useMemo(
    () =>
      orderedColumns.filter((column) =>
        isColumnVisible(activeState.columnVisibility, column.id),
      ),
    [activeState.columnVisibility, orderedColumns],
  );
  const rowIndexWidth = showRowIndex ? defaultRowIndexWidth : 0;
  const navigationColumns = useMemo(
    () => resolveRenderedColumnOrder(visibleColumns),
    [visibleColumns],
  );
  const navigationColumnOffset = showRowIndex ? 1 : 0;
  const navigationColumnIndexById = useMemo(
    () =>
      new Map(
        navigationColumns.map((column, index) => [
          column.id,
          index + navigationColumnOffset,
        ]),
      ),
    [navigationColumnOffset, navigationColumns],
  );
  const activeMenuColumn = menuState?.kind === "column"
    ? columns.find((column) => column.id === menuState.columnId) ?? null
    : null;
  const model = useMemo<TableModel<TRow>>(
    () =>
      mode === "manual"
        ? {
            columns,
            filteredRowCount: filteredRowCount ?? rows.length,
            rows,
            sortedRowCount: sortedRowCount ?? rows.length,
            totalRowCount: totalRowCount ?? rows.length,
          }
        : createTableModel({
            columns,
            filter: activeState.filter,
            locale,
            rows,
            sort: activeState.sort,
          }),
    [
      activeState.filter,
      activeState.sort,
      columns,
      filteredRowCount,
      locale,
      mode,
      rows,
      sortedRowCount,
      totalRowCount,
    ],
  );
  const resolvedRowIndexOffset =
    mode === "manual" && Number.isFinite(rowIndexOffset)
      ? Math.max(0, Math.trunc(rowIndexOffset))
      : 0;
  const {
    centerLayout,
    centerWidths,
    columnEntries,
    stickyLeftWidth,
    stickyRightWidth,
    totalColumnWidth,
  } = useGridColumnLayout({
    columnSizing: activeState.columnSizing,
    resizingColumn: resize.resizeState,
    rowIndexWidth,
    visibleColumns,
  });
  const { columnRange, handleScroll, rowRange, scrollOffsetRef, scrollTo } = useGridWindow({
    centerCount: columnEntries.center.length,
    centerLayout,
    columnOverscan,
    columnVirtualization,
    onScroll: menu.dismissMenuOnScroll,
    overscan,
    rowCount: model.rows.length,
    rowHeight,
    scrollRef,
    stickyLeftWidth,
    stickyRightWidth,
    viewport,
  });
  const visibleCenterEntries = columnEntries.center.slice(columnRange.startIndex, columnRange.endIndex);
  const gridTemplateColumns = createGridTemplateColumns(
    rowIndexWidth,
    columnEntries.left.map((entry) => entry.width),
    columnRange.offsetBefore,
    visibleCenterEntries.map((entry) => entry.width),
    columnRange.offsetAfter,
    columnEntries.right.map((entry) => entry.width),
  );
  const visibleRows = model.rows.slice(rowRange.startIndex, rowRange.endIndex);
  const { handleRowClick, selectedRowKeySet, updateSelectionForRow } = useRowSelection({
    isRowSelectable,
    onRowClick,
    rowKey,
    rows: model.rows,
    selectedRowKeys: activeState.selection.selectedRowKeys,
    selectionMode,
    setSelection,
  });

  useLayoutEffect(() => {
    onModelChange?.(model);
  }, [model, onModelChange]);

  const { handleGridCellKeyDown, rovingGridPosition, setActiveGridPosition } = useGridFocus({
    centerEntries: columnEntries.center,
    centerWidths,
    columnRange,
    leftEntries: columnEntries.left,
    navigationColumnIndexById,
    navigationColumnOffset,
    navigationColumns,
    onRowClick,
    rightEntries: columnEntries.right,
    rowCount: model.rows.length,
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
  });
  const gridRowProps: GridRowSharedProps<TRow> = {
    gridTemplateColumns,
    handleGridCellKeyDown,
    handleRowClick,
    leftEntries: columnEntries.left,
    navigationColumnIndexById,
    offsetAfter: columnRange.offsetAfter,
    offsetBefore: columnRange.offsetBefore,
    resolvedRowIndexOffset,
    rightEntries: columnEntries.right,
    rovingGridPosition,
    setActiveGridPosition,
    showRowIndex,
    visibleCenterEntries,
  };

  return (
    <section
      {...hostProps}
      className={["mb-table", striped ? "mb-table--striped" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{ ...style, "--mb-table-row-height": `${rowHeight}px`, height } as CSSProperties}
    >
      <div
        aria-label={resolvedAriaLabel}
        ref={scrollRef}
        className="mb-table__scroll"
        onScroll={handleScroll}
        role="grid"
        aria-colcount={visibleColumns.length + (showRowIndex ? 1 : 0)}
        aria-rowcount={model.totalRowCount + 1}
      >
        <div className="mb-table__surface" style={{ minWidth: totalColumnWidth }}>
          <GridHeader
            columnMenuOptions={columnMenuOptions}
            columnResizing={columnResizing}
            filter={activeState.filter}
            gridTemplateColumns={gridTemplateColumns}
            leftEntries={columnEntries.left}
            menu={menu}
            messages={messages}
            offsetAfter={columnRange.offsetAfter}
            offsetBefore={columnRange.offsetBefore}
            resize={resize}
            rightEntries={columnEntries.right}
            setSort={setSort}
            showRowIndex={showRowIndex}
            sort={activeState.sort}
            visibleCenterEntries={visibleCenterEntries}
          />
          <div
            className="mb-table__body"
            style={{ height: rowRange.totalSize }}
          >
            <div
              className="mb-table__row-window"
              style={{ transform: `translateY(${rowRange.offsetBefore}px)` }}
            >
              {visibleRows.map((row, visibleRowIndex) => {
                const rowIndex = rowRange.startIndex + visibleRowIndex;
                const key = getTableRowKey(rowKey, row, rowIndex);
                const selectable = selectionMode !== "none" && isRowSelectable?.(row, rowIndex) !== false;
                const selected = selectedRowKeySet.has(key);
                const interactive = Boolean(onRowClick) || selectable;

                return (
                  <GridRow
                    {...gridRowProps}
                    interactive={interactive}
                    key={key}
                    row={row}
                    rowIndex={rowIndex}
                    rowKeyValue={key}
                    selectable={selectable}
                    selected={selected}
                    selectionEnabled={selectionMode !== "none"}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {!loading && model.rows.length === 0 ? (
        <div className="mb-table__state">{resolvedEmptyState}</div>
      ) : null}
      {loading ? (
        <div className="mb-table__state" role="status">
          {resolvedLoadingState}
        </div>
      ) : null}
      {menuState?.kind === "column" && activeMenuColumn ? (
        <ColumnMenu
          activeFilter={activeState.filter}
          closeMenu={closeMenu}
          column={activeMenuColumn}
          id={getColumnMenuId(activeMenuColumn.id)}
          key={activeMenuColumn.id}
          menuOptions={columnMenuOptions}
          menuRef={menuRef}
          messages={messages}
          rows={rows}
          setFilter={setFilter}
          x={menuState.x}
          y={menuState.y}
        />
      ) : null}
      {menuState?.kind === "table" ? (
        <TableOptionsMenu
          columnOrder={activeState.columnOrder ?? []}
          columnVisibility={activeState.columnVisibility ?? {}}
          columns={columns}
          id={tableMenuId}
          menuRef={menuRef}
          messages={messages}
          setColumnOrder={setColumnOrder}
          setColumnVisibility={setColumnVisibility}
          x={menuState.x}
          y={menuState.y}
        />
      ) : null}
    </section>
  );
}
