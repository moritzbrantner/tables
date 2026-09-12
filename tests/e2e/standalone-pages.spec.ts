import { expect, test } from "@playwright/test";

test("uses standalone Pages styling without legacy theme variables", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByLabel("Theme")).toHaveCount(0);

  const unresolvedThemeVariables = await page.evaluate(() => {
    const styles = Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules, (rule) => rule.cssText);
      } catch {
        return [];
      }
    });

    return styles.filter((rule) =>
      ["--background", "--foreground", "--popover", "--card", "--ui-"].some((token) =>
        rule.includes(token),
      ),
    );
  });

  expect(unresolvedThemeVariables).toEqual([]);
});

test("exposes variations and benchmark evidence from Pages navigation", async ({ page }) => {
  await page.goto("/variations.html");

  await expect(page.getByRole("heading", { name: "Table variations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Benchmarks" })).toBeVisible();
  await expect(page.getByLabel("Pipeline result sample")).toBeVisible();
  await expect(page.getByLabel("Searchable pipeline variation")).toBeVisible();

  await page.goto("/benchmarks.html");

  await expect(page.getByRole("heading", { name: "Benchmarks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run in this browser" })).toBeVisible();
  await expect(page.getByLabel("Comparable React table implementations")).toBeVisible();
});
