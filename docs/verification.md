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

The full command runs the fast loop, browser-independent Wasm build and parity checks, package build/publint checks, and the browser loop. GitHub Actions keeps the exact job context `verify` as the hosted merge-authority check and installs the pinned Rust toolchain, `wasm-pack`, and Chromium before invoking this command.

## Test ownership

Use the cheapest layer that can observe the behavior reliably:

- pure data/state/serialization/navigation rules: Vitest;
- React component state and accessible surface contracts that do not depend on layout: Testing Library;
- virtualization boundaries, focus restoration, real scrolling, pointer/keyboard geometry, responsive/touch behavior, and automated accessibility: Playwright;
- package exports and browser example builds: build/publint/Pages gates;
- Rust/Wasm parity and lower-level Rust checks: Rust Foundation workflow.

Do not copy the same assertion into every layer merely to increase test counts. Browser acceptance should exist where the browser is part of the behavior.
