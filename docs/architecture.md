# Table architecture

## Status

This document records the architecture already established on `main`. It replaces the historical uncertainty captured in issues #1 and #2.

## Product surfaces

`@moritzbrantner/tables` deliberately supports two rendering lanes:

- `Table` is the lightweight semantic surface for ordinary document-flow tables. It renders native table markup and stays independent from the interactive grid runtime.
- `VirtualTable` / `DataTable` is the interactive grid surface for large or wide operational datasets where virtualization, selection, resizing, filtering, sorting, sticky columns, and controlled state justify the extra machinery.

Consumers should choose the smallest surface that satisfies the use case. The semantic lane must not inherit interactive-grid dependencies merely to share implementation.

## Ownership

- `tables-core` owns built-in table query semantics and table-specific hot-path kernels: structured filtering, global search, stable multi-sort, source-index selection, and the Rust-owned operations that have measured reasons to live there.
- `tables-wasm` is a thin browser adapter over `tables-core`; it is not a second semantic implementation.
- TypeScript headless modules own public state/model contracts and the synchronous compatibility implementation used for SSR/bootstrap or unsupported environments.
- React owns rendering, DOM/ARIA behavior, focus, interaction state, menus, selection gestures, resizing, and React-specific column render callbacks.
- Applications own fetching, authorization, domain formatting, routing/URL synchronization, and side effects.
- `@moritzbrantner/ui` may compose or theme tables but does not own fundamental table mechanics. `tables` has no reverse runtime dependency on `ui`.

## Canonical interactive model

The repository-owned model is canonical. TanStack Table is not the semantic authority for this package, and `@moritzbrantner/viz-engine` is no longer part of normal table processing.

The public interactive state contract is `TableState`: sorting, filtering, selection, column sizing, visibility, and ordering are independently controlled by property presence. `initialState` seeds uncontrolled fields and `onStateChange` reports complete proposed state transitions.

## Query boundary

Built-in query behavior belongs to `tables-core` and must remain deterministic across TypeScript compatibility and Rust/Wasm execution. React presentation state such as column visibility and display order must not silently change filtering or sorting semantics unless the public query contract explicitly says so.

Custom JavaScript callbacks such as predicates or sort accessors remain adapter callbacks; arbitrary functions are never serialized into Wasm.

## Dependency direction

The lightweight `./table` subpath must remain independently consumable. Headless `./data` and `./virtualization` contracts should remain framework-independent and must not require React-specific render types. React entry points may depend inward on those contracts, never the reverse.

## Non-goals

Editing, formulas, pivot-table behavior, spreadsheet semantics, application data fetching, router ownership, and design-system theming are not part of the core table contract unless separately proposed.

## Change rule

Future changes must preserve these ownership boundaries or explicitly update this document in the same pull request. New features should prefer extending an existing semantic owner over adding parallel state models or processing layers.
