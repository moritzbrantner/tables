import type { TableFilter } from "@moritzbrantner/tables";

export function updateFilterQuery<TRow>(
  filter: TableFilter<TRow> | null,
  query: string,
): TableFilter<TRow> | null {
  const trimmedQuery = query.trim();
  const { query: _previousQuery, ...rest } = filter ?? {};

  if (trimmedQuery) {
    return { ...rest, query };
  }

  const hasRemainingFilterState =
    Boolean(rest.predicate) ||
    Boolean(rest.columnFilters?.length) ||
    Boolean(rest.queryColumnIds?.length);

  return hasRemainingFilterState ? rest : null;
}
