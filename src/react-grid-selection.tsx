import {
  useCallback,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  getTableRowKey,
  type TableRowKey,
  type TableRowKeyAccessor,
} from "./data";

export type TableSelectionMode = "multiple" | "none" | "single";

export function useRowSelection<TRow>({
  isRowSelectable,
  onRowClick,
  rowKey,
  rows,
  selectedRowKeys,
  selectionMode,
  setSelection,
}: {
  isRowSelectable: ((row: TRow, rowIndex: number) => boolean) | undefined;
  onRowClick: ((row: TRow, rowIndex: number) => void) | undefined;
  rowKey: TableRowKeyAccessor<TRow>;
  rows: readonly TRow[];
  selectedRowKeys: readonly TableRowKey[];
  selectionMode: TableSelectionMode;
  setSelection: (selectedRowKeys: readonly TableRowKey[]) => void;
}) {
  const lastSelectedRowKeyRef = useRef<TableRowKey | null>(null);
  const selectedRowKeySet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);

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

      const currentKeys = selectedRowKeys;
      const currentSet = new Set(currentKeys);
      const shouldToggle = options.ctrlKey || options.metaKey;

      if (options.shiftKey && lastSelectedRowKeyRef.current !== null) {
        const nextKeys = selectRowRange(
          rows,
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
    [isRowSelectable, rowKey, rows, selectedRowKeys, selectionMode, setSelection],
  );

  const handleRowClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, row: TRow, rowIndex: number, key: TableRowKey) => {
      updateSelectionForRow(row, rowIndex, key, event);
      onRowClick?.(row, rowIndex);
    },
    [onRowClick, updateSelectionForRow],
  );

  return { handleRowClick, selectedRowKeySet, updateSelectionForRow };
}

function selectRowRange<TRow>(
  rows: readonly TRow[],
  rowKey: TableRowKeyAccessor<TRow>,
  anchorKey: TableRowKey,
  targetKey: TableRowKey,
  selectedKeys: Set<TableRowKey>,
  isRowSelectable: ((row: TRow, rowIndex: number) => boolean) | undefined,
) {
  let anchorIndex = -1;
  let targetIndex = -1;

  for (let index = 0; index < rows.length && (anchorIndex < 0 || targetIndex < 0); index += 1) {
    const key = getTableRowKey(rowKey, rows[index], index);

    if (anchorIndex < 0 && key === anchorKey) {
      anchorIndex = index;
    }
    if (targetIndex < 0 && key === targetKey) {
      targetIndex = index;
    }
  }

  if (anchorIndex < 0 || targetIndex < 0) {
    return Array.from(selectedKeys);
  }

  const startIndex = Math.min(anchorIndex, targetIndex);
  const endIndex = Math.max(anchorIndex, targetIndex);

  for (let index = startIndex; index <= endIndex; index += 1) {
    const row = rows[index];

    if (isRowSelectable?.(row, index) !== false) {
      selectedKeys.add(getTableRowKey(rowKey, row, index));
    }
  }

  return Array.from(selectedKeys);
}
