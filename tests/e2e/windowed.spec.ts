import { expect, test } from "@playwright/test";

test("windowed queries keep URL state, global row positions and full counts", async ({ page }) => {
  await page.goto("/windowed.html?offset=100&sort=asc&query=");
  await expect(page.getByTestId("query-backend")).toContainText("Rust/Wasm · bounded query result");
  const grid = page.getByRole("grid", { name: "Windowed account results" });
  await expect(page.getByTestId("window-count")).toHaveText("100 returned · 100,000 matching · offset 100");
  await expect(grid.locator('[role="row"][aria-rowindex="102"]')).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/offset=200/);
  await expect(grid.locator('[role="row"][aria-rowindex="202"]')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("window-count")).toContainText("offset 200");
  await page.getByRole("textbox", { name: "Search accounts" }).fill("Account 17");
  await expect(page).toHaveURL(/offset=0/);
  await expect(page.getByTestId("window-count")).toHaveText("100 returned · 5,550 matching · offset 0");
  await page.getByRole("combobox", { name: "Value order" }).selectOption("desc");
  await expect(page).toHaveURL(/sort=desc/);
  await expect(grid.locator('[role="row"][aria-rowindex="2"]')).toBeVisible();
  await page.screenshot({ path: ".artifacts/windowed-queries.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("textbox", { name: "Search accounts" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/windowed-queries-mobile.png", fullPage: true });
  await page.getByRole("textbox", { name: "Search accounts" }).fill("no-such-account");
  await expect(page.getByTestId("window-count")).toHaveText("0 returned · 0 matching · offset 0");
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
});
