# Rust foundation

`tables` uses Rust only where there is a clear table-specific computation boundary and a measurable reason to pay the Wasm/native integration cost. The goal is not to rewrite React in Rust; the goal is to make hot-path table computation small, reusable, testable, and fast.

## Semantic ownership

| Concern | Owner |
| --- | --- |
| Semantic `<table>` rendering | TypeScript/React |
| Virtual grid DOM, accessibility, focus, events | TypeScript/React |
| Controlled/uncontrolled component state | TypeScript/React |
| Filtering, sorting, query semantics | `@moritzbrantner/viz-engine` |
| Table-specific virtualization/geometry kernels | `tables-core` |
| Browser bridge to Rust | future thin Wasm adapter |

This boundary intentionally prevents `tables` from cloning filtering and sorting logic that already has a semantic owner in `viz-engine`.

## First Rust kernel: virtualization geometry

The existing TypeScript variable-size range function rebuilds a prefix-offset array before every binary-search query. That is convenient but wasteful in a scroll loop.

`tables-core` introduces `VariableLayout`:

- construction is O(n) and creates the prefix offsets once;
- viewport queries reuse that layout, are O(log n), and allocate nothing;
- fixed-size range queries remain O(1);
- malformed negative/non-finite item sizes are normalized before they enter the search structure;
- the convenience one-shot variable query remains available, but cached layouts are the intended hot-path API.

## Verification policy

Rust verification is independent of the existing Bun/React CI and currently includes:

1. `cargo fmt --check`;
2. Clippy across all targets with warnings denied;
3. workspace unit/invariant tests;
4. rustdoc with warnings denied;
5. compilation of every benchmark target;
6. execution of descriptive benchmark scenarios with the output retained as a workflow artifact.

The deterministic test suite checks known geometry, invalid inputs, monotonic offsets, range invariants, and binary-search parity against a simple linear reference across generated deterministic datasets.

## Benchmark policy

Benchmark timings are evidence, not merge thresholds yet. Hosted runners vary, and a new kernel should not invent a percentage gate before we have enough history to distinguish real regressions from runner noise.

The initial scenarios cover:

- O(1) fixed-size viewport queries;
- cached O(log n) variable-size viewport queries over 100,000 items;
- O(n) construction of a 100,000-item variable layout.

After enough representative evidence is collected, regression thresholds can be introduced deliberately with a documented baseline and variance budget.

## Wasm migration rule

The Rust crate is pure and dependency-free in the first slice. A Wasm adapter is a later layer, not part of the semantic core.

Before any browser path becomes Rust-backed by default:

1. the TypeScript and Rust results must be compared over deterministic boundary and generated cases;
2. the Wasm adapter must preserve those exact results;
3. inputs should cross the boundary in typed/batched form rather than row-object serialization;
4. a TypeScript fallback remains available until browser support and packaging are proven;
5. profiling must show the Wasm boundary pays for itself for the target workload.

For variable-size virtualization specifically, the Wasm adapter should keep a reusable Rust layout handle rather than copying/rebuilding all item sizes for every scroll event.

## Expansion rule

Additional kernels belong in Rust only when they are reusable table computation rather than UI policy. Likely candidates are cached column geometry, visible-column index lookup, and batched viewport calculations. Selection semantics, DOM focus, ARIA behavior, and React event orchestration remain in TypeScript unless a separate measured computational kernel emerges.
