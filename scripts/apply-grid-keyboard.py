from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


path = Path("src/react.tsx")
text = path.read_text()

text = replace_once(
    text,
    'import { isColumnVisible, resolveColumnOrder } from "./column-layout";\n',
    'import { isColumnVisible, resolveColumnOrder, resolveRenderedColumnOrder } from "./column-layout";\n'
    'import { getNextGridPosition, type GridPosition } from "./grid-navigation";\n',
    "navigation imports",
)

text = replace_once(
    text,
    '  const lastSelectedRowKeyRef = useRef<TableRowKey | null>(null);\n',
    '  const lastSelectedRowKeyRef = useRef<TableRowKey | null>(null);\n'
    '  const pendingGridFocusRef = useRef<GridPosition | null>(null);\n'
    '  const [activeGridPosition, setActiveGridPosition] = useState<GridPosition>({\n'
    '    columnIndex: 0,\n'
    '    rowIndex: 0,\n'
    '  });\n',
    "grid focus state",
)

text = replace_once(
    text,
    '  const {\n'
    '  activeState,\n'
    '  setColumnOrder,\n'
    '  setColumnSizing,\n'
    '  setColumnVisibility,\n'
    '  setFilter,\n'
    '  setSelection,\n'
    '  setSort,\n'
    '} = useTableStateController({ initialState, onStateChange, state });\n',
    '  const {\n'
    '    activeState,\n'
    '    setColumnOrder,\n'
    '    setColumnSizing,\n'
    '    setColumnVisibility,\n'
    '    setFilter,\n'
    '    setSelection,\n'
    '    setSort,\n'
    '  } = useTableStateController({ initialState, onStateChange, state });\n',
    "format state controller",
)

text = replace_once(
    text,
    '  const rowIndexWidth = showRowIndex ? defaultRowIndexWidth : 0;\n',
    '''  const rowIndexWidth = showRowIndex ? defaultRowIndexWidth : 0;
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
''',
    "navigation columns",
)

text = replace_once(
    text,
    '  const visibleRows = model.rows.slice(rowRange.startIndex, rowRange.endIndex);\n\n',
    '''  const visibleRows = model.rows.slice(rowRange.startIndex, rowRange.endIndex);
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

''',
    "rendered navigation state",
)

model_effect = '''  useLayoutEffect(() => {
    onModelChange?.(model);
  }, [model, onModelChange]);

'''
text = replace_once(
    text,
    model_effect,
    model_effect
    + '''  useEffect(() => {
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

''',
    "focus lifecycle",
)

scroll_handler = '''  const handleScroll = useCallback(() => {
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

'''
text = replace_once(
    text,
    scroll_handler,
    scroll_handler
    + '''  const focusGridPosition = useCallback(
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

''',
    "focus callback",
)

resize_pointer = '''  const handleResizePointerDown = useCallback(
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

'''
text = replace_once(
    text,
    resize_pointer,
    resize_pointer
    + '''  const handleResizeKeyDown = useCallback(
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

''',
    "keyboard resize",
)

row_key_start = text.index("  const handleRowKeyDown = useCallback(")
row_key_end = text.index("  const renderHeaderCell =", row_key_start)
text = (
    text[:row_key_start]
    + '''  const handleGridCellKeyDown = useCallback(
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

'''
    + text[row_key_end:]
)

text = replace_once(
    text,
    '            onPointerDown={(event) => handleResizePointerDown(event, column, width)}\n'
    '            type="button"\n',
    '            onKeyDown={(event) => handleResizeKeyDown(event, column, width)}\n'
    '            onPointerDown={(event) => handleResizePointerDown(event, column, width)}\n'
    '            type="button"\n',
    "resize binding",
)

text = replace_once(
    text,
    '''  const renderRowCell = (
    entry: ColumnEntry<TRow>,
    row: TRow,
    rowIndex: number,
    sticky: "left" | "right" | null,
  ) => {
''',
    '''  const renderRowCell = (
    entry: ColumnEntry<TRow>,
    row: TRow,
    rowIndex: number,
    rowKeyValue: TableRowKey,
    columnIndex: number,
    sticky: "left" | "right" | null,
  ) => {
''',
    "row cell signature",
)

text = replace_once(
    text,
    '''      <div
        aria-colindex={entry.originalIndex + (showRowIndex ? 2 : 1)}
        className={cellClassName("mb-table__cell", entry.column, { sticky })}
        key={entry.column.id}
        role="gridcell"
        style={getStickyStyle(entry)}
        title={typeof value === "string" ? value : undefined}
      >
''',
    '''      <div
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
''',
    "focusable grid cell",
)

text = replace_once(
    text,
    '        aria-rowcount={model.totalRowCount}\n',
    '        aria-rowcount={model.totalRowCount + 1}\n',
    "grid row count",
)
text = replace_once(
    text,
    '            className="mb-table__header"\n            role="row"\n',
    '            aria-rowindex={1}\n            className="mb-table__header"\n            role="row"\n',
    "header row index",
)
text = replace_once(
    text,
    '                    aria-rowindex={rowIndex + 1}\n',
    '                    aria-rowindex={rowIndex + 2}\n',
    "data row index",
)

old_row_handlers = '''                    onKeyDown={
                      interactive
                        ? (event) => handleRowKeyDown(event, row, rowIndex, key)
                        : undefined
                    }
                    role="row"
                    style={{ gridTemplateColumns }}
                    tabIndex={interactive ? 0 : undefined}
'''
text = replace_once(
    text,
    old_row_handlers,
    '''                    role="row"
                    style={{ gridTemplateColumns }}
''',
    "remove row keyboard target",
)

text = replace_once(
    text,
    '''                      <div
                        aria-colindex={1}
                        className="mb-table__cell mb-table__index-cell mb-table__cell--sticky-left"
                        role="rowheader"
                        style={{ left: 0 }}
                      >
                        {rowIndex + 1}
                      </div>
''',
    '''                      <div
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
                        {rowIndex + 1}
                      </div>
''',
    "focusable row header",
)

text = replace_once(
    text,
    '{columnEntries.left.map((entry) => renderRowCell(entry, row, rowIndex, "left"))}',
    '''{columnEntries.left.map((entry) =>
                      renderRowCell(
                        entry,
                        row,
                        rowIndex,
                        key,
                        navigationColumnIndexById.get(entry.column.id) ?? 0,
                        "left",
                      ),
                    )}''',
    "left cells",
)
text = replace_once(
    text,
    '{visibleCenterEntries.map((entry) => renderRowCell(entry, row, rowIndex, null))}',
    '''{visibleCenterEntries.map((entry) =>
                      renderRowCell(
                        entry,
                        row,
                        rowIndex,
                        key,
                        navigationColumnIndexById.get(entry.column.id) ?? 0,
                        null,
                      ),
                    )}''',
    "center cells",
)
text = replace_once(
    text,
    '{columnEntries.right.map((entry) => renderRowCell(entry, row, rowIndex, "right"))}',
    '''{columnEntries.right.map((entry) =>
                      renderRowCell(
                        entry,
                        row,
                        rowIndex,
                        key,
                        navigationColumnIndexById.get(entry.column.id) ?? 0,
                        "right",
                      ),
                    )}''',
    "right cells",
)

path.write_text(text)

tests_path = Path("src/react.test.tsx")
tests = tests_path.read_text()
tests = replace_once(
    tests,
    '    fireEvent.keyDown(row, { key: "Enter" });\n',
    '    fireEvent.keyDown(within(row).getAllByRole("gridcell")[0], { key: "Enter" });\n',
    "keyboard activation test",
)
tests = replace_once(
    tests,
    '    fireEvent.keyDown(row, { key: " " });\n'
    '    expect(row.getAttribute("aria-selected")).toBe("true");\n\n'
    '    fireEvent.keyDown(row, { key: " " });\n',
    '    const cell = within(row).getAllByRole("gridcell")[0];\n'
    '    fireEvent.keyDown(cell, { key: " " });\n'
    '    expect(row.getAttribute("aria-selected")).toBe("true");\n\n'
    '    fireEvent.keyDown(cell, { key: " " });\n',
    "keyboard toggle test",
)
tests_path.write_text(tests)
