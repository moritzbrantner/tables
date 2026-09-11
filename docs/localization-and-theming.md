# Localization and theming

`@moritzbrantner/tables` owns table mechanics and table-specific interaction copy. Applications own their i18n framework, domain formatting, and visual theme.

## Messages

`VirtualTable` accepts `messages` as a typed partial `TableMessageOverrides`. English remains the zero-config default. Applications can inject visible and ARIA copy for loading and empty states, sorting, filters, column actions, table options, and resizing without introducing an i18n runtime dependency into this package.

`examples/localization.html` demonstrates English, German, and Spanish messages. These are example dictionaries rather than a package-level translation catalog.

## Locale-aware client processing

`VirtualTable` accepts `locale`, which is forwarded to the built-in client-side string filtering and sorting path. The TypeScript path uses locale-aware case folding and `Intl.Collator` for string comparison. When `locale` is omitted, the existing canonical query/Wasm behavior remains unchanged. Locale is configuration, not table state, so it is not serialized by the durable view-state codec.

Number, currency, date, and other domain formatting still belongs in cell renderers or the host application.

## Semantic CSS variables

The base stylesheet inherits host typography and exposes neutral table variables with usable fallbacks:

- `--mb-table-border`
- `--mb-table-cell-border`
- `--mb-table-header-bg`
- `--mb-table-row-bg`
- `--mb-table-row-alt-bg`
- `--mb-table-row-hover-bg`
- `--mb-table-row-selected-bg`
- `--mb-table-interactive-bg`
- `--mb-table-menu-bg`
- `--mb-table-overlay-bg`
- `--mb-table-focus`
- `--mb-table-focus-ring`
- `--mb-table-shadow`
- `--mb-table-text`
- `--mb-table-muted`

The example theme adapter maps those table variables onto its host semantic tokens. An `@moritzbrantner/ui` adapter should use the same one-way boundary: UI/theme tokens feed table CSS variables at the application or composition layer; `tables` must not import `@moritzbrantner/ui` at runtime.

For example, a host theme maps its semantic background/foreground/border/accent/ring/shadow tokens to the corresponding `--mb-table-*` variables. This keeps the package independently usable while allowing `@moritzbrantner/ui` to own the concrete themed composition.

## Touch and narrow viewports

The base stylesheet provides larger coarse-pointer targets for menu, sort, reorder, and resize interactions. Tables remain horizontally contained inside their host and keep horizontal scrolling in the table scroller rather than overflowing the page. Menus clamp to viewport dimensions.

`examples/localization.html` includes a narrow-width acceptance mode and light/dark semantic themes so the same selected, hover, focus, menu, and table hierarchy can be exercised without adding theme-specific mechanics to the package.
