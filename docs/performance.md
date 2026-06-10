# Performance Notes

`VirtualTable` is designed for large read-heavy tables where the browser should only render the cells that are visible.

## Recommendations

- Keep `rowHeight` fixed. Dynamic row measurement is deliberately not part of the first API because it complicates scrolling and cache invalidation.
- Provide stable `rowKey` values so React can reuse row DOM nodes while scrolling.
- Use `sortAccessor` when a rendered cell value is formatted but sorting should use a raw value.
- Keep `column.width` explicit for wide tables. Column virtualization depends on predictable widths.
- Memoize `columns`. Column definitions participate in model building, width calculation, and virtualization.
- For remote data sets, run filtering and sorting on the server, pass the current window into `rows`, and set `mode="manual"`.
- Use sticky columns sparingly. Sticky cells stay mounted even when center columns are virtualized.
- Prefer explicit `minWidth`, `width`, and `maxWidth` for resizable operational tables so horizontal scrolling remains predictable.

## Manual Mode

`mode="manual"` is the preferred path for server-side data. The table emits
filter, sort, selection, and column sizing changes through `onStateChange`, but
does not locally mutate the supplied row order or row count. Pair it with
`totalRowCount`, `filteredRowCount`, and `sortedRowCount` when the server knows
counts beyond the current page.

## Local Limits

The included demo uses 50,000 generated rows, with a denser scenario at 100,000
rows. That is meant as a smoke test for viewport rendering, not a promise that
every client-side sort or filter should happen in the browser for arbitrarily
large data. Client-side processing is appropriate for demos and moderate local
data; remote datasets should use manual mode.
