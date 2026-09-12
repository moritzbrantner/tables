import type { TableFilter } from "@moritzbrantner/tables";

export function updateFilterQuery<TRow>(
  filter: TableFilter<TRow> | null,
  query: string,
): TableFilter<TRow> | null {
  const trimmedQuery = query.trim();
  const rest: TableFilter<TRow> = filter ? { ...filter } : {};
  delete rest.query;

  if (trimmedQuery) {
    return { ...rest, query };
  }

  const hasRemainingFilterState =
    Boolean(rest.predicate) ||
    Boolean(rest.columnFilters?.length) ||
    Boolean(rest.queryColumnIds?.length);

  return hasRemainingFilterState ? rest : null;
}
