# Query performance evidence and ratchets

Run commands from the repository root. Timing reports and deterministic work limits are separate: CI hard-gates correctness/allocation work, while wall-clock regressions require comparable evidence rather than a brittle shared-runner threshold.

## Deterministic ratchets

```sh
cargo test --locked -p tables-core --test query_ratchets -- --show-output
bunx vitest run src/data.performance.test.ts
```

These run inside the existing Rust and TypeScript test suites; no separate validation build is added.

- Search allocation calls must stay constant at 1,000, 10,000, and 100,000 rows. Full results may allocate one u32 buffer plus bounded query preparation/scratch.
- A 32-row unsorted page must retain at most 32 indices and allocate at most 2 KiB during querying, independent of source row count. All matches are still counted.
- String membership preparation plus sorting cannot reintroduce per-row heap allocation.
- Default-locale ordinary ASCII search may perform at most two locale-sensitive lowercase calls per query, not one per cell. Capital I, non-ASCII strings, and explicit locales retain the original locale-sensitive path.

The allocation meter is integration-test-only, thread-local, and tested against a real allocation. It measures requested allocation bytes, not peak RSS, retained allocator arenas, or index construction. Fixtures are built before measurement. Unicode, stable sorting, null placement, exact total counts, zero-sized pages, and extreme offsets are correctness checks, not timing checks.

## Native query scaling

```sh
cargo bench --locked -p tables-core --bench query
```

The native suite writes `.artifacts/table-core-query-benchmark.json`: eight workloads at three sizes, seven timing samples, median, all samples, count, and order-sensitive checksum. Paging workloads also measure the same kernel with full materialization before slicing, alternating measurement order. This reference is explicitly not another table library.

The implementation uses direct identity windows, page-sized unsorted result buffers, rank selection followed by sorting only the requested interval, and query-local reusable numeric formatting scratch. Small edge windows now retain bounded candidate batches; middle/deep windows can still require O(N) space. Native paging gains do not automatically mean that the public TypeScript table model is paginated; that model still exposes its full row result.

## Pinned TanStack comparison

```sh
bun install --frozen-lockfile
npm ci --prefix benchmarks/references --ignore-scripts --no-audit --no-fund
bun run build:wasm:node:release
bun benchmarks/references/run.mjs --wasm
```

The dependency is isolated from the production package and root Bun lockfile. The harness asserts the exact `@tanstack/table-core` version pinned in its package file, currently 8.21.3. Omitting `--wasm` explicitly measures only the TypeScript fallback against TanStack; requesting Wasm never silently falls back if its release artifact is missing.

The suite compares the actual TanStack core/filter/sort row-model pipeline with the public table model using TypeScript and Rust/Wasm. It covers global text search, numeric text search, numeric multi-sort, and combined filtering/sorting at 1,000, 10,000, and 100,000 rows.

Cold snapshots and changed queries are separate. Cold samples use new row-array identities and include index/model preparation, but not fixture generation or module startup. Changed queries alternate states over an immutable snapshot, preventing memoized no-op results from replacing actual work. Each phase has two warm-ups and seven samples with rotating provider order. Runtime cleanup and explicit garbage collection happen outside timing; so does complete ordered-ID validation against an independent oracle after every invocation.

`.artifacts/table-reference-benchmark.json` retains individual samples, ratios to TanStack, fixture checksums, runtime/CPU metadata, checkout and requested-source SHAs, and the measured Wasm binary digest. Lower ratios are faster. These are headless query-API timings, not DOM rendering comparisons; TanStack also creates richer row-model metadata. ASCII/finite-number workloads do not establish locale, null, grouping, or feature-completeness equivalence.

An explicit same-run relative timing gate is available for controlled performance runs:

```sh
bun benchmarks/references/run.mjs --wasm --max-ratio 1.25
```

The number is an example, not the repository's default accepted budget. A threshold must be selected from retained evidence. Invalid thresholds fail immediately; exceeded thresholds write the report and exit nonzero. CI records ratios without this noisy timing gate and hard-gates all result parity and deterministic work limits instead. Never raise a ratchet simply to make a regression green.

The Rust Foundation workflow reuses its existing release Wasm build for this comparison and uploads both native and reference JSON reports. AG Grid Community and MUI X Data Grid Community have a separate production-browser harness in `benchmarks/browser`; headless results alone do not claim browser performance parity.

## Prepared sessions and historical cold-bridge comparison

```sh
bun run build:wasm:node:release
bun run benchmark:sessions
git fetch --no-tags --depth=1 origin 87d7f6c91df5668b9512c27be5a721b44c62cd8e
bun run benchmark:preparation
node --test benchmarks/query-reuse-contract.test.mjs
```

The existing Wasm job reuses its release build and publishes:

- `.artifacts/table-query-sessions-benchmark.json`: 24 backend/workload/size cases. Each retains seven preparation timings and seven alternating five-page batches, both prepared and one-off. Identity, sorted, filtered/sorted and empty queries are included. Full counts, global offsets and every ordered row ID are checked against an independent oracle after each invocation. Preparation is **not** included in the hot page number; it is reported alongside it with the observed break-even number of page reads. Column-index preparation has already happened for this suite.
- `.artifacts/table-cold-preparation-benchmark.json`: six dataset-size/schema-width cases. The real historical bridge from `87d7f6c` and current bridge share the same native binary, process, fixture and query. Every invocation gets a fresh row-array identity and alternates provider order. Two warm-ups and seven measured samples are retained per provider. This suite includes cold column preparation and validates complete ordered source indices after every invocation. The temporary historical source module is removed on exit.

Both reports retain source/checkout identity, binary digest, CPU/runtime metadata and correctness checksums. The report contract rejects missing or duplicate cases, incorrect medians, nonfinite samples, inconsistent provider results and altered baseline identity. Timing remains descriptive; no arbitrary wall-clock threshold is imposed on shared runners.

New deterministic limits run in the normal test lanes: a native prepared-window iterator performs **zero allocations**, copying 32 rows uses at most **128 bytes**, and these bounds hold at every page depth at 1k/10k/100k rows. The test drops the source index before reading pages, proving the snapshot does not requery it. Native identity preparation retains zero index bytes. A bridge ratchet requires one preparation and exactly the requested transfers across repeated/deep page reads, including after originating-index eviction. Declared numeric/date/boolean columns must not materialize an intermediate row-value array; that ratchet demonstrably fails against the prior bridge.

Sessions retain O(matching rows) source-index memory deliberately. They do not eliminate full preparation costs or turn one-off deep windows into O(page-size) queries. See `docs/performance.md` for lifecycle, React Strict Mode, compatibility and ownership constraints. The existing AG Grid/MUI browser matrix still measures the one-off window adapter; the session study and windowed demo are separate evidence, not an undisclosed reference-adapter change.
