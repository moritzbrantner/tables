import { expect, test } from "@playwright/test";

test("keeps server query ownership outside the table", async ({ page }) => {
  await page.goto("/server.html");

  await expect(page.getByTestId("server-workflow")).toBeVisible();
  await expect(page.getByRole("grid", { name: "Server-driven pipeline table" })).toHaveAttribute(
    "aria-rowcount",
    "241",
  );

  const initialKey = await page.getByTestId("server-query-key").textContent();
  await page.getByLabel("Search server rows").fill("north");
  await expect(page.getByTestId("server-query-key")).not.toHaveText(initialKey ?? "");

  await page.getByRole("button", { name: "Simulate refresh" }).click();
  await expect(page.getByRole("status")).toContainText("current rows remain visible");
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  await page.getByRole("button", { name: "Finish refresh" }).click();

  await page.getByRole("button", { name: "Next window" }).click();
  await expect(page.getByTestId("server-window-status")).toContainText("Showing rows 21");
});
