import { createTableModel, type TableModel, type TableModelOptions } from "./data";
import { getTableQueryKernel, type PreparedTableQuery, type TableQueryWindow } from "./query-kernel";
import { validateTableQueryWindow, type TableWindowModel } from "./query-window";

/** Explicit lifetime for one immutable snapshot and one fixed filter/sort query. */
export type TableQuerySession<TRow> = {
  readonly filteredRowCount: number;
  readonly totalRowCount: number;
  getWindow(window: TableQueryWindow): TableWindowModel<TRow>;
  /** Releases native results and held row references. Safe to call more than once. */
  dispose(): void;
};

/**
 * Pay filtering/sorting once when a view will browse multiple pages. The current
 * Wasm kernel retains source indices in Rust and copies only each requested page.
 * Locale/callback and older-kernel paths materialize their full model once.
 *
 * Rows and columns must remain immutable for the session lifetime. Create a new
 * session for changed rows, schema, filter, sort or locale; kernel activation does
 * not change an existing session. Dispose old sessions when the view replaces them.
 * Use createTableWindowModel for a one-off query without full-result retention.
 */
export function createTableQuerySession<TRow>(options: TableModelOptions<TRow>): TableQuerySession<TRow> {
  const { columns, filter, locale, sort } = options;
  let sourceRows: readonly TRow[] | null = options.rows;
  const totalRowCount = sourceRows.length;
  const kernel = getTableQueryKernel();
  let prepared: PreparedTableQuery | null = null;
  let model: TableModel<TRow> | null = null;
  if (kernel?.prepareTableQuery && locale === undefined && !(filter?.query?.trim() && filter.predicate)) {
    prepared = kernel.prepareTableQuery(sourceRows, columns, filter, sort);
  } else {
    model = createTableModel(options);
  }
  const filteredRowCount = prepared?.filteredRowCount ?? model!.filteredRowCount;
  const sortedRowCount = prepared ? filteredRowCount : model!.sortedRowCount;
  const resultLength = prepared ? filteredRowCount : model!.rows.length;
  let disposed = false;
  return {
    filteredRowCount,
    totalRowCount,
    dispose() {
      if (disposed) return;
      disposed = true;
      try { prepared?.dispose(); } finally {
        prepared = null;
        model = null;
        sourceRows = null;
      }
    },
    getWindow(window) {
      if (disposed) throw new Error("Table query session has been disposed");
      validateTableQueryWindow(window);
      const offset = Math.min(window.offset, resultLength);
      let page: readonly TRow[];
      if (prepared) {
        const result = prepared.queryWindow(window);
        const resolved: TRow[] = [];
        for (const index of result.sourceIndices) {
          const row = sourceRows![index];
          if (row !== undefined) resolved.push(row);
        }
        page = resolved;
      } else {
        const remaining = model!.rows.length - offset;
        page = model!.rows.slice(offset, offset + Math.min(window.limit, remaining));
      }
      return {
        columns, rows: page, totalRowCount, filteredRowCount,
        sortedRowCount,
        rowIndexOffset: offset,
        window: { offset, limit: window.limit },
      };
    },
  };
}
