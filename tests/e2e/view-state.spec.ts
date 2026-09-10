import { expect, test } from "@playwright/test";

test("persists durable pipeline view state through the URL", async ({ page }) => {
  await page.goto("/");

  const search = page.getByLabel("Search pipeline");
  await search.fill("north");
  await page.getByRole("button", { name: "Sort ID ascending" }).click();

  await expect.poll(() => new URL(page.url()).searchParams.get("table")).not.toBeNull();
  const persistedUrl = page.url();
  expect(new URL(persistedUrl).searchParams.get("table")).toContain('"version":1');

  await page.reload();

  await expect(page.getByLabel("Search pipeline")).toHaveValue("north");
  await expect(page.getByRole("button", { name: "Sort ID descending" })).toBeVisible();
});
