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
  createTableModel,
  getColumnValue,
  getNextSortState,
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
} from "./data";
import { isColumnVisible, resolveColumnOrder, resolveRenderedColumnOrder } from "./column-layout";
import { getNextGridPosition, type GridPosition } from "./grid-navigation";
import { getColumnLabel, type TableColumn } from "./react-column";
import { TableOptionsMenu } from "./table-options";
import { useTableStateController } from "./use-table-state";
import { createVariableVirtualLayout, getFixedVirtualRange } from "./virtualization";

export type RowKey<TRow> = keyof TRow | ((row: TRow, rowIndex: number) => TableRowKey);

export type TableProcessingMode = "client" | "manual";

export type TableSelectionMode = "multiple" | "none" | "single";

export { createTableColumnHelper } from "./react-column";
export type { TableColumn } from "./react-column";

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
  /** Zero-based position of the first supplied row within a manual/server result. */
  rowIndexOffset?: number;
  rowKey: RowKey<TRow>;
  rows: readonly TRow[];
  selectionMode?: TableSelectionMode;
  showRowIndex?: boolean;
  sortedRowCount?: number;
  state?: Partial<TableState<TRow>>;
  striped?: boolean;
  totalRowCount?: number;
};

export type TableColumnMenuOptions = {
  filter?: boolean;
  /** @deprecated Sorting is controlled by the dedicated header sort button. */
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

type MenuState =
  | {
      columnId: string;
      kind: "column";
      x: number;
      y: number;
    }
  | {
      kind: "table";
      x: number;
      y: number;
    }
  | null;

type ResolvedColumnMenuOptions = {
  filter: boolean;
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
const defaultRowIndexWidth = 48;
const tableMenuId = "mb-table-options-menu";
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
  rowIndexOffset = 0,
  rowKey,
  rows,
  selectionMode = "none",
  showRowIndex = false,
  sortedRowCount,
  state,
  striped = true,
  totalRowCount,
}: VirtualTableProps<TRow>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const ignoreColumnMenuScrollCloseUntilRef = useRef(0);
  const lastSelectedRowKeyRef = useRef<TableRowKey | null>(null);
  const pendingGridFocusRef = useRef<GridPosition | null>(null);
  const [activeGridPosition, setActiveGridPosition] = useState<GridPosition>({
    columnIndex: 0,
    rowIndex: 0,
  });
  const viewport = useElementSize(scrollRef);
  const [scrollOffset, setScrollOffset] = useState({ left: 0, top: 0 });
  const [menuState, setMenuState] = useState<MenuState>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const {
    activeState,
    setColumnOrder,
    setColumnSizing,
    setColumnVisibility,
    setFilter,
    setSelection,
    setSort,
  } = useTableStateController({ initialState, onStateChange, state });
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
  const navigationColumnCount = navigationColumns.length + navigationColumnOffset;
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
  const columnMenuOptions = useMemo(() => resolveColumnMenuOptions(columnMenu), [columnMenu]);
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
  const resolvedRowIndexOffset =
    mode === "manual" && Number.isFinite(rowIndexOffset)
      ? Math.max(0, Math.trunc(rowIndexOffset))
      : 0;
  const selectedRowKeys = activeState.selection.selectedRowKeys;
  const selectedRowKeySet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);
  const columnWidths = useMemo(
    () =>
      visibleColumns.map((column) =>
        resolveColumnWidth(
          column,
          resizeState?.columnId === column.id
            ? resizeState.currentWidth
            : activeState.columnSizing[column.id],
        ),
      ),
    [activeState.columnSizing, resizeState, visibleColumns],
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
  const centerColumnWidth = centerLayout.totalSize;
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
        ? centerLayout.virtualRange({
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
      centerLayout,
      centerScrollOffset,
      centerViewportWidth,
      columnEntries.center.length,
      columnOverscan,
      columnVirtualization,
    ],
  );
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
  const gridPageSize = Math.max(
    1,
    Math.floor(Math.max(1, viewport.height - rowHeight) / rowHeight),
  );
  const renderedNavigationColumnIndices = useMemo(() => {
    const indices: number[] = showRowIndex ? [0] : [];

    for (const entry of [
      ...columnEntries.left,
      ...visibleCenterEntries,
      ...columnEntries.right,
    ]) {
      const columnIndex = navigationColumnIndexById.get(entry.column.id);
      if (columnIndex !== undefined) {
        indices.push(columnIndex);
      }
    }

    return indices;
  }, [
    columnEntries.left,
    columnEntries.right,
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

  useLayoutEffect(() => {
    onModelChange?.(model);
  }, [model, onModelChange]);

  useEffect(() => {
    setActiveGridPosition((current) => {
      const rowIndex = model.rows.length > 0
        ? Math.min(current.rowIndex, model.rows.length - 1)
        : 0;
      const columnIndex = navigationColumnCount > 0
        ? Math.min(current.columnIndex, navigationColumnCount - 1)
        : 0;

      return rowIndex === current.rowIndex && columnIndex === current.columnIndex
        ? current
        : { columnIndex, rowIndex };
    });
  }, [model.rows.length, navigationColumnCount]);

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
  }, [activeGridPosition, columnRange, rowRange]);

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

  const closeMenu = useCallback(() => {
    setMenuState(null);
    menuTriggerRef.current?.focus();
    menuTriggerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    if (!menuState || !menuRef.current) {
      return;
    }

    const focusTarget = menuRef.current.querySelector<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
    );

    focusTarget?.focus({ preventScroll: true });
  }, [menuState]);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    const handleWindowScroll = () => {
      if (!shouldIgnoreColumnMenuScrollClose(ignoreColumnMenuScrollCloseUntilRef.current)) {
        closeMenu();
      }
    };
    const handleWindowResize = () => closeMenu();

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
  }, [closeMenu, menuState]);

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
      setMenuState(null);
    }
  }, []);

  const focusGridPosition = useCallback(
    (position: GridPosition) => {
      if (
        position.rowIndex < 0 ||
        position.rowIndex >= model.rows.length ||
        position.columnIndex < 0 ||
        position.columnIndex >= navigationColumnCount
      ) {
        return;
      }

      let nextTop = scrollOffset.top;
      if (position.rowIndex < rowRange.startIndex) {
        nextTop = position.rowIndex * rowHeight;
      } else if (position.rowIndex >= rowRange.endIndex) {
        const bodyViewportHeight = Math.max(rowHeight, viewport.height - rowHeight);
        nextTop = Math.max(0, (position.rowIndex + 1) * rowHeight - bodyViewportHeight);
      }

      let nextLeft = scrollOffset.left;
      const navigationIndex = position.columnIndex - navigationColumnOffset;
      const targetColumn = navigationColumns[navigationIndex];
      if (targetColumn && targetColumn.sticky === undefined) {
        const centerIndex = columnEntries.center.findIndex(
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
      const element = scrollRef.current;
      if (element) {
        element.scrollLeft = nextLeft;
        element.scrollTop = nextTop;
      }
      setScrollOffset({ left: nextLeft, top: nextTop });
      setActiveGridPosition(position);
    },
    [
      centerWidths,
      columnEntries.center,
      model.rows.length,
      navigationColumnCount,
      navigationColumnOffset,
      navigationColumns,
      rowHeight,
      rowRange.endIndex,
      rowRange.startIndex,
      scrollOffset.left,
      scrollOffset.top,
      stickyLeftWidth,
      stickyRightWidth,
      viewport.height,
      viewport.width,
    ],
  );

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

      menuTriggerRef.current = trigger;
      ignoreColumnMenuScrollCloseUntilRef.current = getCurrentTime() + 100;
      setMenuState({
        columnId: column.id,
        kind: "column",
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

  const handleTableMenuButtonClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      menuTriggerRef.current = event.currentTarget;
      ignoreColumnMenuScrollCloseUntilRef.current = getCurrentTime() + 100;
      setMenuState({
        kind: "table",
        ...clampColumnMenuPosition(rect.left, rect.bottom),
      });
    },
    [],
  );

  const handleResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      column: TableColumn<TRow>,
      width: number,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setMenuState(null);
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

  const handleResizeKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLButtonElement>,
      column: TableColumn<TRow>,
      width: number,
    ) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const step = event.shiftKey ? 32 : 8;
      const nextWidth = clampColumnWidth(column, width + direction * step);
      setColumnSizing({
        ...activeState.columnSizing,
        [column.id]: nextWidth,
      });
    },
    [activeState.columnSizing, setColumnSizing],
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
        rowCount: model.rows.length,
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
      model.rows.length,
      navigationColumnCount,
      onRowClick,
      selectionMode,
      updateSelectionForRow,
    ],
  );

  const renderHeaderCell = (entry: ColumnEntry<TRow>, sticky: "left" | "right" | null) => {
    const { column, originalIndex, width } = entry;
    const hasMenuActions = hasColumnMenuActions(column, columnMenuOptions);
    const showMenuButton = isButtonMenuEnabled(columnMenuOptions) && hasMenuActions;
    const isMenuOpen = menuState?.kind === "column" && menuState.columnId === column.id;
    const canResize = columnResizing && column.resizable !== false;
    const label = getColumnLabel(column);
    const menuId = getColumnMenuId(column.id);
    const sortRule = getSortRule(activeState.sort, column.id);

    return (
      <div
        aria-colindex={originalIndex + (showRowIndex ? 2 : 1)}
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
        <span className="mb-table__header-label">{column.header}</span>
        {column.sortable ? (
          <button
            aria-label={getSortButtonLabel(label, sortRule)}
            className="mb-table__sort-button"
            onClick={(event) => updateSort(column, event.shiftKey)}
            type="button"
          >
            <span aria-hidden="true" className="mb-table__sort-indicator">
              {getSortIndicator(activeState.sort, column.id)}
            </span>
          </button>
        ) : null}
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
            onKeyDown={(event) => handleResizeKeyDown(event, column, width)}
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
    rowKeyValue: TableRowKey,
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
        aria-colcount={visibleColumns.length + (showRowIndex ? 1 : 0)}
        aria-rowcount={model.totalRowCount + 1}
      >
        <div className="mb-table__surface" style={{ minWidth: totalColumnWidth }}>
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
                  aria-label="Open table options"
                  className="mb-table__index-menu-trigger"
                  onClick={handleTableMenuButtonClick}
                  type="button"
                />
              </div>
            ) : null}
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
                    aria-rowindex={resolvedRowIndexOffset + rowIndex + 2}
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
                        onKeyDown={(event) => handleGridCellKeyDown(event, row, rowIndex, key, 0)}
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
                    {columnEntries.left.map((entry) =>
                      renderRowCell(
                        entry,
                        row,
                        rowIndex,
                        key,
                        navigationColumnIndexById.get(entry.column.id) ?? 0,
                        "left",
                      ),
                    )}
                    {renderSpacer("before", columnRange.offsetBefore)}
                    {visibleCenterEntries.map((entry) =>
                      renderRowCell(
                        entry,
                        row,
                        rowIndex,
                        key,
                        navigationColumnIndexById.get(entry.column.id) ?? 0,
                        null,
                      ),
                    )}
                    {renderSpacer("after", columnRange.offsetAfter)}
                    {columnEntries.right.map((entry) =>
                      renderRowCell(
                        entry,
                        row,
                        rowIndex,
                        key,
                        navigationColumnIndexById.get(entry.column.id) ?? 0,
                        "right",
                      ),
                    )}
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
      {menuState?.kind === "column" && activeMenuColumn ? (
        <ColumnMenu
          activeFilter={activeState.filter}
          closeMenu={closeMenu}
          column={activeMenuColumn}
          id={getColumnMenuId(activeMenuColumn.id)}
          key={activeMenuColumn.id}
          menuOptions={columnMenuOptions}
          menuRef={menuRef}
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
          setColumnOrder={setColumnOrder}
          setColumnVisibility={setColumnVisibility}
          x={menuState.x}
          y={menuState.y}
        />
      ) : null}
    </section>
  );
}

function ColumnMenu<TRow>({
  activeFilter,
  closeMenu,
  column,
  id,
  menuOptions,
  menuRef,
  rows,
  setFilter,
  x,
  y,
}: {
  activeFilter: TableFilter<TRow> | null;
  closeMenu: () => void;
  column: TableColumn<TRow>;
  id: string;
  menuOptions: ResolvedColumnMenuOptions;
  menuRef: RefObject<HTMLDivElement | null>;
  rows: readonly TRow[];
  setFilter: (filter: TableFilter<TRow> | null) => void;
  x: number;
  y: number;
}) {
  const columnType = resolveColumnFilterType(column, rows);
  const filterOptions = columnType === "string" ? column.filterOptions : undefined;
  const activeColumnFilter = activeFilter?.columnFilters?.find(
    (filter) => filter.columnId === column.id,
  );
  const categorical = Boolean(filterOptions?.length);
  const categoricalValues = getCategoricalFilterValues(activeColumnFilter, filterOptions);
  const [draft, setDraft] = useState<ColumnFilterDraft>(() =>
    createInitialColumnFilterDraft(columnType, activeColumnFilter, categorical),
  );
  const operators = getFilterOperators(columnType, categorical);
  const canApplyFilter = isColumnFilterDraftValid(columnType, draft);
  const showFilter = menuOptions.filter && column.filterable !== false;
  const label = getColumnLabel(column);

  const updateDraft = (updates: Partial<ColumnFilterDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };
  const toggleCategoricalValue = (option: string) => {
    const nextValues = categoricalValues.includes(option)
      ? categoricalValues.filter((value) => value !== option)
      : [...categoricalValues, option];

    setFilter(
      nextValues.length > 0
        ? replaceColumnFilter(activeFilter, {
            columnId: column.id,
            operator: "in",
            value: nextValues,
          })
        : removeColumnFilter(activeFilter, column.id),
    );
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

      {showFilter ? (
        <div className="mb-table__column-menu-section">
          {categorical ? (
            <>
              <div
                aria-label={`Filter ${label}`}
                className="mb-table__column-menu-section"
                role="group"
              >
                {filterOptions?.map((option) => {
                  const selected = categoricalValues.includes(option);

                  return (
                    <button
                      aria-label={option}
                      aria-pressed={selected}
                      className="mb-table__column-menu-button"
                      key={option}
                      onClick={() => toggleCategoricalValue(option)}
                      type="button"
                    >
                      <span aria-hidden="true">{selected ? "✓ " : "○ "}</span>
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>
              <button
                className="mb-table__column-menu-button"
                disabled={!activeColumnFilter}
                onClick={clearColumnFilter}
                type="button"
              >
                Clear filter
              </button>
            </>
          ) : (
            <>
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

              {renderFilterValueControl(columnType, undefined, draft, updateDraft)}

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
            </>
          )}
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
  filterOptions: readonly string[] | undefined,
  draft: ColumnFilterDraft,
  updateDraft: (updates: Partial<ColumnFilterDraft>) => void,
) {
  if (!filterOperatorNeedsValue(draft.operator)) {
    return null;
  }

  if (filterOptions?.length) {
    return (
      <label className="mb-table__column-menu-field">
        <span>Value</span>
        <select
          onChange={(event) => updateDraft({ value: event.target.value })}
          value={draft.value}
        >
          <option value="">Select value</option>
          {filterOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
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
    return { filter: true, trigger: "both" };
  }

  if (columnMenu === false) {
    return { filter: false, trigger: "context" };
  }

  return {
    filter: columnMenu.filter === true,
    trigger: columnMenu.trigger ?? "both",
  };
}

function hasColumnMenuActions<TRow>(
  column: TableColumn<TRow>,
  menuOptions: ResolvedColumnMenuOptions,
) {
  return menuOptions.filter && column.filterable !== false;
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

function getCategoricalFilterValues(
  filter: TableColumnFilter | undefined,
  filterOptions: readonly string[] | undefined,
): string[] {
  if (!filter || !filterOptions?.length) {
    return [];
  }

  const values =
    filter.operator === "in" && Array.isArray(filter.value)
      ? filter.value
      : filter.operator === "equals"
        ? [filter.value]
        : [];
  const selectedValues = new Set(
    values.filter((value): value is string => typeof value === "string"),
  );

  return filterOptions.filter((option) => selectedValues.has(option));
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
  categorical = false,
): ColumnFilterDraft {
  const operators = getFilterOperators(columnType, categorical);
  const defaultOperator = getDefaultFilterOperator(columnType, categorical);

  return {
    booleanValue: typeof filter?.value === "boolean" && !filter.value ? "false" : "true",
    operator: filter && operators.includes(filter.operator) ? filter.operator : defaultOperator,
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

function getDefaultFilterOperator(
  columnType: TableColumnType,
  categorical = false,
): TableFilterOperator {
  if (categorical) {
    return "equals";
  }

  if (columnType === "date") {
    return "gte";
  }

  if (columnType === "number" || columnType === "boolean") {
    return "equals";
  }

  return "contains";
}

function getFilterOperators(
  columnType: TableColumnType,
  categorical = false,
): TableFilterOperator[] {
  if (categorical) {
    return ["equals", "notEquals", "isNull", "isNotNull"];
  }

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

function createGridTemplateColumns(
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

function renderSpacer(position: "after" | "before", width: number) {
  return width > 0 ? (
    <div aria-hidden="true" className={`mb-table__spacer mb-table__spacer--${position}`} />
  ) : null;
}

function getRowKey<TRow>(rowKey: RowKey<TRow>, row: TRow, rowIndex: number): TableRowKey {
  if (typeof rowKey === "function") {
    return rowKey(row, rowIndex);
  }

  const value = row[rowKey];
  return typeof value === "number" || typeof value === "string" ? value : String(value);
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
