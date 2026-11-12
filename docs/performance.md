# Performance Notes

`VirtualTable` is designed for large read-heavy tables where the browser should only render the cells that are visible. Wall-clock evidence records representative workloads and environments, not a universal promise for every device, browser, row shape, renderer, or application. Deterministic work ratchets are hard CI gates; see [query performance evidence and ratchets](../benchmarks/README.md).

## Recommendations

- Keep `rowHeight` fixed. Dynamic row measurement is deliberately not part of the first API because it complicates scrolling and cache invalidation.
- Provide stable `rowKey` values so React can reuse row DOM nodes while scrolling.
- Use `sortAccessor` when a rendered cell value is formatted but sorting should use a raw value. Custom sort accessors must be pure and deterministic for the supplied row and index. Accessor invocation counts and order are unspecified: preparation and sorting may reuse values. Randomness, counters, or other side effects cannot define supported ordering. Pure accessors retain the same ordering and TypeScript/Wasm parity.
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

`cargo bench --locked -p tables-core --bench query` separately covers eight native query workloads at 1,000, 10,000, 50,000, and 100,000 rows. The single-numeric full-sort case also records an alternating same-fixture `f64::total_cmp` comparator reference, so the specialized ordered-key path can be evaluated without comparing unrelated runners. It writes `.artifacts/table-core-query-benchmark.json`, including seven samples per case and same-kernel full-materialization references for paged queries. Its reference is not another library. The full-result model is unchanged; the additive windowed model forwards limits into Rust.

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

This is headless query evidence, not a DOM benchmark. Pinned AG Grid and MUI X production browser adapters are described below.

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

## Windowed public queries

`createTableWindowModel({ rows, columns, filter, sort, window: { offset, limit } })`
returns only the requested result window. `filteredRowCount` and `sortedRowCount`
continue to describe all matches; `rowIndexOffset` is the clamped global position.
The default full-result `createTableModel` API is unchanged. Offsets and limits
must be non-negative safe integers; a zero limit is a count-only query.

The built-in Wasm adapter passes the window into Rust and only transfers/maps
those source indices back to JavaScript. Older custom kernels, explicit locales,
and active JS predicates retain the existing full-model semantics before slicing.
That compatibility path does not claim bounded query memory. Treat row snapshots
and schema definitions as immutable, just as for the full Wasm model.

For small leading sorted pages, Rust retains at most twice `offset + limit`
candidates. Near the end it counts first and can retain the smaller suffix.
Middle/deep windows still have an O(N) worst case, and exact filtered counts still
require visiting matching candidates. No incorrect claim of O(page size) memory
for arbitrary offsets is made. Ratchets enforce a 4 KiB requested-allocation
budget for 32-row edge windows at 1k, 10k and 100k source rows.

`bun run benchmark:windows` compares the public window path with the full public
model followed by slicing, on the same prepared snapshot and in alternating order.
It writes `.artifacts/table-window-query-benchmark.json`. Build the node release
Wasm artifact first; the existing CI Wasm lane reuses that build.

The `/windowed.html` example exercises this API directly, including URL-backed
query/sort/offset state, full match counts, and global ARIA row positions.

## Production browser references

The separate `/references/` page runs actual pinned AG Grid Community 36.2.0 and
MUI X Data Grid Community 9.14.0 React components against `VirtualTable` with the
windowed model. Its dependencies live in `benchmarks/browser`; they are not part
of the published table package or the normal examples' JavaScript bundle.

Two scopes remain separate: client query plus rendering, and supplied-window
rendering with query work outside every provider's timer. In client scope the
Tables adapter owns one prepared query session per rows/filter/sort state, so a
page-only change reads another window without refiltering or resorting. This
matches AG Grid's retained row-model lifetime; changed filter/sort samples still
replace the session inside the measured interaction. All providers use 100-row
pages, 32-pixel row height, and a 400-pixel grid viewport. MUI Community's
100-row page limit means this is not a continuous 100k-row scrolling comparison.
Mount samples use fresh snapshot identities; changed queries establish the
opposite state outside timing and then measure a real state change. Provider
order rotates.

Every invocation validates the complete ordered page, matching count, first
rendered row, and bounded mounted row count. Reports retain all samples, exact
provider pins, browser/CPU information and source identity. Two timing phases stay
separate: `readyMedianMs` stops as soon as the adapter signals that query work,
React commit, and provider-specific asynchronous work are ready; `medianMs`
continues through two animation frames. The ready phase is useful for exposing
sub-frame adapter/query differences that the frame-complete metric intentionally
cannot resolve, but it is still scheduler latency rather than a pure CPU profile.
Richer provider metadata and feature/styling differences remain relevant.

```sh
npm ci --prefix benchmarks/browser --ignore-scripts --no-audit --no-fund
bun run build:wasm
bun run build:references
bunx playwright install chromium
bun run benchmark:references:browser
```

Normal Pages PR validation runs the 1k-row adapter smoke matrix; main, manual,
and `performance`-labelled PR runs execute all 1k/10k/100k cases. Both use the
production build at its real `/tables/references/` path. Timings are descriptive
unless an explicit controlled-run `--max-ratio` threshold is supplied; parity and
DOM work limits always fail closed.

## Repeated paging: explicit prepared sessions

`createTableWindowModel` remains the low-retention choice for one-off windows. When a view repeatedly browses the **same immutable rows and fixed query**, use a session instead:

```ts
import { createTableQuerySession } from "@moritzbrantner/tables/data";

const session = createTableQuerySession({ rows, columns, filter, sort });
try {
  const first = session.getWindow({ offset: 0, limit: 100 });
  const middle = session.getWindow({ offset: 50_000, limit: 100 });
  // Pass each page's rows, full counts, and rowIndexOffset to manual VirtualTable.
} finally {
  session.dispose();
}
```

A session evaluates its query once. The current Rust/Wasm kernel owns the complete matching source-index order; page reads allocate/transfer only the requested indices. Arbitrary middle and late pages do not scan rows or sort again. The native snapshot does not borrow the column index, so schema-cache eviction cannot invalidate an active session. Identity queries retain no native source-index buffer.

This is an explicit time/memory tradeoff, **not a free cache**: preparation pays full filtering/sorting and generally retains **4 bytes per matching row** in Rust, in addition to the existing column index. The session also holds the caller's immutable row snapshot so it can resolve returned source indices. A single bounded query can be cheaper than preparing an entire result. `benchmark:sessions` reports preparation separately, times five page reads against five one-off window queries in the same run, and estimates the observed break-even number of page reads rather than hiding startup cost.

Create a new session when rows, schema, filter, sort or locale changes; dispose the old one after its replacement has been created successfully. Input rows/column definitions must not be mutated in place. Filter and sort descriptors are evaluated at creation; later edits do not mutate the session. Changing the globally active kernel does not change an existing session. Disposal is idempotent; reads after disposal throw. Locale/callback and older custom-kernel paths preserve existing full-model semantics, materializing once per session rather than once per page. Older generated Wasm modules retain one copied source-index result in JavaScript as a compatibility path.

Keep session ownership outside React's render cycle, or create and dispose it within the **same** effect lifetime. Do not dispose a `useMemo`-created native handle from an effect cleanup: development Strict Mode can clean up and restart that effect while retaining the memoized handle. The windowed example uses a command-driven controller, explicitly replaces/disposes sessions on query/backend changes, and lets React render independent page results. Its URL-backed execution selector compares prepared sessions with one-off windows. Browser work ratchets assert that page navigation leaves the query revision unchanged in prepared mode.

## Cold column materialization

Declared number/date/boolean columns now write directly to their typed values and validity buffers; declared string/JSON columns build only the array needed by the string ABI. Accessors are called once per present source row. Sparse-array holes, invalid/nonfinite values, signed zero, and source accessor positions retain their previous transport semantics. Unspecified types still use first-non-null inference, and custom sort-accessor types remain independent of the display type.

`benchmark:preparation` compares the actual bridge from merged commit `87d7f6c` with the current bridge in one process using the **same release Wasm binary**. Historical bridge bytes are checked against their Git blob identity. The workload uses fresh immutable row-array identities, all-column search, three dataset sizes and both narrow/wide declared schemas. Fixture creation and GC are excluded; materialization, native indexing/querying and result transfer are included. This isolates the adapter change without presenting a synthetic mapper microbenchmark as end-to-end performance.

## Row memoization decision (#80)

Row memoization is deferred. The targeted prototype wraps the existing `GridRow`
with `React.memo` and its default shallow prop comparison, preserving every
callback and visible prop. It avoids **zero row renders** in the measured
range-crossing workloads. `visibleCenterEntries` is sliced again on each range
update; keyboard navigation callbacks depend on the current range, and the
roving focus position can change. These identities prevent shallow comparison
from reusing retained rows. Ignoring those props in a custom comparator could
retain stale navigation closures or stale cell/tabindex state. This experiment
does not establish whether a redesigned stable row boundary would help.

The benchmark uses the existing dense (100,000 rows) and wide examples in Vite
production builds. A build-only transform instruments row render calls in both
variants and adds the memo wrapper only in the candidate. It changes no published
entry point, production renderer, or semantic `Table` behavior. Starting at a
2,000-pixel offset avoids the initial overscan plateau; each sample performs 180
range-crossing scrolls, one step per two animation frames. Setup, initial mount,
and viewport settling are outside timing. Each workload has one warm-up and
five fresh-page samples. Reports retain Chromium script/task duration deltas,
all two-frame step intervals, row render calls, DOM row mounts/unmounts, range
changes, and final mounted/first-row counts. Render calls are instrumentation,
not React commit counts. Two-frame intervals are scheduler observations, not
individual display-frame or input-latency measurements.

Run both variants from the same checkout on the same idle machine. Artifacts
are local and ignored; no extra CI job is required:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run build:wasm
bun run benchmark:row-memo --variant baseline --output .artifacts/row-memo/baseline.json
bun run benchmark:row-memo --variant candidate --output .artifacts/row-memo/candidate.json
bun run benchmark:compare -- .artifacts/row-memo/baseline.json .artifacts/row-memo/candidate.json
```

The comparison command reports median **script** time for this report shape;
inspect the retained samples and frame/work counters alongside it. Repeat the
pair in reverse order before making a timing-based adoption decision. The
prototype deliberately does not ignore changing handlers or enforce new cell
renderer requirements. Immutable row snapshots remain required for the prepared
query path; this deferral introduces no additional renderer purity contract or
new way to refresh cells by mutation.

### Local observations, 2026-11-12

Renderer source: `a4f4dd26140195456d5a052fbfa9804fcace41e2`. Linux x64, AMD Ryzen 7 5700X (16 logical CPUs), Bun 1.4.4, Chromium 156.0.8078.4, viewport 1440 × 1000. These are sequential same-machine runs on a shared workstation, not isolated controlled timing. They are not directly comparable to #79’s development-build script totals.

| Workload | Baseline script median (ms) | Memo script median (ms) | Row renders per sample (both) | DOM mounts/unmounts (both) | Two-frame p95 baseline / memo (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| dense-range-scroll-100px | 1039.3 | 1849.6 | 7700 | 500 / 500 | 33.4 / 33.4 |
| dense-range-scroll-800px | 1156.2 | 1705.2 | 7700 | 4000 / 4000 | 33.4 / 50.0 |
| wide-range-scroll-100px | 474.1 | 508.2 | 5645 | 409 / 409 | 33.4 / 33.4 |

All script samples in milliseconds, baseline then memo:

- `dense-range-scroll-100px`: [1037.3, 1011.7, 1039.3, 1273.2, 1118.8] → [1625.4, 1849.6, 2508.4, 1421.8, 2016.8].
- `dense-range-scroll-800px`: [1349.9, 1249.2, 1156.2, 1103.6, 1085.4] → [2388.1, 2481.0, 1705.2, 1641.7, 1553.4].
- `wide-range-scroll-100px`: [775.5, 432.2, 474.1, 468.5, 583.0] → [469.1, 465.9, 508.2, 588.0, 541.3].

All samples in both variants crossed the range on all 180 steps; mounted rows and final first-row positions matched. There is no timing evidence supporting adoption, and the exact render counts show no eliminated row work. The slower candidate samples cannot isolate memo overhead from workstation contention. The decision rests on the absence of reusable row renders, not a claimed universal slowdown. Focus, keyboard, selection, sort/filter, resizing, viewport changes, and visible-cell correctness for a redesigned memoized implementation remain unverified; no such implementation is adopted.

The disposable baseline production example build totals 391,265 JavaScript bytes (118,166 gzip bytes summed per asset). The disposable candidate production example build totals 389,601 JavaScript bytes (117,583 gzip bytes summed per asset). These totals include the same instrumentation and all example entry points; they are not published-package size measurements. The production library renderer is unchanged.
