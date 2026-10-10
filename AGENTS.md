# AGENTS.md

Repository-specific guidance for coding agents. Shared rules (formatting, TypeScript, React, testing, accessibility, UI) come from the live `coding-agent-conventions` model and `coding-tooling`; do not copy them here.

## Purpose

`@moritzbrantner/tables` provides React tables in two deliberate lanes. Pick the smallest surface that fits:

- **Semantic lane:** `Table` from `./table`. It renders native document-flow `<table>` markup for results, reports and comparisons. It has no grid roles, no virtualization and no query runtime.
- **Interactive grid lane:** `VirtualTable` / `DataTable`. These handle large or wide data with virtualization, selection, resizing, column menus, sticky columns, filtering/sorting and controlled `TableState`.

Non-goals: editing, formulas, pivot tables, spreadsheet semantics, data fetching, routing and design-system theming.

The canonical decisions are in [docs/architecture.md](docs/architecture.md), which resolves #1/#2. Update that document in the same PR whenever a change moves an ownership boundary.

## Ownership boundaries

- `crates/tables-core` (Rust) owns the built-in query semantics: structured filters, global search, stable multi-sort, source-index selection, and table-specific virtualization geometry.
- `crates/tables-wasm` is a thin browser adapter over `tables-core` and must never become a second semantic implementation. Arbitrary JS callbacks (`accessor`, `sortAccessor`, custom predicates) stay in TypeScript and are never serialized into Wasm.
- The TypeScript headless modules (`src/data.ts`, `src/virtualization.ts`, `src/view-state.ts`, `src/server.ts`) own the public state/model contracts and the synchronous compatibility path used for SSR, bootstrap and unsupported environments. That path must stay behaviorally identical to Rust; `src/wasm-parity.test.ts` checks this.
- React (`src/react.tsx`, `src/react-rust.tsx`, `src/table.tsx`) owns rendering, DOM/ARIA, focus, menus, selection gestures and resizing.
- Applications own fetching, authorization, domain formatting, URL/router sync and persistence.
- The repository-owned model is canonical. TanStack Table is not the authority, and `@moritzbrantner/viz-engine` is not part of table processing.
- There is no reverse dependency on `@moritzbrantner/ui`.

## Public entry points and dependency direction

The `package.json` `exports` are `.` (grid and headless re-exports), `./table` (semantic lane only), `./react` (`src/react-rust.tsx`), `./data`, `./server`, `./view-state`, `./virtualization`, `./wasm`, `./styles.css` and `./table.css`.

- `./table` must remain consumable without the grid, query or Wasm runtime.
- `./data` and `./virtualization` stay React-free. React entry points depend inward on them, never the reverse.

## Fixtures

- `examples/` holds the deterministic example pages (`examples/src/playground/data.ts` for generated rows). They are the executable state catalog used by Pages and Playwright. There is deliberately no Storybook; see `docs/verification.md`.
- Browser acceptance tests live in `tests/e2e/`. Rust tests and benches live in `crates/tables-core/{tests,benches}`.

## Validation

See [docs/verification.md](docs/verification.md) for the full layering.

- Fast: `bun run verify:fast` (oxlint, `check-types`, Vitest).
- Browser: `bunx playwright install --with-deps chromium` once, then `bun run verify:browser`.
- Package: `bun run pack:check` (build, Wasm package check, publint).
- Wasm parity: `bun run test:wasm-parity`. Requires `wasm-pack`.
- Rust: `cargo fmt --all --check`, `cargo clippy --locked --workspace --all-targets --all-features -- -D warnings` and `cargo test --locked --workspace --all-features`. Run the same for `crates/tables-wasm` via `--manifest-path`, as in `.github/workflows/rust.yml`.
- Full: `bun run verify`. The hosted `verify` check is the merge authority (`.coding-tooling.json`).

Performance claims need evidence (`docs/performance.md`, `bun run benchmark:*`). Virtualization is a tool, not the default.
