# Performance Notes

`VirtualTable` is designed for large read-heavy tables where the browser should only render the cells that are visible. Wall-clock evidence records representative workloads and environments, not a universal promise for every device, browser, row shape, renderer, or application. Deterministic work ratchets are hard CI gates; see [query performance evidence and ratchets](../benchmarks/README.md).

## Recommendations

- Keep `rowHeight` fixed. Dynamic row measurement is deliberately not part of the first API because it complicates scrolling and cache invalidation.
- Provide stable `rowKey` values so React can reuse row DOM nodes while scrolling.
- Use `sortAccessor` when a rendered cell value is formatted but sorting should use a raw value.
- Keep `column.width` explicit for wide tables. Column virtualization depends on predictable widths.
- Memoize `columns`. Column definitions participate in model building, width calculation, and virtualization.
- Treat each local data refresh as a replacement immutable `rows` snapshot. The Rust/Wasm query index is prepared and reused by snapshot identity rather than rematerialized for every filter/sort change.
- For remote data sets, run filtering and sorting on the server, pass the current window into `rows`, and set `mode="manual"`.
- Use sticky columns sparingly. Sticky cells stay mounted even when center columns are virtualized.
- Prefer explicit `minWidth`, `width`, and `maxWidth` for resizable operational tables so horizontal scrolling remains predictable.

## Manual Mode

`mode="manual"` is the preferred path for server-side data. The table emits filter, sort, selection, and column sizing changes through `onStateChange`, but does not locally mutate the supplied row order or row count. Pair it with `totalRowCount`, `filteredRowCount`, and `sortedRowCount` when the server knows counts beyond the current page. Use `rowIndexOffset` when a loaded window begins after the first result so visible and ARIA row positions remain global.

## Repeatable benchmark evidence

The repository separates query, browser, boundary, and external-reference timing evidence instead of collapsing them into one score.

### Query/model workloads

`bun run benchmark:query` measures deterministic TypeScript fallback operations at 1,000, 10,000, and 100,000 rows:

- global text filtering;
- structured filtering;
- multi-column sorting;
- combined model filtering/sorting;
- controlled table-state updates.

It also records the same query semantics used by the GitHub Pages quick comparison at 1,000, 10,000, and 50,000 rows, together with the matching plain-JavaScript reference. This keeps the fallback path visible in CI even though the interactive Pages comparison loads the production Rust/Wasm query kernel before it measures.

The command performs one warm-up invocation followed by five timed samples per workload and records the median plus all samples. It writes `.artifacts/table-query-benchmark.json` with Bun, OS, architecture, CPU model, and CPU-count metadata.

`cargo bench --locked -p tables-core --bench query` separately covers eight native query workloads at 1,000, 10,000, and 100,000 rows. It writes `.artifacts/table-core-query-benchmark.json`, including seven samples per case and same-kernel full-materialization references for paged queries. Its reference is not another library. Native paging optimizations do not change the public TypeScript model's full-result API.

### Browser/virtualization workloads

`bun run benchmark:browser` exercises the real Vite examples in headless Chromium and records:

- initial rendering of the 100,000-row dense table;
- vertical scrolling to the end of the 100,000-row table;
- horizontal scrolling of the wide-table example;
- keyboard column resizing.

Each workload has one warm-up plus three timed samples. Results and browser/environment metadata are written to `.artifacts/table-browser-benchmark.json`.

The interactive GitHub Pages quick comparison loads the Rust/Wasm kernel first, performs parity/preparation outside the timed samples, then times repeated queries over the same immutable row snapshot. This makes the comparison represent the production repeated-query path rather than charging one-time index materialization to every filter/sort operation.

### TypeScript/Wasm boundary

`bun run benchmark:virtualization` is the lower-level TypeScript/Rust/Wasm boundary measurement. In addition to virtualization geometry it records the 50,000-row query workload in three forms:

- repeated Rust/Wasm query with a prepared immutable snapshot;
- the equivalent plain-JavaScript reference;
- a cold Rust/Wasm query that intentionally uses a fresh column-schema identity and therefore includes materialization.

The report records both the repeated-Wasm/reference ratio and the cold-materialization/repeated-query ratio. That keeps the optimization evidence honest: avoiding repeated materialization should improve the hot path without hiding the cost of preparing a new snapshot/schema.

`bun run benchmark:tables` runs the TypeScript query and browser benchmark suites together. The Rust Foundation workflow separately publishes the Wasm-boundary report and publishes the JSON query/browser/native reports plus descriptive Rust benchmark output as checkout-addressed artifacts.

### External reference queries

`benchmarks/references/run.mjs` compares the public table model, both TypeScript and release Rust/Wasm, with pinned TanStack Table core. It records cold snapshots separately from changed-query workloads, rotates measurement order, checks every result's complete row order, and retains environment/version/snapshot evidence in `.artifacts/table-reference-benchmark.json`. The workflow reuses its existing release Wasm build. See the [commands, methodology, limitations, and optional relative gate](../benchmarks/README.md).

This is headless query evidence, not a DOM benchmark. AG Grid and MUI X browser comparison adapters are not yet implemented.

## Comparing runs

Use the explicit comparison command rather than inferring a regression from one machine:

```sh
bun run benchmark:compare -- baseline.json candidate.json
```

The comparison prints median deltas for matching workload/size pairs. It does not fail on a percentage threshold. A stable threshold should only be introduced after enough same-environment evidence exists to distinguish real regressions from runner variance. The external-reference harness provides an explicit `--max-ratio` gate for controlled same-run comparisons; it is not enabled by default in CI.

## Deterministic work ratchets

The normal Rust tests enforce constant search allocation counts, page-sized unsorted buffers, and bounded string-filter preparation. TypeScript tests prevent per-cell locale setup on the ordinary ASCII default-locale path while preserving locale-sensitive cases. These checks gate changes without wall-clock thresholds. Their budgets, exclusions, and correctness coverage are documented in the [ratchet guide](../benchmarks/README.md).

## What the benchmarks do not guarantee

The committed scripts and uploaded artifacts are reproducibility evidence, not a claim that 100,000-row client-side processing is appropriate for every application. Row shapes, custom cell rendering, browser versions, hardware, locale-aware comparison, and application state can materially change costs. Remote datasets should still prefer manual/server mode when query work belongs on the backend.
