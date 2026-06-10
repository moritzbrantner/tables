import { expect, test } from "@playwright/test";

test("keeps the column menu open after right-clicking a sortable header", async ({ page }) => {
  await page.goto("/");

  const amountSortButton = page
    .getByRole("button", { name: /sort amount ascending/i })
    .first();
  await amountSortButton.click({ button: "right" });

  const menu = page.getByRole("dialog", { name: /column actions for amount/i });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Sort ascending" })).toBeVisible();

  await page.waitForTimeout(100);
  await expect(menu).toBeVisible();
});
