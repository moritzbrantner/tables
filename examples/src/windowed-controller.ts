import {
  createTableQuerySession,
  createTableWindowModel,
  type TableDataColumn,
  type TableQuerySession,
} from "../../src/data";

export type WindowedView = { offset: number; query: string; descending: boolean; reuse: boolean };

/** Command-driven query ownership. React renders returned pages, not the engine. */
export function createWindowedController<TRow>(rows: readonly TRow[], columns: readonly TableDataColumn<TRow>[], pageSize: number) {
  let session: TableQuerySession<TRow> | null = null;
  let key: string | null = null;
  let revision = 0;
  let pageReads = 0;
  const dispose = () => { session?.dispose(); session = null; key = null; };
  return {
    dispose,
    read(view: WindowedView) {
      const options = { rows, columns,
        filter: { query: view.query, queryColumnIds: ["name"] },
        sort: [{ columnId: "value", direction: view.descending ? "desc" as const : "asc" as const }],
      };
      const window = { offset: view.offset, limit: pageSize };
      if (!view.reuse) {
        dispose();
        revision++;
        pageReads++;
        return { model: createTableWindowModel({ ...options, window }), revision, pageReads };
      }
      const nextKey = JSON.stringify([view.query, view.descending]);
      if (!session || key !== nextKey) {
        const next = createTableQuerySession(options);
        dispose();
        session = next;
        key = nextKey;
        revision++;
      }
      pageReads++;
      return { model: session.getWindow(window), revision, pageReads };
    },
  };
}
