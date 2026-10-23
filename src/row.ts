/**
 * Row identity and cell-render context shared by the semantic `Table` and the
 * interactive `VirtualTable`. This module is React-free and has no query
 * runtime so `./table` can depend on it without pulling in the grid.
 */

export type TableRowKey = string | number;

/** Row properties whose values can be used directly as a row key. */
export type TableRowKeyProperty<TRow> = {
  [TKey in keyof TRow]-?: TRow[TKey] extends TableRowKey ? TKey : never;
}[keyof TRow];

export type TableRowKeyAccessor<TRow> =
  | TableRowKeyProperty<TRow>
  | ((row: TRow, rowIndex: number) => TableRowKey);

export function getTableRowKey<TRow>(
  rowKey: TableRowKeyAccessor<TRow>,
  row: TRow,
  rowIndex: number,
): TableRowKey {
  return typeof rowKey === "function" ? rowKey(row, rowIndex) : (row[rowKey] as TableRowKey);
}

export type TableCellContext<TRow, TValue> = {
  columnId: string;
  row: TRow;
  rowIndex: number;
  value: TValue;
};
