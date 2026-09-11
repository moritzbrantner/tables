import { expect, test } from "@playwright/test";

test("keeps roving focus correct across virtualized row boundaries", async ({ page }) => {
  await page.goto("/dense.html");

  const grid = page.getByRole("grid", { name: "Dense pipeline table" });
  const firstCell = grid.locator('[role="gridcell"][data-grid-row-index="0"]').first();
  await firstCell.focus();

  await page.keyboard.press("Control+End");
  const lastCell = page.locator(':focus[role="gridcell"]');
  await expect(lastCell).toHaveAttribute("data-grid-row-index", "99999", { timeout: 15_000 });

  await page.keyboard.press("Control+Home");
  await expect(page.locator(':focus[role="gridcell"]')).toHaveAttribute("data-grid-row-index", "0");
});

test("restores focus to the column-menu trigger after Escape", async ({ page }) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /Open column actions for/i }).first();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: /Column actions for/i })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Column actions for/i })).toBeHidden();
  await expect(trigger).toBeFocused();
});
