# Rust foundation

`tables` owns its table-specific computation directly. There is no underlying generic visualization/query engine.

## Semantic ownership

| Concern | Owner |
| --- | --- |
| Semantic `<table>` rendering | TypeScript/React |
| Virtual grid DOM, accessibility, focus, events | TypeScript/React |
| Controlled/uncontrolled component state | TypeScript/React |
| User callbacks (`accessor`, `sortAccessor`, custom predicate) | TypeScript adapter |
| Built-in filters, search, stable multi-sort, source-index selection | `tables-core` |
| Table-specific virtualization geometry | `tables-core` |
| Browser bridge to Rust | `tables-wasm` |

`tables-wasm` is deliberately thin. It accepts typed/columnar values and a compact table query, delegates semantics to `tables-core`, and returns source row indices. It does not introduce frames, layers, renderers, or a generic dataset abstraction.

## Query boundary

The TypeScript adapter evaluates JavaScript accessors once while constructing typed columns. Numeric/date and boolean columns cross as typed arrays; string-like values cross as stable strings. Rust then owns the built-in operation:

1. structured filters are ANDed;
2. optional global search is applied;
3. multi-column sorting is stable;
4. source row order resolves exact ties;
5. source indices are returned to TypeScript.

Custom predicates remain in JavaScript because arbitrary callbacks cannot be moved into Rust without turning the Wasm boundary into per-row callback traffic. When a custom predicate is present, Rust still evaluates built-in structured/search candidates and TypeScript applies only that callback portion.

## Browser initialization

The React entry points load the package-local Wasm kernel automatically. The first render/SSR path retains a TypeScript compatibility implementation with the same tested contract; once the kernel is ready, the component remounts onto Rust-backed querying. Headless consumers can explicitly call `loadTableWasmKernel()`.

## Virtualization boundary

Variable viewport geometry is cached on both sides. Hosted measurement showed the JS↔Wasm crossing costs more than the actual cached viewport computation, so fine-grained scroll geometry remains cached TypeScript in the production component. That decision is independent of query ownership: table filtering/search/sorting is a coarser batched operation and is now directly Rust-owned.

## Verification policy

Rust verification includes formatting, strict Clippy, unit/invariant tests, rustdoc, benchmark compilation, and descriptive benchmark evidence. Browser verification additionally builds the local Wasm package and proves TypeScript/Rust/Wasm parity for both virtualization and query semantics.

Dependency lockfiles are fail-closed in normal CI. Benchmark timings remain evidence rather than merge thresholds until enough historical runner data exists to define stable variance budgets.

## Expansion rule

New Rust work must remain table-specific and computation-oriented. React rendering, accessibility, DOM focus, event ownership, and arbitrary JavaScript callbacks stay out of Rust. New kernels should be batched enough to justify the boundary and should carry deterministic parity evidence before becoming browser defaults.
