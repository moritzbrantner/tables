import { readFile, writeFile } from "node:fs/promises";

function editor(path) {
  let source;

  const load = async () => {
    source = await readFile(path, "utf8");
  };
  const replaceOnce = (before, after, label) => {
    const first = source.indexOf(before);
    if (first < 0) {
      throw new Error(`${path}: missing patch target: ${label}`);
    }
    if (source.indexOf(before, first + before.length) >= 0) {
      throw new Error(`${path}: ambiguous patch target: ${label}`);
    }
    source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
  };
  const replaceBetween = (start, end, replacement, label) => {
    const startIndex = source.indexOf(start);
    if (startIndex < 0) {
      throw new Error(`${path}: missing start marker: ${label}`);
    }
    const endIndex = source.indexOf(end, startIndex + start.length);
    if (endIndex < 0) {
      throw new Error(`${path}: missing end marker: ${label}`);
    }
    source = `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
  };
  const save = () => writeFile(path, source);

  return { load, replaceBetween, replaceOnce, save };
}

const react = editor("src/react.tsx");
await react.load();

react.replaceBetween(
  "import {\n",
  "export type RowKey<TRow>",
  `import {\n  useCallback,\n  useEffect,\n  useLayoutEffect,\n  useMemo,\n  useRef,\n  useState,\n  type CSSProperties,\n  type KeyboardEvent,\n  type MouseEvent as ReactMouseEvent,\n  type PointerEvent as ReactPointerEvent,\n  type ReactNode,\n  type RefObject,\n} from "react";\n\nimport {\n  ColumnMenu,\n  clampColumnMenuPosition,\n  getColumnMenuId,\n  getCurrentTime,\n  hasActiveColumnFilter,\n  hasColumnMenuActions,\n  isButtonMenuEnabled,\n  isContextMenuEnabled,\n  resolveColumnMenuOptions,\n  shouldIgnoreColumnMenuScrollClose,\n  type TableColumnMenuOptions,\n  type TableColumnMenuTrigger,\n} from "./column-menu";\nimport { isColumnVisible, resolveColumnOrder, resolveRenderedColumnOrder } from "./column-layout";\nimport {\n  createTableModel,\n  getColumnValue,\n  getNextSortState,\n  type TableModel,\n  type TableRowKey,\n  type TableSortRule,\n  type TableSortState,\n  type TableState,\n  type TableStateChange,\n} from "./data";\nimport { getNextGridPosition, type GridPosition } from "./grid-navigation";\nimport {\n  resolveTableMessages,\n  type TableMessageOverrides,\n  type TableMessages,\n} from "./messages";\nimport { getColumnLabel, type TableColumn } from "./react-column";\nimport { TableOptionsMenu } from "./table-options";\nimport { useTableStateController } from "./use-table-state";\nimport { createVariableVirtualLayout, getFixedVirtualRange } from "./virtualization";\n\nexport type RowKey<TRow>`,
  "React imports and ownership imports",
);

react.replaceOnce(
  'export type TableColumnMenuTrigger = "both" | "button" | "context";\n\n',
  'export type { TableColumnMenuOptions, TableColumnMenuTrigger } from "./column-menu";\n\n',
  "column menu public type re-export",
);
react.replaceBetween(
  "export type TableColumnMenuOptions = {\n",
  "export type DataTableProps<TRow>",
  "export type DataTableProps<TRow>",
  "remove colocated column menu public type",
);
react.replaceBetween(
  "type ResolvedColumnMenuOptions = {\n",
  "type ColumnEntry<TRow>",
  "type ColumnEntry<TRow>",
  "remove extracted menu internals",
);
react.replaceOnce(
  'const tableMenuId = "mb-table-options-menu";\nconst columnMenuWidth = 240;\nconst columnMenuOffset = 12;\nconst defaultMinColumnWidth = 72;\nconst defaultMaxColumnWidth = 640;\nconst filterOperatorLabels: Record<TableFilterOperator, string> = {\n  between: "Between",\n  contains: "Contains",\n  endsWith: "Ends with",\n  equals: "Equals",\n  gt: "Greater than",\n  gte: "Greater than or equal",\n  in: "In",\n  isNotNull: "Is not empty",\n  isNull: "Is empty",\n  lt: "Less than",\n  lte: "Less than or equal",\n  notEquals: "Does not equal",\n  startsWith: "Starts with",\n};',
  'const tableMenuId = "mb-table-options-menu";\nconst defaultMinColumnWidth = 72;\nconst defaultMaxColumnWidth = 640;',
  "remove extracted menu constants and labels",
);
react.replaceOnce(
  "  height?: number | string;\n  initialState?: Partial<TableState<TRow>>;",
  "  height?: number | string;\n  initialState?: Partial<TableState<TRow>>;\n  /** Locale used by built-in client-side text matching and sorting. */\n  locale?: string | readonly string[];\n  messages?: TableMessageOverrides;",
  "localized props",
);
react.replaceOnce('  ariaLabel = "Data table",', "  ariaLabel,", "default aria label");
react.replaceOnce('  emptyState = "No rows",', "  emptyState,", "default empty state");
react.replaceOnce(
  "  initialState,\n  isRowSelectable,\n  loading = false,\n  loadingState = \"Loading rows\",\n  mode = \"client\",",
  "  initialState,\n  isRowSelectable,\n  loading = false,\n  loadingState,\n  locale,\n  messages: messageOverrides,\n  mode = \"client\",",
  "locale and message destructuring",
);
react.replaceOnce(
  "}: VirtualTableProps<TRow>) {\n  const scrollRef = useRef<HTMLDivElement | null>(null);",
  "}: VirtualTableProps<TRow>) {\n  const messages = useMemo(() => resolveTableMessages(messageOverrides), [messageOverrides]);\n  const resolvedAriaLabel = ariaLabel ?? messages.tableAriaLabel;\n  const resolvedEmptyState = emptyState ?? messages.emptyState;\n  const resolvedLoadingState = loadingState ?? messages.loadingState;\n  const scrollRef = useRef<HTMLDivElement | null>(null);",
  "resolved localized copy",
);
react.replaceOnce(
  "        : createTableModel({\n            columns,\n            filter: activeState.filter,\n            rows,\n            sort: activeState.sort,\n          }),",
  "        : createTableModel({\n            columns,\n            filter: activeState.filter,\n            locale,\n            rows,\n            sort: activeState.sort,\n          }),",
  "pass locale into client model",
);
react.replaceOnce(
  "      filteredRowCount,\n      mode,\n      rows,",
  "      filteredRowCount,\n      locale,\n      mode,\n      rows,",
  "locale model dependency",
);
react.replaceOnce("      aria-label={ariaLabel}", "      aria-label={resolvedAriaLabel}", "resolved table aria label");
react.replaceOnce(
  '                  aria-label="Open table options"',
  "                  aria-label={messages.openTableOptions}",
  "localized table options trigger",
);
react.replaceOnce(
  "            aria-label={getSortButtonLabel(label, sortRule)}",
  "            aria-label={getSortButtonLabel(messages, label, sortRule)}",
  "localized sort button",
);
react.replaceOnce(
  '            aria-label={`Open column actions for ${label}`}',
  "            aria-label={messages.openColumnActions(label)}",
  "localized column actions trigger",
);
react.replaceOnce(
  '            aria-label={`Resize ${label}`}',
  "            aria-label={messages.resizeColumn(label)}",
  "localized resize handle",
);
react.replaceOnce(
  "          menuOptions={columnMenuOptions}\n          menuRef={menuRef}\n          rows={rows}",
  "          menuOptions={columnMenuOptions}\n          menuRef={menuRef}\n          messages={messages}\n          rows={rows}",
  "column menu messages",
);
react.replaceOnce(
  "          menuRef={menuRef}\n          setColumnOrder={setColumnOrder}",
  "          menuRef={menuRef}\n          messages={messages}\n          setColumnOrder={setColumnOrder}",
  "table options messages",
);
react.replaceOnce("        <div className=\"mb-table__state\">{emptyState}</div>", "        <div className=\"mb-table__state\">{resolvedEmptyState}</div>", "localized empty state");
react.replaceOnce("          {loadingState}", "          {resolvedLoadingState}", "localized loading state");
react.replaceBetween(
  "function ColumnMenu<TRow>({\n",
  "function useElementSize(",
  "function useElementSize(",
  "remove extracted ColumnMenu component",
);
react.replaceBetween(
  "function renderFilterValueControl(\n",
  "function resolveColumnWidth<TRow>(",
  "function resolveColumnWidth<TRow>(",
  "remove extracted menu and filter helpers",
);
react.replaceOnce(
  "function getSortButtonLabel(label: string, rule: TableSortRule | null) {\n  if (!rule) {\n    return `Sort ${label} ascending`;\n  }\n\n  if (rule.direction === \"asc\") {\n    return `Sort ${label} descending`;\n  }\n\n  return `Clear sort for ${label}`;\n}\n\nfunction getColumnMenuId(columnId: string) {\n  return `mb-table-column-menu-${columnId.replace(/[^a-zA-Z0-9_-]/g, \"-\")}`;\n}",
  "function getSortButtonLabel(\n  messages: TableMessages,\n  label: string,\n  rule: TableSortRule | null,\n) {\n  if (!rule) {\n    return messages.sortAscending(label);\n  }\n\n  if (rule.direction === \"asc\") {\n    return messages.sortDescending(label);\n  }\n\n  return messages.clearSort(label);\n}",
  "localized sort label and extracted menu id",
);

await react.save();

const data = editor("src/data.ts");
await data.load();
data.replaceOnce(
  "export type TableModelOptions<TRow> = {\n  columns: readonly TableDataColumn<TRow>[];\n  filter?: TableFilter<TRow> | null;\n  rows: readonly TRow[];",
  "export type TableModelOptions<TRow> = {\n  columns: readonly TableDataColumn<TRow>[];\n  filter?: TableFilter<TRow> | null;\n  locale?: string | readonly string[];\n  rows: readonly TRow[];",
  "table model locale option",
);
data.replaceOnce(
  "export function createTableModel<TRow>({\n  columns,\n  filter,\n  rows,\n  sort,",
  "export function createTableModel<TRow>({\n  columns,\n  filter,\n  locale,\n  rows,\n  sort,",
  "model locale destructuring",
);
data.replaceOnce(
  "  if (kernel && !hasActivePredicate(filter)) {",
  "  if (kernel && locale === undefined && !hasActivePredicate(filter)) {",
  "locale-aware kernel boundary",
);
data.replaceOnce(
  "    ? applyTableFilter(rows, columns, filter)\n    : Array.from(rows);",
  "    ? applyTableFilter(rows, columns, filter, locale)\n    : Array.from(rows);",
  "locale filter model call",
);
data.replaceOnce(
  "    ? applyTableSort(filteredRows, columns, sort)\n    : filteredRows;",
  "    ? applyTableSort(filteredRows, columns, sort, locale)\n    : filteredRows;",
  "locale sort model call",
);
data.replaceOnce(
  "export function applyTableFilter<TRow>(\n  rows: readonly TRow[],\n  columns: readonly TableDataColumn<TRow>[],\n  filter: TableFilter<TRow>,\n): TRow[] {",
  "export function applyTableFilter<TRow>(\n  rows: readonly TRow[],\n  columns: readonly TableDataColumn<TRow>[],\n  filter: TableFilter<TRow>,\n  locale?: string | readonly string[],\n): TRow[] {",
  "filter locale signature",
);
data.replaceOnce(
  "  if (!kernel) {\n    return applyTableFilterTypeScript(rows, columns, filter);\n  }",
  "  if (!kernel || locale !== undefined) {\n    return applyTableFilterTypeScript(rows, columns, filter, locale);\n  }",
  "filter locale kernel boundary",
);
data.replaceOnce(
  "export function applyTableSort<TRow>(\n  rows: readonly TRow[],\n  columns: readonly TableDataColumn<TRow>[],\n  sort: TableSortState,\n): TRow[] {",
  "export function applyTableSort<TRow>(\n  rows: readonly TRow[],\n  columns: readonly TableDataColumn<TRow>[],\n  sort: TableSortState,\n  locale?: string | readonly string[],\n): TRow[] {",
  "sort locale signature",
);
data.replaceOnce(
  "  if (kernel) {\n    return rowsFromSourceIndices(rows, kernel.queryTable(rows, columns, null, sort).sourceIndices);\n  }\n\n  return applyTableSortTypeScript(rows, columns, sort);",
  "  if (kernel && locale === undefined) {\n    return rowsFromSourceIndices(rows, kernel.queryTable(rows, columns, null, sort).sourceIndices);\n  }\n\n  return applyTableSortTypeScript(rows, columns, sort, locale);",
  "sort locale kernel boundary",
);
data.replaceOnce(
  "export function compareTableValues(\n  left: string | number | boolean | Date | null | undefined,\n  right: string | number | boolean | Date | null | undefined,\n): number {",
  "export function compareTableValues(\n  left: string | number | boolean | Date | null | undefined,\n  right: string | number | boolean | Date | null | undefined,\n  locale?: string | readonly string[],\n): number {",
  "public locale comparison signature",
);
data.replaceOnce(
  "  return String(leftValue).localeCompare(String(rightValue), undefined, {\n    numeric: true,\n    sensitivity: \"base\",\n  });",
  "  return getTableCollator(locale).compare(String(leftValue), String(rightValue));",
  "public locale comparison",
);
data.replaceOnce(
  "function applyTableFilterTypeScript<TRow>(\n  rows: readonly TRow[],\n  columns: readonly TableDataColumn<TRow>[],\n  filter: TableFilter<TRow>,\n): TRow[] {",
  "function applyTableFilterTypeScript<TRow>(\n  rows: readonly TRow[],\n  columns: readonly TableDataColumn<TRow>[],\n  filter: TableFilter<TRow>,\n  locale?: string | readonly string[],\n): TRow[] {",
  "TypeScript filter locale signature",
);
data.replaceOnce(
  "      return column ? matchesColumnFilter(getColumnValue(column, row, rowIndex), columnFilter) : false;",
  "      return column ? matchesColumnFilter(getColumnValue(column, row, rowIndex), columnFilter, locale) : false;",
  "structured filter locale",
);
data.replaceOnce(
  "    const searchMatch = searchColumns.some((column) =>\n      normalizeSearchText(getColumnValue(column, row, rowIndex)).includes(query.toLowerCase()),\n    );",
  "    const normalizedQuery = query.toLocaleLowerCase(normalizeLocaleInput(locale));\n    const searchMatch = searchColumns.some((column) =>\n      normalizeSearchText(getColumnValue(column, row, rowIndex), locale).includes(normalizedQuery),\n    );",
  "global search locale",
);
data.replaceOnce(
  "function applyTableSortTypeScript<TRow>(\n  rows: readonly TRow[],\n  columns: readonly TableDataColumn<TRow>[],\n  sort: TableSortState,\n): TRow[] {",
  "function applyTableSortTypeScript<TRow>(\n  rows: readonly TRow[],\n  columns: readonly TableDataColumn<TRow>[],\n  sort: TableSortState,\n  locale?: string | readonly string[],\n): TRow[] {",
  "TypeScript sort locale signature",
);
data.replaceOnce(
  "        const comparison = compareForSort(leftValue, rightValue, rule.direction);",
  "        const comparison = compareForSort(leftValue, rightValue, rule.direction, locale);",
  "sort locale comparison call",
);
data.replaceOnce(
  "function matchesColumnFilter(value: unknown, filter: TableColumnFilter): boolean {",
  "function matchesColumnFilter(\n  value: unknown,\n  filter: TableColumnFilter,\n  locale?: string | readonly string[],\n): boolean {",
  "structured filter locale signature",
);
data.replaceOnce(
  "    return filterValuesEqual(value, filter.value, filter.caseSensitive === true);",
  "    return filterValuesEqual(value, filter.value, filter.caseSensitive === true, locale);",
  "equals locale",
);
data.replaceOnce(
  "    return !filterValuesEqual(value, filter.value, filter.caseSensitive === true);",
  "    return !filterValuesEqual(value, filter.value, filter.caseSensitive === true, locale);",
  "not equals locale",
);
data.replaceOnce(
  "      filterValuesEqual(value, candidate, filter.caseSensitive === true),",
  "      filterValuesEqual(value, candidate, filter.caseSensitive === true, locale),",
  "in locale",
);
data.replaceOnce(
  "  return matchesStringFilter(value, filter);",
  "  return matchesStringFilter(value, filter, locale);",
  "string filter locale",
);
data.replaceOnce(
  "function matchesStringFilter(value: unknown, filter: TableColumnFilter): boolean {\n  const actual = normalizeStringValue(value, filter.caseSensitive === true);\n  const expected = normalizeStringValue(filter.value, filter.caseSensitive === true);",
  "function matchesStringFilter(\n  value: unknown,\n  filter: TableColumnFilter,\n  locale?: string | readonly string[],\n): boolean {\n  const actual = normalizeStringValue(value, filter.caseSensitive === true, locale);\n  const expected = normalizeStringValue(filter.value, filter.caseSensitive === true, locale);",
  "string filter locale signature",
);
data.replaceOnce(
  "function filterValuesEqual(left: unknown, right: unknown, caseSensitive: boolean): boolean {",
  "function filterValuesEqual(\n  left: unknown,\n  right: unknown,\n  caseSensitive: boolean,\n  locale?: string | readonly string[],\n): boolean {",
  "string equality locale signature",
);
data.replaceOnce(
  "  if (typeof left === \"string\" || typeof right === \"string\") {\n    return normalizeStringValue(left, caseSensitive) === normalizeStringValue(right, caseSensitive);\n  }",
  "  if (typeof left === \"string\" || typeof right === \"string\") {\n    if (caseSensitive) {\n      return stringifyCellValue(left) === stringifyCellValue(right);\n    }\n    return getTableCollator(locale).compare(stringifyCellValue(left), stringifyCellValue(right)) === 0;\n  }",
  "locale-aware string equality",
);
data.replaceOnce(
  "function compareForSort(left: unknown, right: unknown, direction: TableSortDirection): number {",
  "function compareForSort(\n  left: unknown,\n  right: unknown,\n  direction: TableSortDirection,\n  locale?: string | readonly string[],\n): number {",
  "sort comparator locale signature",
);
data.replaceOnce(
  "    comparison = leftString === rightString ? 0 : leftString < rightString ? -1 : 1;",
  "    comparison = getTableCollator(locale).compare(leftString, rightString);",
  "locale-aware string sorting",
);
data.replaceOnce(
  "function normalizeSearchText(value: unknown): string {\n  return stringifyCellValue(value).toLowerCase();\n}\n\nfunction normalizeStringValue(value: unknown, caseSensitive: boolean): string {\n  const string = stringifyCellValue(value);\n  return caseSensitive ? string : string.toLowerCase();\n}",
  "function normalizeSearchText(\n  value: unknown,\n  locale?: string | readonly string[],\n): string {\n  return stringifyCellValue(value).toLocaleLowerCase(normalizeLocaleInput(locale));\n}\n\nfunction normalizeStringValue(\n  value: unknown,\n  caseSensitive: boolean,\n  locale?: string | readonly string[],\n): string {\n  const string = stringifyCellValue(value);\n  return caseSensitive ? string : string.toLocaleLowerCase(normalizeLocaleInput(locale));\n}\n\nfunction normalizeLocaleInput(locale?: string | readonly string[]) {\n  return typeof locale === \"string\" || locale === undefined ? locale : [...locale];\n}\n\nfunction getTableCollator(locale?: string | readonly string[]) {\n  return new Intl.Collator(normalizeLocaleInput(locale), {\n    numeric: true,\n    sensitivity: \"base\",\n  });\n}",
  "locale text helpers",
);
await data.save();
