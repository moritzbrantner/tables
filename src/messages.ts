import type { TableFilterOperator } from "./data";

export type TableMessages = {
  apply: string;
  booleanFalse: string;
  booleanTrue: string;
  clearAllFilters: string;
  clearFilter: string;
  clearSort: (columnLabel: string) => string;
  columnActions: (columnLabel: string) => string;
  columns: string;
  emptyState: string;
  filter: string;
  filterColumn: (columnLabel: string) => string;
  filterOperators: Record<TableFilterOperator, string>;
  from: string;
  loadingState: string;
  moveColumnDown: (columnLabel: string) => string;
  moveColumnUp: (columnLabel: string) => string;
  openColumnActions: (columnLabel: string) => string;
  openTableOptions: string;
  resetOrder: string;
  resizeColumn: (columnLabel: string) => string;
  selectValue: string;
  showAllColumns: string;
  sortAscending: (columnLabel: string) => string;
  sortDescending: (columnLabel: string) => string;
  tableAriaLabel: string;
  tableOptions: string;
  to: string;
  value: string;
};

export type TableMessageOverrides = Omit<Partial<TableMessages>, "filterOperators"> & {
  filterOperators?: Partial<Record<TableFilterOperator, string>>;
};

export const defaultTableMessages: TableMessages = {
  apply: "Apply",
  booleanFalse: "False",
  booleanTrue: "True",
  clearAllFilters: "Clear all filters",
  clearFilter: "Clear filter",
  clearSort: (columnLabel) => `Clear sort for ${columnLabel}`,
  columnActions: (columnLabel) => `Column actions for ${columnLabel}`,
  columns: "Columns",
  emptyState: "No rows",
  filter: "Filter",
  filterColumn: (columnLabel) => `Filter ${columnLabel}`,
  filterOperators: {
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
  },
  from: "From",
  loadingState: "Loading rows",
  moveColumnDown: (columnLabel) => `Move ${columnLabel} down`,
  moveColumnUp: (columnLabel) => `Move ${columnLabel} up`,
  openColumnActions: (columnLabel) => `Open column actions for ${columnLabel}`,
  openTableOptions: "Open table options",
  resetOrder: "Reset order",
  resizeColumn: (columnLabel) => `Resize ${columnLabel}`,
  selectValue: "Select value",
  showAllColumns: "Show all columns",
  sortAscending: (columnLabel) => `Sort ${columnLabel} ascending`,
  sortDescending: (columnLabel) => `Sort ${columnLabel} descending`,
  tableAriaLabel: "Data table",
  tableOptions: "Table options",
  to: "To",
  value: "Value",
};

export function resolveTableMessages(overrides?: TableMessageOverrides): TableMessages {
  if (!overrides) {
    return defaultTableMessages;
  }

  return {
    ...defaultTableMessages,
    ...overrides,
    filterOperators: {
      ...defaultTableMessages.filterOperators,
      ...overrides.filterOperators,
    },
  };
}
