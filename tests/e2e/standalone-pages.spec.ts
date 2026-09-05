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