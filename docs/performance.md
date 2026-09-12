# Performance Notes

`VirtualTable` is designed for large read-heavy tables where the browser should only render the cells that are visible. Performance evidence in this repository is descriptive: it records representative workloads and environments, but it is not a universal promise for every device, browser, row shape, renderer, or application.

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

`mode="manual"` is the preferred path for server-side data. The table emits filter, sort, selection, and column sizing changes through `onStateChange`, but does not locally mutate the supplied row order or row count. Pair it with `totalRowCount`, `filteredRowCount`, and `sortedRowCount` when the server knows counts beyond the current page. Use `rowIndexOffset` when a loaded window begins after the first result so visible and ARIA row positions remain global.

## Repeatable benchmark evidence

The repository separates three kinds of evidence instead of collapsing them into one score.

### Query/model workloads

`bun run benchmark:query` measures deterministic client-side table operations at 1,000, 10,000, and 100,000 rows:

- global text filtering;
- structured filtering;
- multi-column sorting;
- combined model filtering/sorting;
- controlled table-state updates.

The command performs one warm-up invocation followed by five timed samples per workload and records the median plus all samples. It writes `.artifacts/table-query-benchmark.json` with Bun, OS, architecture, CPU model, and CPU-count metadata.

### Browser/virtualization workloads

`bun run benchmark:browser` exercises the real Vite examples in headless Chromium and records:

- initial rendering of the 100,000-row dense table;
- vertical scrolling to the end of the 100,000-row table;
- horizontal scrolling of the wide-table example;
- keyboard column resizing.

Each workload has one warm-up plus three timed samples. Results and browser/environment metadata are written to `.artifacts/table-browser-benchmark.json`.

### TypeScript/Wasm boundary

`bun run benchmark:virtualization` remains the lower-level boundary measurement for the TypeScript and Rust/Wasm virtualization paths. It is intentionally separate from browser rendering and query/model timing.

`bun run benchmark:tables` runs the query and browser benchmark suites together. The Rust Foundation workflow publishes the resulting JSON reports plus the descriptive Rust benchmark output as a `table-benchmarks-<sha>` artifact for each relevant exact head.

## Comparing runs

Use the explicit comparison command rather than inferring a regression from one machine:

```sh
bun run benchmark:compare -- baseline.json candidate.json
```

The comparison prints median deltas for matching workload/size pairs. It does not fail on a percentage threshold. A stable threshold should only be introduced after enough same-environment evidence exists to distinguish real regressions from runner variance.

## What the benchmarks do not guarantee

The committed scripts and uploaded artifacts are reproducibility evidence, not a claim that 100,000-row client-side processing is appropriate for every application. Row shapes, custom cell rendering, browser versions, hardware, locale-aware comparison, and application state can materially change costs. Remote datasets should still prefer manual/server mode when query work belongs on the backend.
