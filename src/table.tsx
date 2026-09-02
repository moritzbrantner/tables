import type {
  CSSProperties,
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
} from "react";

export type TableAlign = "center" | "end" | "start";

export type TableDensity = "comfortable" | "compact";

export type TableColumnDef<TRow> = {
  accessor: keyof TRow | ((row: TRow, rowIndex: number) => unknown);
  align?: TableAlign;
  cell?: (value: unknown, row: TRow, rowIndex: number) => ReactNode;
  cellClassName?: string | ((row: TRow, rowIndex: number) => string | undefined);
  header: ReactNode;
  headerClassName?: string;
  id: string;
  maxWidth?: number | string;
  minWidth?: number | string;
  width?: number | string;
};

export type TableRowKey<TRow> = keyof TRow | ((row: TRow, rowIndex: number) => number | string);

export type TableProps<TRow> = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  ariaLabel?: string;
  caption?: ReactNode;
  captionClassName?: string;
  columns: readonly TableColumnDef<TRow>[];
  density?: TableDensity;
  emptyState?: ReactNode;
  minWidth?: number | string;
  rowClassName?: string | ((row: TRow, rowIndex: number) => string | undefined);
  rowKey?: TableRowKey<TRow>;
  rows: readonly TRow[];
  striped?: boolean;
  tableClassName?: string;
  tableProps?: Omit<TableHTMLAttributes<HTMLTableElement>, "children" | "className">;
};

/**
 * A native semantic table for compact result sets, reports, comparisons, and
 * other document-flow tables. Use VirtualTable when rendering enough rows or
 * columns that virtualization and grid interactions are justified.
 */
export function Table<TRow>({
  ariaLabel,
  caption,
  captionClassName,
  className,
  columns,
  density = "comfortable",
  emptyState,
  minWidth = "100%",
  rowClassName,
  rowKey,
  rows,
  striped = false,
  tableClassName,
  tableProps,
  ...containerProps
}: TableProps<TRow>) {
  const { style: tableStyle, ...restTableProps } = tableProps ?? {};

  return (
    <div
      className={cx(
        "mb-native-table",
        `mb-native-table--${density}`,
        striped && "mb-native-table--striped",
        className,
      )}
      {...containerProps}
    >
      <div className="mb-native-table__scroll">
        <table
          aria-label={ariaLabel}
          className={cx("mb-native-table__table", tableClassName)}
          style={{ ...tableStyle, minWidth: toCssSize(minWidth) }}
          {...restTableProps}
        >
          {caption ? (
            <caption className={cx("mb-native-table__caption", captionClassName)}>
              {caption}
            </caption>
          ) : null}
          <thead className="mb-native-table__head">
            <tr className="mb-native-table__header-row">
              {columns.map((column) => (
                <th
                  className={cx(
                    "mb-native-table__header-cell",
                    alignmentClassName(column.align, "header-cell"),
                    column.headerClassName,
                  )}
                  key={column.id}
                  scope="col"
                  style={columnStyle(column)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="mb-native-table__body">
            {rows.map((row, rowIndex) => (
              <tr
                className={cx(
                  "mb-native-table__row",
                  resolveClassName(rowClassName, row, rowIndex),
                )}
                key={getRowKey(rowKey, row, rowIndex)}
              >
                {columns.map((column) => {
                  const value = getValue(column, row, rowIndex);

                  return (
                    <td
                      className={cx(
                        "mb-native-table__cell",
                        alignmentClassName(column.align, "cell"),
                        resolveClassName(column.cellClassName, row, rowIndex),
                      )}
                      key={column.id}
                      style={columnStyle(column)}
                    >
                      {column.cell
                        ? column.cell(value, row, rowIndex)
                        : renderValue(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && emptyState !== undefined ? (
              <tr className="mb-native-table__row mb-native-table__row--empty">
                <td className="mb-native-table__empty" colSpan={Math.max(1, columns.length)}>
                  {emptyState}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getValue<TRow>(column: TableColumnDef<TRow>, row: TRow, rowIndex: number): unknown {
  return typeof column.accessor === "function"
    ? column.accessor(row, rowIndex)
    : row[column.accessor];
}

function getRowKey<TRow>(
  rowKey: TableRowKey<TRow> | undefined,
  row: TRow,
  rowIndex: number,
): number | string {
  if (typeof rowKey === "function") {
    return rowKey(row, rowIndex);
  }

  if (rowKey !== undefined) {
    const value = row[rowKey];
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }
  }

  return rowIndex;
}

function renderValue(value: unknown): ReactNode {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === "bigint" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  return String(value);
}

function columnStyle<TRow>(column: TableColumnDef<TRow>): CSSProperties {
  return {
    maxWidth: toCssSize(column.maxWidth),
    minWidth: toCssSize(column.minWidth),
    width: toCssSize(column.width),
  };
}

function toCssSize(value: number | string | undefined): string | undefined {
  if (typeof value === "number") {
    return `${value}px`;
  }

  return value;
}

function alignmentClassName(
  align: TableAlign | undefined,
  element: "cell" | "header-cell",
): string | undefined {
  return align ? `mb-native-table__${element}--${align}` : undefined;
}

function resolveClassName<TRow>(
  value: string | ((row: TRow, rowIndex: number) => string | undefined) | undefined,
  row: TRow,
  rowIndex: number,
): string | undefined {
  return typeof value === "function" ? value(row, rowIndex) : value;
}

function cx(...values: Array<false | null | string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
