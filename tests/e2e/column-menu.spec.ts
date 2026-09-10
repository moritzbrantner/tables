import { expect, test } from "@playwright/test";

test("keeps the Pages column menu opaque without theme controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByLabel("Theme")).toHaveCount(0);

  const accountSortButton = page
    .getByRole("button", { name: /sort account ascending/i })
    .first();
  await accountSortButton.click({ button: "right" });

  const menu = page.getByRole("dialog", { name: /column actions for account/i });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(menu.getByRole("button", { name: /sort/i })).toHaveCount(0);
});
