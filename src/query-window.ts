import { createTableModel, type TableModel, type TableModelOptions } from "./data";
import { getTableQueryKernel, type TableQueryWindow } from "./query-kernel";

export type { TableQueryWindow } from "./query-kernel";

export type TableWindowModelOptions<TRow> = TableModelOptions<TRow> & {
  /** Absolute position within the filtered/sorted result, not the source rows. */
  window: TableQueryWindow;
};

export type TableWindowModel<TRow> = TableModel<TRow> & {
  /** Clamped global row position for VirtualTable's manual mode. */
  rowIndexOffset: number;
  window: TableQueryWindow;
};

/**
 * Query a bounded result without materializing every matching JS row. Counts
 * describe the complete filtered result; rows contain only the requested window.
 * Explicit locales, predicates, and older custom kernels preserve their existing
 * full-model semantics before slicing. The default createTableModel is unchanged.
 */
export function createTableWindowModel<TRow>(
  options: TableWindowModelOptions<TRow>,
): TableWindowModel<TRow> {
  const { columns, rows, filter, locale, sort, window } = options;
  validateTableQueryWindow(window);
  const kernel = getTableQueryKernel();
  if (kernel?.queryTableWindow && locale === undefined && !(filter?.query?.trim() && filter.predicate)) {
    const result = kernel.queryTableWindow(rows, columns, window, filter, sort);
    const page: TRow[] = [];
    for (const index of result.sourceIndices) {
      const row = rows[index];
      if (row !== undefined) page.push(row);
    }
    const offset = Math.min(window.offset, result.filteredRowCount);
    return {
      columns,
      rows: page,
      filteredRowCount: result.filteredRowCount,
      sortedRowCount: result.filteredRowCount,
      totalRowCount: rows.length,
      rowIndexOffset: offset,
      window: { offset, limit: window.limit },
    };
  }
  const model = createTableModel(options);
  const offset = Math.min(window.offset, model.rows.length);
  return {
    ...model,
    rows: model.rows.slice(offset, offset + Math.min(window.limit, model.rows.length - offset)),
    rowIndexOffset: offset,
    window: { offset, limit: window.limit },
  };
}

export function validateTableQueryWindow(window: TableQueryWindow): void {
  for (const [field, value] of [["offset", window.offset], ["limit", window.limit]] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`Table query window ${field} must be a non-negative safe integer`);
    }
  }
}
