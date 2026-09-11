import { expect, test } from "@playwright/test";

test("keeps server query ownership outside the table", async ({ page }) => {
  await page.goto("/server.html");

  const grid = page.getByRole("grid", { name: "Server-driven pipeline table" });
  await expect(page.getByTestId("server-workflow")).toBeVisible();
  await expect(grid).toHaveAttribute("aria-rowcount", "241");

  const initialKey = await page.getByTestId("server-query-key").textContent();
  await page.getByLabel("Search server rows").fill("north");
  await expect(page.getByTestId("server-query-key")).not.toHaveText(initialKey ?? "");

  await page.getByRole("button", { name: "Simulate refresh" }).click();
  await expect(page.getByRole("status")).toContainText("current rows remain visible");
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  await page.getByRole("button", { name: "Finish refresh" }).click();

  await page.getByRole("button", { name: "Next window" }).click();
  await expect(page.getByTestId("server-window-status")).toContainText("Showing rows 21");
  await expect(grid.getByRole("row").nth(1)).toHaveAttribute("aria-rowindex", "22");
  await expect(grid.getByRole("rowheader", { name: "21" })).toBeVisible();
});
