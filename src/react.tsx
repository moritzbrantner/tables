import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  createDefaultTableState,
  createTableModel,
  getColumnValue,
  getNextSortState,
  hasControlledStateKey,
  mergeControlledTableState,
  updateTableState,
  type TableColumn,
  type TableColumnFilter,
  type TableColumnType,
  type TableFilter,
  type TableFilterOperator,
  type TableModel,
  type TableRowKey,
  type TableSortRule,
  type TableSortState,
  type TableState,
  type TableStateChange,
  type TableStateChangeType,
} from "./data";
import { getVariableVirtualRange, getFixedVirtualRange } from "./virtualization";

export type RowKey<TRow> = keyof TRow | ((row: TRow, rowIndex: number) => TableRowKey);

export type TableProcessingMode = "client" | "manual";

export type TableSelectionMode = "multiple" | "none" | "single";

export type ColumnResizeMode = "onChange" | "onEnd";

export type TableColumnMenuTrigger = "both" | "button" | "context";

export type VirtualTableProps<TRow> = {
  ariaLabel?: string;
  className?: string;
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
  isRowSelectable?: (row: TRow, rowIndex: number) => boolean;
  loading?: boolean;
  loadingState?: ReactNode;
  mode?: TableProcessingMode;
  onModelChange?: (model: TableModel<TRow>) => void;
  onRowClick?: (row: TRow, rowIndex: number) => void;
  onStateChange?: (change: TableStateChange<TRow>) => void;
  overscan?: number;
  rowHeight?: number;
  rowKey: RowKey<TRow>;
  rows: readonly TRow[];
  selectionMode?: TableSelectionMode;
  sortedRowCount?: number;
  state?: Partial<TableState<TRow>>;
  striped?: boolean;
  totalRowCount?: number;
};

export type TableColumnMenuOptions = {
  filter?: boolean;
  sort?: boolean;
  trigger?: TableColumnMenuTrigger;
};

export type DataTableProps<TRow> = Omit<
  VirtualTableProps<TRow>,
  "columnVirtualization" | "overscan" | "rowHeight"
> & {
  density?: "comfortable" | "compact";
};

type Size = {
  height: number;
  width: number;
};

type ColumnMenuState = {
  columnId: string;
  x: number;
  y: number;
} | null;

type ResolvedColumnMenuOptions = {
  filter: boolean;
  sort: boolean;
  trigger: TableColumnMenuTrigger;
};

type ColumnFilterDraft = {
  booleanValue: "false" | "true";
  operator: TableFilterOperator;
  value: string;
  valueEnd: string;
};

type ColumnEntry<TRow> = {
  column: TableColumn<TRow>;
  originalIndex: number;
  right?: number;
  left?: number;
  width: number;
};

type ResizeState = {
  columnId: string;
  currentWidth: number;
  startWidth: number;
  startX: number;
};

const defaultRowHeight = 44;
const defaultColumnWidth = 160;
const columnMenuWidth = 240;
const columnMenuOffset = 12;
const defaultMinColumnWidth = 72;
const defaultMaxColumnWidth = 640;
const filterOperatorLabels: Record<TableFilterOperator, string> = {
  between: "Between",
  contains: "Contains",
  endsWith: "Ends with",
  equals: "Equals",
  gt: "Greater than",
  gte: "Greater than or equal",
  in: "In",
  isNotNull: "Is not empty",
  isNull: "Is empty",
  lt: "Less than",
  lte: "Less than or equal",
  notEquals: "Does not equal",
  startsWith: "Starts with",
};

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
  ariaLabel = "Data table",
  className,
  columnMenu = false,
  columnOverscan = 1,
  columnResizeMode = "onChange",
  columnResizing = false,
  columnVirtualization = true,
  columns,
  emptyState = "No rows",
  filteredRowCount,
  height = 520,
  initialState,
  isRowSelectable,
  loading = false,
  loadingState = "Loading rows",
  mode = "client",
  onModelChange,
  onRowClick,
  onStateChange,
  overscan = 8,
  rowHeight = defaultRowHeight,
  rowKey,
  rows,
  selectionMode = "none",
  sortedRowCount,
  state,
  striped = true,
  totalRowCount,
}: VirtualTableProps<TRow>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const columnMenuTriggerRef = useRef<HTMLElement | null>(null);
  const ignoreColumnMenuScrollCloseUntilRef = useRef(0);
  const lastSelectedRowKeyRef = useRef<TableRowKey | null>(null);
  const viewport = useElementSize(scrollRef);
  const [scrollOffset, setScrollOffset] = useState({ left: 0, top: 0 });
  const [columnMenuState, setColumnMenuState] = useState<ColumnMenuState>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [internalState, setInternalState] = useState(() =>
    createDefaultTableState(initialState),
  );
  const activeState = useMemo(
    () => mergeControlledTableState(internalState, state),
    [internalState, state],
  );
  const columnMenuOptions = useMemo(() => resolveColumnMenuOptions(columnMenu), [columnMenu]);
  const activeMenuColumn = columnMenuState
    ? columns.find((column) => column.id === columnMenuState.columnId) ?? null
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
            rows,
            sort: activeState.sort,
          }),
    [
      activeState.filter,
      activeState.sort,
      columns,
      filteredRowCount,
      mode,
      rows,
      sortedRowCount,
      totalRowCount,
    ],
  );
  const selectedRowKeys = activeState.selection.selectedRowKeys;
  const selectedRowKeySet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);
  const columnWidths = useMemo(
    () =>
      columns.map((column) =>
        resolveColumnWidth(
          column,
          resizeState?.columnId === column.id
            ? resizeState.currentWidth
            : activeState.columnSizing[column.id],
        ),
      ),
    [activeState.columnSizing, columns, resizeState],
  );
  const columnEntries = useMemo(
    () => createColumnEntries(columns, columnWidths),
    [columns, columnWidths],
  );
  const totalColumnWidth = useMemo(
    () => columnWidths.reduce((sum, width) => sum + width, 0),
    [columnWidths],
  );
  const stickyLeftWidth = useMemo(
    () => columnEntries.left.reduce((sum, entry) => sum + entry.width, 0),
    [columnEntries.left],
  );
  const stickyRightWidth = useMemo(
    () => columnEntries.right.reduce((sum, entry) => sum + entry.width, 0),
    [columnEntries.right],
  );
  const centerWidths = useMemo(
    () => columnEntries.center.map((entry) => entry.width),
    [columnEntries.center],
  );
  const centerColumnWidth = useMemo(
    () => centerWidths.reduce((sum, width) => sum + width, 0),
    [centerWidths],
  );
  const rowRange = useMemo(
    () =>
      getFixedVirtualRange({
        count: model.rows.length,
        itemSize: rowHeight,
        overscan,
        scrollOffset: scrollOffset.top,
        viewportSize: Math.max(1, viewport.height - rowHeight),
      }),
    [model.rows.length, overscan, rowHeight, scrollOffset.top, viewport.height],
  );
  const centerScrollOffset = Math.max(0, scrollOffset.left - stickyLeftWidth);
  const centerViewportWidth = Math.max(1, viewport.width - stickyLeftWidth - stickyRightWidth);
  const columnRange = useMemo(
    () =>
      columnVirtualization
        ? getVariableVirtualRange({
            itemSizes: centerWidths,
            overscan: columnOverscan,
            scrollOffset: centerScrollOffset,
            viewportSize: centerViewportWidth,
          })
        : {
            endIndex: columnEntries.center.length,
            offsetAfter: 0,
            offsetBefore: 0,
            startIndex: 0,
            totalSize: centerColumnWidth,
            visibleCount: columnEntries.center.length,
          },
    [
      centerColumnWidth,
      centerScrollOffset,
      centerViewportWidth,
      centerWidths,
      columnEntries.center.length,
      columnOverscan,
      columnVirtualization,
    ],
  );
  const visibleCenterEntries = columnEntries.center.slice(columnRange.startIndex, columnRange.endIndex);
  const gridTemplateColumns = createGridTemplateColumns(
    columnEntries.left.map((entry) => entry.width),
    columnRange.offsetBefore,
    visibleCenterEntries.map((entry) => entry.width),
    columnRange.offsetAfter,
    columnEntries.right.map((entry) => entry.width),
  );
  const visibleRows = model.rows.slice(rowRange.startIndex, rowRange.endIndex);

  const updateStateField = useCallback(
    <TKey extends keyof TableState<TRow>>(
      key: TKey,
      value: TableState<TRow>[TKey],
      changeType: TableStateChangeType,
    ) => {
      const nextState = updateTableState(activeState, key, value);

      if (!hasControlledStateKey(state, key)) {
        setInternalState((current) => updateTableState(current, key, value));
      }

      onStateChange?.({
        state: nextState,
        type: changeType,
      });
    },
    [activeState, onStateChange, state],
  );

  const setSort = useCallback(
    (sort: TableSortState) => updateStateField("sort", sort, "sort"),
    [updateStateField],
  );
  const setFilter = useCallback(
    (filter: TableFilter<TRow> | null) => updateStateField("filter", filter, "filter"),
    [updateStateField],
  );
  const setSelection = useCallback(
    (selectedRowKeys: readonly TableRowKey[]) =>
      updateStateField("selection", { selectedRowKeys }, "selection"),
    [updateStateField],
  );
  const setColumnSizing = useCallback(
    (columnSizing: Record<string, number>) =>
      updateStateField("columnSizing", columnSizing, "columnSizing"),
    [updateStateField],
  );

  useLayoutEffect(() => {
    onModelChange?.(model);
  }, [model, onModelChange]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setResizeState((current) => {
        if (!current) {
          return current;
        }

        const column = columns.find((candidate) => candidate.id === current.columnId);
        const currentWidth = clampColumnWidth(
          column,
          current.startWidth + event.clientX - current.startX,
        );

        if (columnResizeMode === "onChange") {
          setColumnSizing({
            ...activeState.columnSizing,
            [current.columnId]: currentWidth,
          });
        }

        return {
          ...current,
          currentWidth,
        };
      });
    };
    const handlePointerUp = () => {
      setResizeState((current) => {
        if (current && columnResizeMode === "onEnd") {
          setColumnSizing({
            ...activeState.columnSizing,
            [current.columnId]: current.currentWidth,
          });
        }

        return null;
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeState.columnSizing, columnResizeMode, columns, resizeState, setColumnSizing]);

  const closeColumnMenu = useCallback(() => {
    setColumnMenuState(null);
    columnMenuTriggerRef.current?.focus();
    columnMenuTriggerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    if (!columnMenuState || !columnMenuRef.current) {
      return;
    }

    const focusTarget = columnMenuRef.current.querySelector<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
    );

    focusTarget?.focus({ preventScroll: true });
  }, [columnMenuState]);

  useEffect(() => {
    if (!columnMenuState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (columnMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeColumnMenu();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeColumnMenu();
      }
    };
    const handleWindowScroll = () => {
      if (!shouldIgnoreColumnMenuScrollClose(ignoreColumnMenuScrollCloseUntilRef.current)) {
        closeColumnMenu();
      }
    };
    const handleWindowResize = () => closeColumnMenu();

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("scroll", handleWindowScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("scroll", handleWindowScroll, true);
    };
  }, [closeColumnMenu, columnMenuState]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    setScrollOffset({
      left: element.scrollLeft,
      top: element.scrollTop,
    });
    if (!shouldIgnoreColumnMenuScrollClose(ignoreColumnMenuScrollCloseUntilRef.current)) {
      setColumnMenuState(null);
    }
  }, []);

  const updateSort = useCallback(
    (column: TableColumn<TRow>, multi: boolean) => {
      if (!column.sortable) {
        return;
      }

      setSort(getNextSortState(activeState.sort, column.id, multi));
    },
    [activeState.sort, setSort],
  );

  const openColumnMenu = useCallback(
    (
      column: TableColumn<TRow>,
      trigger: HTMLElement,
      coordinates: { x: number; y: number },
    ) => {
      if (!hasColumnMenuActions(column, columnMenuOptions)) {
        return;
      }

      columnMenuTriggerRef.current = trigger;
      ignoreColumnMenuScrollCloseUntilRef.current = getCurrentTime() + 100;
      setColumnMenuState({
        columnId: column.id,
        ...clampColumnMenuPosition(coordinates.x, coordinates.y),
      });
    },
    [columnMenuOptions],
  );

  const handleHeaderContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>, column: TableColumn<TRow>) => {
      if (!isContextMenuEnabled(columnMenuOptions) || !hasColumnMenuActions(column, columnMenuOptions)) {
        return;
      }

      event.preventDefault();
      openColumnMenu(column, event.currentTarget, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [columnMenuOptions, openColumnMenu],
  );

  const handleHeaderKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, column: TableColumn<TRow>) => {
      if (
        !isContextMenuEnabled(columnMenuOptions) ||
        !hasColumnMenuActions(column, columnMenuOptions) ||
        (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))
      ) {
        return;
      }

      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openColumnMenu(column, event.currentTarget, {
        x: rect.left,
        y: rect.bottom,
      });
    },
    [columnMenuOptions, openColumnMenu],
  );

  const handleMenuButtonClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, column: TableColumn<TRow>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      openColumnMenu(column, event.currentTarget, {
        x: rect.left,
        y: rect.bottom,
      });
    },
    [openColumnMenu],
  );

  const handleResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      column: TableColumn<TRow>,
      width: number,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setColumnMenuState(null);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setResizeState({
        columnId: column.id,
        currentWidth: width,
        startWidth: width,
        startX: event.clientX,
      });
    },
    [],
  );

  const resetColumnWidth = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, column: TableColumn<TRow>) => {
      event.preventDefault();
      event.stopPropagation();
      const nextSizing = { ...activeState.columnSizing };

      delete nextSizing[column.id];
      setColumnSizing(nextSizing);
    },
    [activeState.columnSizing, setColumnSizing],
  );

  const updateSelectionForRow = useCallback(
    (
      row: TRow,
      rowIndex: number,
      key: TableRowKey,
      options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
    ) => {
      if (selectionMode === "none" || isRowSelectable?.(row, rowIndex) === false) {
        return;
      }

      if (selectionMode === "single") {
        lastSelectedRowKeyRef.current = key;
        setSelection([key]);
        return;
      }

      const currentKeys = activeState.selection.selectedRowKeys;
      const currentSet = new Set(currentKeys);
      const shouldToggle = options.ctrlKey || options.metaKey;

      if (options.shiftKey && lastSelectedRowKeyRef.current !== null) {
        const nextKeys = selectRowRange(
          model.rows,
          rowKey,
          lastSelectedRowKeyRef.current,
          key,
          currentSet,
          isRowSelectable,
        );
        setSelection(nextKeys);
        return;
      }

      lastSelectedRowKeyRef.current = key;

      if (shouldToggle) {
        if (currentSet.has(key)) {
          currentSet.delete(key);
        } else {
          currentSet.add(key);
        }
        setSelection(Array.from(currentSet));
        return;
      }

      setSelection([key]);
    },
    [activeState.selection.selectedRowKeys, isRowSelectable, model.rows, rowKey, selectionMode, setSelection],
  );

  const handleRowClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, row: TRow, rowIndex: number, key: TableRowKey) => {
      updateSelectionForRow(row, rowIndex, key, event);
      onRowClick?.(row, rowIndex);
    },
    [onRowClick, updateSelectionForRow],
  );

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, row: TRow, rowIndex: number, key: TableRowKey) => {
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
    [onRowClick, selectionMode, updateSelectionForRow],
  );

  const renderHeaderCell = (entry: ColumnEntry<TRow>, sticky: "left" | "right" | null) => {
    const { column, originalIndex, width } = entry;
    const hasMenuActions = hasColumnMenuActions(column, columnMenuOptions);
    const showMenuButton = isButtonMenuEnabled(columnMenuOptions) && hasMenuActions;
    const isMenuOpen = columnMenuState?.columnId === column.id;
    const canResize = columnResizing && column.resizable !== false;
    const label = getColumnLabel(column);
    const menuId = getColumnMenuId(column.id);
    const sortRule = getSortRule(activeState.sort, column.id);

    return (
      <div
        aria-colindex={originalIndex + 1}
        aria-sort={column.sortable ? getAriaSort(activeState.sort, column.id) : undefined}
        className={cellClassName("mb-table__header-cell", column, {
          filtered: hasActiveColumnFilter(activeState.filter, column.id),
          menuOpen: isMenuOpen,
          resizing: resizeState?.columnId === column.id,
          sticky,
        })}
        key={column.id}
        onContextMenu={(event) => handleHeaderContextMenu(event, column)}
        onKeyDown={(event) => handleHeaderKeyDown(event, column)}
        role="columnheader"
        style={getStickyStyle(entry)}
        tabIndex={isContextMenuEnabled(columnMenuOptions) && hasMenuActions ? 0 : undefined}
      >
        {column.sortable ? (
          <button
            aria-label={getSortButtonLabel(label, sortRule)}
            className="mb-table__sort-button"
            onClick={(event) => updateSort(column, event.shiftKey)}
            type="button"
          >
            <span>{column.header}</span>
            <span aria-hidden="true" className="mb-table__sort-indicator">
              {getSortIndicator(activeState.sort, column.id)}
            </span>
          </button>
        ) : (
          <span className="mb-table__header-label">{column.header}</span>
        )}
        {showMenuButton ? (
          <button
            aria-controls={isMenuOpen ? menuId : undefined}
            aria-expanded={isMenuOpen}
            aria-haspopup="dialog"
            aria-label={`Open column actions for ${label}`}
            className={[
              "mb-table__column-menu-trigger",
              isMenuOpen ? "mb-table__column-menu-trigger--open" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={(event) => handleMenuButtonClick(event, column)}
            type="button"
          >
            ...
          </button>
        ) : null}
        {canResize ? (
          <button
            aria-label={`Resize ${label}`}
            className="mb-table__resize-handle"
            onDoubleClick={(event) => resetColumnWidth(event, column)}
            onPointerDown={(event) => handleResizePointerDown(event, column, width)}
            type="button"
          />
        ) : null}
      </div>
    );
  };

  const renderRowCell = (
    entry: ColumnEntry<TRow>,
    row: TRow,
    rowIndex: number,
    sticky: "left" | "right" | null,
  ) => {
    const value = getColumnValue(entry.column, row, rowIndex);

    return (
      <div
        aria-colindex={entry.originalIndex + 1}
        className={cellClassName("mb-table__cell", entry.column, { sticky })}
        key={entry.column.id}
        role="gridcell"
        style={getStickyStyle(entry)}
        title={typeof value === "string" ? value : undefined}
      >
        {entry.column.cell
          ? entry.column.cell(value, row, rowIndex)
          : renderCellValue(value)}
      </div>
    );
  };

  return (
    <section
      aria-label={ariaLabel}
      className={["mb-table", striped ? "mb-table--striped" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{ "--mb-table-row-height": `${rowHeight}px`, height } as CSSProperties}
    >
      <div
        ref={scrollRef}
        className="mb-table__scroll"
        onScroll={handleScroll}
        role="grid"
        aria-colcount={columns.length}
        aria-rowcount={model.totalRowCount}
      >
        <div className="mb-table__surface" style={{ minWidth: totalColumnWidth }}>
          <div
            className="mb-table__header"
            role="row"
            style={{ gridTemplateColumns }}
          >
            {columnEntries.left.map((entry) => renderHeaderCell(entry, "left"))}
            {renderSpacer("before", columnRange.offsetBefore)}
            {visibleCenterEntries.map((entry) => renderHeaderCell(entry, null))}
            {renderSpacer("after", columnRange.offsetAfter)}
            {columnEntries.right.map((entry) => renderHeaderCell(entry, "right"))}
          </div>
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
                const key = getRowKey(rowKey, row, rowIndex);
                const selectable = selectionMode !== "none" && isRowSelectable?.(row, rowIndex) !== false;
                const selected = selectedRowKeySet.has(key);
                const interactive = Boolean(onRowClick) || selectable;

                return (
                  <div
                    aria-rowindex={rowIndex + 1}
                    aria-selected={selectionMode !== "none" ? selected : undefined}
                    className={[
                      "mb-table__row",
                      selected ? "mb-table__row--selected" : "",
                      selectable ? "mb-table__row--selectable" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={key}
                    onClick={interactive ? (event) => handleRowClick(event, row, rowIndex, key) : undefined}
                    onKeyDown={
                      interactive
                        ? (event) => handleRowKeyDown(event, row, rowIndex, key)
                        : undefined
                    }
                    role="row"
                    style={{ gridTemplateColumns }}
                    tabIndex={interactive ? 0 : undefined}
                  >
                    {columnEntries.left.map((entry) => renderRowCell(entry, row, rowIndex, "left"))}
                    {renderSpacer("before", columnRange.offsetBefore)}
                    {visibleCenterEntries.map((entry) => renderRowCell(entry, row, rowIndex, null))}
                    {renderSpacer("after", columnRange.offsetAfter)}
                    {columnEntries.right.map((entry) => renderRowCell(entry, row, rowIndex, "right"))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {!loading && model.rows.length === 0 ? (
        <div className="mb-table__state">{emptyState}</div>
      ) : null}
      {loading ? (
        <div className="mb-table__state" role="status">
          {loadingState}
        </div>
      ) : null}
      {columnMenuState && activeMenuColumn ? (
        <ColumnMenu
          activeFilter={activeState.filter}
          activeSort={activeState.sort}
          closeMenu={closeColumnMenu}
          column={activeMenuColumn}
          id={getColumnMenuId(activeMenuColumn.id)}
          key={activeMenuColumn.id}
          menuOptions={columnMenuOptions}
          menuRef={columnMenuRef}
          rows={rows}
          setFilter={setFilter}
          setSort={setSort}
          x={columnMenuState.x}
          y={columnMenuState.y}
        />
      ) : null}
    </section>
  );
}

function ColumnMenu<TRow>({
  activeFilter,
  activeSort,
  closeMenu,
  column,
  id,
  menuOptions,
  menuRef,
  rows,
  setFilter,
  setSort,
  x,
  y,
}: {
  activeFilter: TableFilter<TRow> | null;
  activeSort: TableSortState;
  closeMenu: () => void;
  column: TableColumn<TRow>;
  id: string;
  menuOptions: ResolvedColumnMenuOptions;
  menuRef: RefObject<HTMLDivElement | null>;
  rows: readonly TRow[];
  setFilter: (filter: TableFilter<TRow> | null) => void;
  setSort: (sort: TableSortState) => void;
  x: number;
  y: number;
}) {
  const columnType = resolveColumnFilterType(column, rows);
  const activeColumnFilter = activeFilter?.columnFilters?.find(
    (filter) => filter.columnId === column.id,
  );
  const [draft, setDraft] = useState<ColumnFilterDraft>(() =>
    createInitialColumnFilterDraft(columnType, activeColumnFilter),
  );
  const operators = getFilterOperators(columnType);
  const canApplyFilter = isColumnFilterDraftValid(columnType, draft);
  const showSort = menuOptions.sort && column.sortable;
  const showFilter = menuOptions.filter && column.filterable !== false;
  const label = getColumnLabel(column);

  const updateDraft = (updates: Partial<ColumnFilterDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };
  const applyFilter = () => {
    const columnFilter = createColumnFilterFromDraft(column.id, columnType, draft);

    if (!columnFilter) {
      return;
    }

    setFilter(replaceColumnFilter(activeFilter, columnFilter));
    closeMenu();
  };
  const clearColumnFilter = () => {
    setFilter(removeColumnFilter(activeFilter, column.id));
    closeMenu();
  };
  const clearAllFilters = () => {
    setFilter(clearStructuredFilters(activeFilter));
    closeMenu();
  };

  return (
    <div
      aria-label={`Column actions for ${label}`}
      className="mb-table__column-menu"
      id={id}
      ref={menuRef}
      role="dialog"
      style={{ left: x, top: y }}
    >
      {showSort ? (
        <div className="mb-table__column-menu-section">
          <button
            className="mb-table__column-menu-button"
            onClick={() => {
              setSort([{ columnId: column.id, direction: "asc" }]);
              closeMenu();
            }}
            type="button"
          >
            Sort ascending
          </button>
          <button
            className="mb-table__column-menu-button"
            onClick={() => {
              setSort([{ columnId: column.id, direction: "desc" }]);
              closeMenu();
            }}
            type="button"
          >
            Sort descending
          </button>
          <button
            className="mb-table__column-menu-button"
            disabled={activeSort.length === 0}
            onClick={() => {
              setSort([]);
              closeMenu();
            }}
            type="button"
          >
            Clear sort
          </button>
        </div>
      ) : null}

      {showFilter ? (
        <div className="mb-table__column-menu-section">
          <label className="mb-table__column-menu-field">
            <span>Filter</span>
            <select
              onChange={(event) =>
                updateDraft({ operator: event.target.value as TableFilterOperator })
              }
              value={draft.operator}
            >
              {operators.map((operator) => (
                <option key={operator} value={operator}>
                  {filterOperatorLabels[operator]}
                </option>
              ))}
            </select>
          </label>

          {renderFilterValueControl(columnType, draft, updateDraft)}

          <div className="mb-table__column-menu-actions">
            <button
              className="mb-table__column-menu-button"
              disabled={!canApplyFilter}
              onClick={applyFilter}
              type="button"
            >
              Apply
            </button>
            <button
              className="mb-table__column-menu-button"
              disabled={!activeColumnFilter}
              onClick={clearColumnFilter}
              type="button"
            >
              Clear filter
            </button>
          </div>
          <button
            className="mb-table__column-menu-button"
            disabled={!activeFilter?.columnFilters?.length}
            onClick={clearAllFilters}
            type="button"
          >
            Clear all filters
          </button>
        </div>
      ) : null}
    </div>
  );
}

function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ height: 0, width: 0 });

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    setSize({
      height: element.clientHeight,
      width: element.clientWidth,
    });

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [ref]);

  return size;
}

function renderFilterValueControl(
  columnType: TableColumnType,
  draft: ColumnFilterDraft,
  updateDraft: (updates: Partial<ColumnFilterDraft>) => void,
) {
  if (!filterOperatorNeedsValue(draft.operator)) {
    return null;
  }

  if (columnType === "boolean") {
    return (
      <label className="mb-table__column-menu-field">
        <span>Value</span>
        <select
          onChange={(event) =>
            updateDraft({ booleanValue: event.target.value as "false" | "true" })
          }
          value={draft.booleanValue}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </label>
    );
  }

  const inputType = columnType === "number" ? "number" : columnType === "date" ? "datetime-local" : "text";

  if (draft.operator === "between") {
    return (
      <>
        <label className="mb-table__column-menu-field">
          <span>From</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateDraft({ value: event.target.value })
            }
            type={inputType}
            value={draft.value}
          />
        </label>
        <label className="mb-table__column-menu-field">
          <span>To</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateDraft({ valueEnd: event.target.value })
            }
            type={inputType}
            value={draft.valueEnd}
          />
        </label>
      </>
    );
  }

  return (
    <label className="mb-table__column-menu-field">
      <span>Value</span>
      <input
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          updateDraft({ value: event.target.value })
        }
        type={inputType}
        value={draft.value}
      />
    </label>
  );
}

function resolveColumnMenuOptions(
  columnMenu: boolean | TableColumnMenuOptions,
): ResolvedColumnMenuOptions {
  if (columnMenu === true) {
    return { filter: true, sort: true, trigger: "both" };
  }

  if (columnMenu === false) {
    return { filter: false, sort: false, trigger: "context" };
  }

  return {
    filter: columnMenu.filter === true,
    sort: columnMenu.sort === true,
    trigger: columnMenu.trigger ?? "both",
  };
}

function hasColumnMenuActions<TRow>(
  column: TableColumn<TRow>,
  menuOptions: ResolvedColumnMenuOptions,
) {
  return (menuOptions.sort && column.sortable) || (menuOptions.filter && column.filterable !== false);
}

function isButtonMenuEnabled(menuOptions: ResolvedColumnMenuOptions) {
  return menuOptions.trigger === "button" || menuOptions.trigger === "both";
}

function isContextMenuEnabled(menuOptions: ResolvedColumnMenuOptions) {
  return menuOptions.trigger === "context" || menuOptions.trigger === "both";
}

function clampColumnMenuPosition(x: number, y: number) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  return {
    x: Math.max(
      columnMenuOffset,
      Math.min(x, window.innerWidth - columnMenuWidth - columnMenuOffset),
    ),
    y: Math.max(columnMenuOffset, Math.min(y, window.innerHeight - columnMenuOffset)),
  };
}

function shouldIgnoreColumnMenuScrollClose(ignoreUntil: number) {
  return getCurrentTime() < ignoreUntil;
}

function getCurrentTime() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function hasActiveColumnFilter<TRow>(
  filter: TableFilter<TRow> | null | undefined,
  columnId: string,
) {
  return filter?.columnFilters?.some((columnFilter) => columnFilter.columnId === columnId) ?? false;
}

function replaceColumnFilter<TRow>(
  filter: TableFilter<TRow> | null,
  columnFilter: TableColumnFilter,
): TableFilter<TRow> | null {
  return normalizeTableFilter({
    ...filter,
    columnFilters: [
      ...(filter?.columnFilters?.filter((candidate) => candidate.columnId !== columnFilter.columnId) ??
        []),
      columnFilter,
    ],
  });
}

function removeColumnFilter<TRow>(
  filter: TableFilter<TRow> | null,
  columnId: string,
): TableFilter<TRow> | null {
  return normalizeTableFilter({
    ...filter,
    columnFilters: filter?.columnFilters?.filter((candidate) => candidate.columnId !== columnId) ?? [],
  });
}

function clearStructuredFilters<TRow>(
  filter: TableFilter<TRow> | null,
): TableFilter<TRow> | null {
  return normalizeTableFilter({
    ...filter,
    columnFilters: [],
  });
}

function normalizeTableFilter<TRow>(filter: TableFilter<TRow>): TableFilter<TRow> | null {
  const columnFilters = filter.columnFilters?.length ? filter.columnFilters : undefined;
  const hasQuery = Boolean(filter.query?.trim());

  if (!hasQuery && !columnFilters?.length) {
    return null;
  }

  return {
    ...(columnFilters ? { columnFilters } : {}),
    ...(filter.predicate ? { predicate: filter.predicate } : {}),
    ...(filter.query !== undefined ? { query: filter.query } : {}),
    ...(filter.queryColumnIds ? { queryColumnIds: filter.queryColumnIds } : {}),
  };
}

function resolveColumnFilterType<TRow>(
  column: TableColumn<TRow>,
  rows: readonly TRow[],
): TableColumnType {
  if (column.type) {
    return column.type;
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const value = getColumnValue(column, rows[rowIndex], rowIndex);

    if (value == null) {
      continue;
    }

    if (value instanceof Date) {
      return "date";
    }

    if (Array.isArray(value)) {
      return "json";
    }

    switch (typeof value) {
      case "boolean":
        return "boolean";
      case "number":
        return "number";
      case "object":
        return "json";
      case "string":
        return "string";
      default:
        return "unknown";
    }
  }

  return "unknown";
}

function createInitialColumnFilterDraft(
  columnType: TableColumnType,
  filter: TableColumnFilter | undefined,
): ColumnFilterDraft {
  return {
    booleanValue: typeof filter?.value === "boolean" && !filter.value ? "false" : "true",
    operator: filter?.operator ?? getDefaultFilterOperator(columnType),
    value: filterValueToDraftString(filter?.value, 0),
    valueEnd: filterValueToDraftString(filter?.value, 1),
  };
}

function filterValueToDraftString(
  value: TableColumnFilter["value"],
  index: number,
) {
  const draftValue = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;

  if (draftValue instanceof Date) {
    return dateToInputValue(draftValue);
  }

  if (typeof draftValue === "number" || typeof draftValue === "string") {
    return String(draftValue);
  }

  return "";
}

function getDefaultFilterOperator(columnType: TableColumnType): TableFilterOperator {
  if (columnType === "date") {
    return "gte";
  }

  if (columnType === "number" || columnType === "boolean") {
    return "equals";
  }

  return "contains";
}

function getFilterOperators(columnType: TableColumnType): TableFilterOperator[] {
  if (columnType === "boolean") {
    return ["equals", "notEquals", "isNull", "isNotNull"];
  }

  if (columnType === "number" || columnType === "date") {
    return ["equals", "notEquals", "gt", "gte", "lt", "lte", "between", "isNull", "isNotNull"];
  }

  return ["contains", "equals", "notEquals", "startsWith", "endsWith", "isNull", "isNotNull"];
}

function isColumnFilterDraftValid(
  columnType: TableColumnType,
  draft: ColumnFilterDraft,
) {
  if (!filterOperatorNeedsValue(draft.operator)) {
    return true;
  }

  if (columnType === "boolean") {
    return draft.booleanValue === "true" || draft.booleanValue === "false";
  }

  if (draft.operator === "between") {
    return isDraftValueValid(columnType, draft.value) && isDraftValueValid(columnType, draft.valueEnd);
  }

  return isDraftValueValid(columnType, draft.value);
}

function isDraftValueValid(columnType: TableColumnType, value: string) {
  if (!value.trim()) {
    return false;
  }

  if (columnType === "number") {
    return Number.isFinite(Number(value));
  }

  if (columnType === "date") {
    return !Number.isNaN(new Date(value).getTime());
  }

  return true;
}

function createColumnFilterFromDraft(
  columnId: string,
  columnType: TableColumnType,
  draft: ColumnFilterDraft,
): TableColumnFilter | null {
  if (!isColumnFilterDraftValid(columnType, draft)) {
    return null;
  }

  if (!filterOperatorNeedsValue(draft.operator)) {
    return {
      columnId,
      operator: draft.operator,
    };
  }

  if (draft.operator === "between") {
    return {
      columnId,
      operator: draft.operator,
      value: [parseDraftValue(columnType, draft.value), parseDraftValue(columnType, draft.valueEnd)],
    };
  }

  return {
    columnId,
    operator: draft.operator,
    value: columnType === "boolean" ? draft.booleanValue === "true" : parseDraftValue(columnType, draft.value),
  };
}

function parseDraftValue(columnType: TableColumnType, value: string) {
  if (columnType === "number") {
    return Number(value);
  }

  if (columnType === "date") {
    return new Date(value);
  }

  return value;
}

function filterOperatorNeedsValue(operator: TableFilterOperator) {
  return operator !== "isNull" && operator !== "isNotNull";
}

function dateToInputValue(value: Date) {
  const offsetValue = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);

  return offsetValue.toISOString().slice(0, 16);
}

function getColumnLabel<TRow>(column: TableColumn<TRow>) {
  if (typeof column.header === "string" || typeof column.header === "number") {
    return String(column.header);
  }

  return column.ariaLabel ?? column.id;
}

function resolveColumnWidth<TRow>(column: TableColumn<TRow>, width?: number): number {
  return clampColumnWidth(column, width ?? column.width ?? defaultColumnWidth);
}

function clampColumnWidth<TRow>(column: TableColumn<TRow> | undefined, width: number): number {
  return Math.max(
    column?.minWidth ?? defaultMinColumnWidth,
    Math.min(column?.maxWidth ?? defaultMaxColumnWidth, width),
  );
}

function createColumnEntries<TRow>(
  columns: readonly TableColumn<TRow>[],
  columnWidths: readonly number[],
) {
  const left: ColumnEntry<TRow>[] = [];
  const center: ColumnEntry<TRow>[] = [];
  const right: ColumnEntry<TRow>[] = [];
  let leftOffset = 0;

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

function createGridTemplateColumns(
  leftWidths: readonly number[],
  offsetBefore: number,
  columnWidths: readonly number[],
  offsetAfter: number,
  rightWidths: readonly number[],
) {
  return [
    ...leftWidths.map((width) => `${width}px`),
    offsetBefore > 0 ? `${offsetBefore}px` : null,
    ...columnWidths.map((width) => `${width}px`),
    offsetAfter > 0 ? `${offsetAfter}px` : null,
    ...rightWidths.map((width) => `${width}px`),
  ]
    .filter(Boolean)
    .join(" ");
}

function renderSpacer(position: "after" | "before", width: number) {
  return width > 0 ? (
    <div aria-hidden="true" className={`mb-table__spacer mb-table__spacer--${position}`} />
  ) : null;
}

function getRowKey<TRow>(rowKey: RowKey<TRow>, row: TRow, rowIndex: number): TableRowKey {
  if (typeof rowKey === "function") {
    return rowKey(row, rowIndex);
  }

  return String(row[rowKey]);
}

function selectRowRange<TRow>(
  rows: readonly TRow[],
  rowKey: RowKey<TRow>,
  anchorKey: TableRowKey,
  targetKey: TableRowKey,
  selectedKeys: Set<TableRowKey>,
  isRowSelectable: ((row: TRow, rowIndex: number) => boolean) | undefined,
) {
  const keyedRows = rows.map((row, rowIndex) => ({
    key: getRowKey(rowKey, row, rowIndex),
    row,
    rowIndex,
  }));
  const anchorIndex = keyedRows.findIndex((entry) => entry.key === anchorKey);
  const targetIndex = keyedRows.findIndex((entry) => entry.key === targetKey);

  if (anchorIndex < 0 || targetIndex < 0) {
    return Array.from(selectedKeys);
  }

  const startIndex = Math.min(anchorIndex, targetIndex);
  const endIndex = Math.max(anchorIndex, targetIndex);

  for (let index = startIndex; index <= endIndex; index += 1) {
    const entry = keyedRows[index];

    if (entry && isRowSelectable?.(entry.row, entry.rowIndex) !== false) {
      selectedKeys.add(entry.key);
    }
  }

  return Array.from(selectedKeys);
}

function getStickyStyle<TRow>(entry: ColumnEntry<TRow>): CSSProperties | undefined {
  if (entry.left !== undefined) {
    return { left: entry.left };
  }

  if (entry.right !== undefined) {
    return { right: entry.right };
  }

  return undefined;
}

function cellClassName<TRow>(
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

function getSortRule(sort: TableSortState, columnId: string): TableSortRule | null {
  return sort.find((rule) => rule.columnId === columnId) ?? null;
}

function getSortIndicator(sort: TableSortState, columnId: string) {
  const index = sort.findIndex((rule) => rule.columnId === columnId);

  if (index < 0) {
    return "-";
  }

  const rule = sort[index];
  const indicator = rule.direction === "asc" ? "^" : "v";

  return index === 0 ? indicator : `${index + 1}${indicator}`;
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

function getSortButtonLabel(label: string, rule: TableSortRule | null) {
  if (!rule) {
    return `Sort ${label} ascending`;
  }

  if (rule.direction === "asc") {
    return `Sort ${label} descending`;
  }

  return `Clear sort for ${label}`;
}

function getColumnMenuId(columnId: string) {
  return `mb-table-column-menu-${columnId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
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
