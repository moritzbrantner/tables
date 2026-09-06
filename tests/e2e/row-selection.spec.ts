import { expect, test } from "@playwright/test";

test("selects ranges with Shift and toggles rows with Ctrl", async ({ page }) => {
  await page.goto("/");

  const rows = page.locator(".mb-table__row");
  const first = rows.nth(0);
  const second = rows.nth(1);
  const third = rows.nth(2);

  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(third).toBeVisible();

  const firstBackground = await first.evaluate((row) => getComputedStyle(row).backgroundColor);
  const secondBackground = await second.evaluate((row) => getComputedStyle(row).backgroundColor);
  expect(secondBackground).toBe(firstBackground);

  await first.hover();
  const oddHoverBackground = await first.evaluate((row) => getComputedStyle(row).backgroundColor);
  expect(oddHoverBackground).not.toBe(firstBackground);

  await second.hover();
  const evenHoverBackground = await second.evaluate((row) => getComputedStyle(row).backgroundColor);
  expect(evenHoverBackground).toBe(oddHoverBackground);

  await first.click();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(second).toHaveAttribute("aria-selected", "false");

  await third.click({ modifiers: ["Shift"] });
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(third).toHaveAttribute("aria-selected", "true");

  await second.click({ modifiers: ["Control"] });
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(second).toHaveAttribute("aria-selected", "false");
  await expect(third).toHaveAttribute("aria-selected", "true");
});
