import { useCallback, useMemo, useState } from "react";

import {
  createDefaultTableState,
  hasControlledStateKey,
  mergeControlledTableState,
  updateTableState,
  type TableColumnOrderState,
  type TableColumnVisibilityState,
  type TableFilter,
  type TableRowKey,
  type TableSortState,
  type TableState,
  type TableStateChange,
  type TableStateChangeType,
} from "./data";

export function useTableStateController<TRow>({
  initialState,
  onStateChange,
  state,
}: {
  initialState?: Partial<TableState<TRow>>;
  onStateChange?: (change: TableStateChange<TRow>) => void;
  state?: Partial<TableState<TRow>>;
}) {
  const [internalState, setInternalState] = useState(() => createDefaultTableState(initialState));
  const activeState = useMemo(
    () => mergeControlledTableState(internalState, state),
    [internalState, state],
  );

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

      onStateChange?.({ state: nextState, type: changeType });
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
  const setColumnOrder = useCallback(
    (columnOrder: TableColumnOrderState) =>
      updateStateField("columnOrder", columnOrder, "columnOrder"),
    [updateStateField],
  );
  const setColumnSizing = useCallback(
    (columnSizing: Record<string, number>) =>
      updateStateField("columnSizing", columnSizing, "columnSizing"),
    [updateStateField],
  );
  const setColumnVisibility = useCallback(
    (columnVisibility: TableColumnVisibilityState) =>
      updateStateField("columnVisibility", columnVisibility, "columnVisibility"),
    [updateStateField],
  );

  return {
    activeState,
    setColumnOrder,
    setColumnSizing,
    setColumnVisibility,
    setFilter,
    setSelection,
    setSort,
  };
}
