import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const pageStyles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const demoStyles = readFileSync(new URL("./demo-ui.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./playground/app.tsx", import.meta.url), "utf8");
const demoUiSource = readFileSync(new URL("./demo-ui.tsx", import.meta.url), "utf8");

const legacyThemeTokens = [
  "var(--background)",
  "var(--foreground)",
  "var(--popover)",
  "var(--popover-foreground)",
  "var(--card)",
  "var(--card-foreground)",
  "var(--ui-",
];

describe("standalone Pages styling", () => {
  test("does not restore the old UI theme boundary", () => {
    for (const token of legacyThemeTokens) {
      expect(pageStyles).not.toContain(token);
      expect(demoStyles).not.toContain(token);
    }

    expect(appSource).not.toContain("ThemeControl");
    expect(appSource).not.toContain("UiTheme");
    expect(demoUiSource).not.toContain("UiTheme");
    expect(demoStyles).not.toContain("data-demo-theme");
  });

  test("keeps the column menu on an explicit opaque surface", () => {
    expect(demoStyles).toContain("--demo-bg: #ffffff;");
    expect(pageStyles).toContain(
      ".mb-table__column-menu {\n  background: var(--demo-bg);\n  color: var(--demo-fg);\n}",
    );
  });

  test("enables multi-row selection without zebra backgrounds", () => {
    expect(appSource.match(/selectionMode="multiple"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(pageStyles).toContain("--mb-table-row-bg: var(--demo-bg);");
    expect(pageStyles).toContain("--mb-table-row-alt-bg: var(--demo-bg);");
  });
});
