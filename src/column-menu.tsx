import { useState, type ChangeEvent, type RefObject } from "react";

import {
  getColumnValue,
  type TableColumnFilter,
  type TableColumnType,
  type TableFilter,
  type TableFilterOperator,
} from "./data";
import { type TableMessages } from "./messages";
import { getColumnLabel, type TableColumn } from "./react-column";

export type TableColumnMenuTrigger = "both" | "button" | "context";

export type TableColumnMenuOptions = {
  filter?: boolean;
  /** @deprecated Sorting is controlled by the dedicated header sort button. */
  sort?: boolean;
  trigger?: TableColumnMenuTrigger;
};

export type ResolvedColumnMenuOptions = {
  filter: boolean;
  trigger: TableColumnMenuTrigger;
};

type ColumnFilterDraft = {
  booleanValue: "false" | "true";
  operator: TableFilterOperator;
  value: string;
  valueEnd: string;
};

const columnMenuWidth = 240;
const columnMenuOffset = 12;

export function ColumnMenu<TRow>({
  activeFilter,
  closeMenu,
  column,
  id,
  menuOptions,
  menuRef,
  messages,
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
  messages: TableMessages;
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
      aria-label={messages.columnActions(label)}
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
                aria-label={messages.filterColumn(label)}
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
                {messages.clearFilter}
              </button>
            </>
          ) : (
            <>
              <label className="mb-table__column-menu-field">
                <span>{messages.filter}</span>
                <select
                  onChange={(event) =>
                    updateDraft({ operator: event.target.value as TableFilterOperator })
                  }
                  value={draft.operator}
                >
                  {operators.map((operator) => (
                    <option key={operator} value={operator}>
                      {messages.filterOperators[operator]}
                    </option>
                  ))}
                </select>
              </label>

              {renderFilterValueControl(columnType, undefined, draft, updateDraft, messages)}

              <div className="mb-table__column-menu-actions">
                <button
                  className="mb-table__column-menu-button"
                  disabled={!canApplyFilter}
                  onClick={applyFilter}
                  type="button"
                >
                  {messages.apply}
                </button>
                <button
                  className="mb-table__column-menu-button"
                  disabled={!activeColumnFilter}
                  onClick={clearColumnFilter}
                  type="button"
                >
                  {messages.clearFilter}
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
            {messages.clearAllFilters}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function resolveColumnMenuOptions(
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

export function hasColumnMenuActions<TRow>(
  column: TableColumn<TRow>,
  menuOptions: ResolvedColumnMenuOptions,
) {
  return menuOptions.filter && column.filterable !== false;
}

export function isButtonMenuEnabled(menuOptions: ResolvedColumnMenuOptions) {
  return menuOptions.trigger === "button" || menuOptions.trigger === "both";
}

export function isContextMenuEnabled(menuOptions: ResolvedColumnMenuOptions) {
  return menuOptions.trigger === "context" || menuOptions.trigger === "both";
}

export function clampColumnMenuPosition(x: number, y: number) {
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

export function shouldIgnoreColumnMenuScrollClose(ignoreUntil: number) {
  return getCurrentTime() < ignoreUntil;
}

export function getCurrentTime() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function hasActiveColumnFilter<TRow>(
  filter: TableFilter<TRow> | null | undefined,
  columnId: string,
) {
  return filter?.columnFilters?.some((columnFilter) => columnFilter.columnId === columnId) ?? false;
}

export function getColumnMenuId(columnId: string) {
  return `mb-table-column-menu-${columnId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function renderFilterValueControl(
  columnType: TableColumnType,
  filterOptions: readonly string[] | undefined,
  draft: ColumnFilterDraft,
  updateDraft: (updates: Partial<ColumnFilterDraft>) => void,
  messages: TableMessages,
) {
  if (!filterOperatorNeedsValue(draft.operator)) {
    return null;
  }

  if (filterOptions?.length) {
    return (
      <label className="mb-table__column-menu-field">
        <span>{messages.value}</span>
        <select
          onChange={(event) => updateDraft({ value: event.target.value })}
          value={draft.value}
        >
          <option value="">{messages.selectValue}</option>
          {filterOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }

  if (columnType === "boolean") {
    return (
      <label className="mb-table__column-menu-field">
        <span>{messages.value}</span>
        <select
          onChange={(event) =>
            updateDraft({ booleanValue: event.target.value as "false" | "true" })
          }
          value={draft.booleanValue}
        >
          <option value="true">{messages.booleanTrue}</option>
          <option value="false">{messages.booleanFalse}</option>
        </select>
      </label>
    );
  }

  const inputType = columnType === "number" ? "number" : columnType === "date" ? "datetime-local" : "text";
  if (draft.operator === "between") {
    return (
      <>
        <label className="mb-table__column-menu-field">
          <span>{messages.from}</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateDraft({ value: event.target.value })
            }
            type={inputType}
            value={draft.value}
          />
        </label>
        <label className="mb-table__column-menu-field">
          <span>{messages.to}</span>
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
      <span>{messages.value}</span>
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
      ...(filter?.columnFilters?.filter((candidate) => candidate.columnId !== columnFilter.columnId) ?? []),
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
  return normalizeTableFilter({ ...filter, columnFilters: [] });
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
      case "boolean": return "boolean";
      case "number": return "number";
      case "object": return "json";
      case "string": return "string";
      default: return "unknown";
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

function filterValueToDraftString(value: TableColumnFilter["value"], index: number) {
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
  if (categorical || columnType === "boolean") {
    return ["equals", "notEquals", "isNull", "isNotNull"];
  }
  if (columnType === "number" || columnType === "date") {
    return ["equals", "notEquals", "gt", "gte", "lt", "lte", "between", "isNull", "isNotNull"];
  }
  return ["contains", "equals", "notEquals", "startsWith", "endsWith", "isNull", "isNotNull"];
}

function isColumnFilterDraftValid(columnType: TableColumnType, draft: ColumnFilterDraft) {
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
    return { columnId, operator: draft.operator };
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
