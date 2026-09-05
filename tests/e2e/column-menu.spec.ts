import { expect, test } from "@playwright/test";

test("keeps the Pages column menu opaque without theme controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByLabel("Theme")).toHaveCount(0);

  const amountSortButton = page
    .getByRole("button", { name: /sort amount ascending/i })
    .first();
  await amountSortButton.click({ button: "right" });

  const menu = page.getByRole("dialog", { name: /column actions for amount/i });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(menu.getByRole("button", { name: "Sort ascending" })).toBeVisible();

  await page.waitForTimeout(100);
  await expect(menu).toBeVisible();
});