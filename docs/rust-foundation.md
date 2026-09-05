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
| Browser bridge to Rust | thin `tables-wasm` adapter |

This boundary intentionally prevents `tables` from cloning filtering and sorting logic that already has a semantic owner in `viz-engine`.

## Virtualization kernel

`tables-core` owns fixed-size and variable-size viewport geometry. `VariableLayout` builds prefix offsets once, making repeated viewport queries O(log n) and allocation-free after O(n) construction. Fixed-size range queries remain O(1).

Malformed negative, NaN, and non-finite item sizes are normalized to zero before they enter the search structure. The TypeScript fallback uses the same normalization so the adapter boundary has one reviewed semantic contract rather than two subtly different implementations.

## Wasm adapter

`tables-wasm` is deliberately thin. It depends on `tables-core`, receives typed numeric inputs, and returns one six-number range record. It does not own table semantics.

The browser adapter exposes a persistent Wasm variable layout handle so item sizes cross the boundary once instead of on every scroll event. Consumers opt in by loading the `@moritzbrantner/tables/wasm` subpath. Until that load succeeds, the helper APIs use the existing TypeScript implementation.

A failed Wasm load therefore degrades to TypeScript rather than breaking table rendering. React, DOM events, focus, accessibility, controlled state, filtering, and sorting remain outside the Wasm layer.

## Verification policy

Rust verification is independent of the existing Bun/React CI and includes:

1. `cargo fmt --check`;
2. Clippy across all core targets with warnings denied;
3. workspace unit/invariant tests;
4. rustdoc with warnings denied;
5. compilation of every core benchmark target;
6. adapter formatting, Clippy, tests, and rustdoc;
7. compiled TypeScript/Rust/Wasm parity tests over fixed, variable, malformed, and generated deterministic cases;
8. package checks that require both the Wasm JS glue and binary to be present;
9. execution of descriptive benchmark scenarios with the output retained as a workflow artifact.

The Wasm parity gate compares exact `VirtualRange` objects rather than only checking that the module loads. Variable cases reuse one Rust layout across many queries so the test exercises the intended persistent boundary.

## Benchmark policy

Benchmark timings are evidence, not merge thresholds yet. Hosted runners vary, and a new kernel should not invent a percentage gate before enough history exists to distinguish real regressions from runner noise.

The initial scenarios cover O(1) fixed-size viewport queries, cached O(log n) variable-size viewport queries over 100,000 items, and O(n) construction of a 100,000-item variable layout.

After enough representative evidence is collected, regression thresholds can be introduced deliberately with a documented baseline and variance budget.

## Wasm migration rule

The Wasm adapter is opt-in. Before any React/browser path becomes Rust-backed by default:

1. parity must remain exact across TypeScript, Rust, and Wasm;
2. inputs stay typed/batched rather than row-object serialized;
3. the TypeScript fallback stays available;
4. packaging continues to prove the Wasm artifacts are actually shipped;
5. profiling must show the Wasm boundary pays for itself for the target workload.

## Expansion rule

Additional kernels belong in Rust only when they are reusable table computation rather than UI policy. Likely candidates are cached column geometry, visible-column index lookup, and batched viewport calculations. Selection semantics, DOM focus, ARIA behavior, and React event orchestration remain in TypeScript unless a separate measured computational kernel emerges.
