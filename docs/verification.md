# Verification

The repository uses layered verification so normal development loops pay for the cheapest stable evidence first while merge authority still exercises the complete package and browser surface.

## Fast loop

```sh
bun run verify:fast
```

This runs:

- Oxlint;
- TypeScript checking;
- deterministic Vitest unit/component tests.

Normal component interactions use Testing Library `userEvent` where user-level behavior is being tested. Lower-level browser mechanics remain covered at the browser layer instead of duplicating them in DOM shims.

## Browser loop

Install Chromium once for a fresh environment:

```sh
bunx playwright install --with-deps chromium
```

Then run:

```sh
bun run verify:browser
```

This builds the deterministic example pages and runs Playwright acceptance for virtualization, scrolling, keyboard focus, column menus, resizing, server windows, URL view state, localization, themes, narrow layouts, and automated WCAG checks through Axe.

The example pages are the repository's executable reusable-state catalog. They deliberately serve the role that a separate Storybook layer would otherwise duplicate here: each page is deterministic, built by Pages/CI, directly browser-testable, and usable as a public acceptance surface. Adding a second story runtime would duplicate the same components and fixtures without adding a distinct confidence boundary, so the repository keeps one browser acceptance catalog rather than parallel Storybook and Pages catalogs.

## Full verification

```sh
bun run verify
```

The full command runs the fast loop, browser-independent Wasm build and parity checks, package build/publint checks, and the browser loop. GitHub Actions requires the stable `merge-ready` check, aggregating the full `verify` job and applicable Rust, public-contract, findings and Pages validations. It installs the pinned Rust toolchain, `wasm-pack`, and Chromium before invoking this command.

## Test ownership

Use the cheapest layer that can observe the behavior reliably:

- pure data/state/serialization/navigation rules: Vitest;
- React component state and accessible surface contracts that do not depend on layout: Testing Library;
- virtualization boundaries, focus restoration, real scrolling, pointer/keyboard geometry, responsive/touch behavior, and automated accessibility: Playwright;
- package exports and browser example builds: build/publint/Pages gates;
- Rust/Wasm parity and lower-level Rust checks: Rust Foundation workflow.

Do not copy the same assertion into every layer merely to increase test counts. Browser acceptance should exist where the browser is part of the behavior.

## Generated interactive-grid journey

```sh
bun run test:e2e:model
bun run test:e2e:model:full
```

The first command runs the bounded smoke path in the existing Playwright harness;
`verify:browser` includes the same two cases. The second command opts into all
modeled edges (`TABLES_MODEL_FULL=1`), with a shortest prefix to each edge and
self-loops repeated twice. It does not enumerate arbitrary event sequences.

`tests/e2e/pipeline-journey.model.ts` contains the six-state XState contract for the
Pages overview: all rows → exact-ID search → ascending ID sort → row selection →
empty search → clear search, then navigation to the overview to reset. Repeated
searches retain sort and selection. An empty result blocks selection because no
result row exists; the previously selected account remains in the details panel.
The visible expectations are literal browser outcomes independent of `TableState`,
query helpers, Rust and fixture-generation code. XState and its graph utilities
are development dependencies only. Library query and application URL ownership
remain unchanged.

Each path starts from a fresh overview navigation. Desktop execution uses keyboard
input, Enter to sort, and Space to select with focus assertions. The mobile case
uses a 390 × 844 Chromium touch context and taps the search, sort and row controls.
This is emulation, not physical-device verification. Search text is entered through
Playwright; virtual-keyboard layout is outside this contract.

Each case prints a deterministically ordered coverage report and attaches
`pipeline-coverage.json` to its Playwright result, including visits per state/edge,
explicit gaps, completed paths and the blocked selection check. Visits count only
after the visible assertions pass; failed runs preserve their partial report.
The initial local run measured the smoke cases at about 3–4 seconds each;
full traversal took 42.6 seconds total across the two input modes. These are
informational developer-machine observations, not timing budgets.
Smoke covers all six states and 11 of 16 edges; the five intermediate reset edges
remain reported gaps. Full edge traversal covers all 16. Neither mode proves
arbitrary queries, every sorting direction, multi-row selection, other example
pages, URL history, every viewport or unbounded repetitions. Existing dedicated
browser and accessibility tests continue to cover their own contracts.
