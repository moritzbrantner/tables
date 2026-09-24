import { expect, test } from "@playwright/test";

test("windowed queries keep URL state, global row positions and full counts", async ({ page }) => {
  await page.goto("/windowed.html?offset=100&sort=asc&query=");
  await expect(page.getByTestId("query-backend")).toHaveText("Rust/Wasm · prepared query session");
  const grid = page.getByRole("grid", { name: "Windowed account results" });
  await expect(page.getByTestId("window-count")).toHaveText("100 returned · 100,000 matching · offset 100");
  await expect(grid.locator('[role="row"][aria-rowindex="102"]')).toBeVisible();
  const queryStatus = page.getByTestId("query-backend");
  const revision = await queryStatus.getAttribute("data-query-revision");
  const reads = Number(await queryStatus.getAttribute("data-page-reads"));
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(queryStatus).toHaveAttribute("data-query-revision", revision!);
  await expect(queryStatus).toHaveAttribute("data-page-reads", String(reads + 1));
  await expect(page).toHaveURL(/offset=200/);
  await expect(grid.locator('[role="row"][aria-rowindex="202"]')).toBeVisible();
  await page.reload();
  await expect(queryStatus).toHaveText("Rust/Wasm · prepared query session");
  await expect(page.getByTestId("window-count")).toContainText("offset 200");
  await page.getByRole("textbox", { name: "Search accounts" }).fill("Account 17");
  await expect(page).toHaveURL(/offset=0/);
  await expect(page.getByTestId("window-count")).toHaveText("100 returned · 5,550 matching · offset 0");
  await page.getByRole("combobox", { name: "Value order" }).selectOption("desc");
  await expect(page).toHaveURL(/sort=desc/);
  await expect(grid.locator('[role="row"][aria-rowindex="2"]')).toBeVisible();
  const queryRevision = await queryStatus.getAttribute("data-query-revision");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(queryStatus).toHaveAttribute("data-query-revision", queryRevision!);
  await page.screenshot({ path: ".artifacts/windowed-queries.png", fullPage: true });
  await page.getByRole("combobox", { name: "Query lifetime" }).selectOption("window");
  await expect(page).toHaveURL(/mode=window/);
  await expect(queryStatus).toContainText("bounded one-off query");
  await expect(page.getByTestId("window-count")).toHaveText("100 returned · 5,550 matching · offset 100");
  const oneOffRevision = Number(await queryStatus.getAttribute("data-query-revision"));
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(queryStatus).toHaveAttribute("data-query-revision", String(oneOffRevision + 1));
  await page.getByRole("combobox", { name: "Query lifetime" }).selectOption("session");
  await expect(page).toHaveURL(/mode=session/);
  await page.reload();
  await expect(queryStatus).toHaveText("Rust/Wasm · prepared query session");
  await expect(page.getByTestId("window-count")).toHaveText("100 returned · 5,550 matching · offset 200");
  await page.getByRole("button", { name: "Next page" }).click();
  const backRevision = await queryStatus.getAttribute("data-query-revision");
  await page.goBack();
  await expect(page.getByTestId("window-count")).toContainText("offset 200");
  await expect(queryStatus).toHaveAttribute("data-query-revision", backRevision!);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("textbox", { name: "Search accounts" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/windowed-queries-mobile.png", fullPage: true });
  await page.getByRole("textbox", { name: "Search accounts" }).fill("no-such-account");
  await expect(page.getByTestId("window-count")).toHaveText("0 returned · 0 matching · offset 0");
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
});


test("backend activation preserves navigation performed while Wasm is loading", async ({ page }) => {
  let releaseWasm!: () => void;
  const gate = new Promise<void>((resolve) => { releaseWasm = resolve; });
  await page.route("**/*.wasm", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/windowed.html?offset=100&sort=asc&query=");
    const status = page.getByTestId("query-backend");
    await expect(status).toHaveText("Loading query engine · prepared query session");
    await expect(page.getByTestId("window-count")).toHaveText("100 returned · 100,000 matching · offset 100");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByTestId("window-count")).toHaveText("100 returned · 100,000 matching · offset 200");
    releaseWasm();
    await expect(status).toHaveText("Rust/Wasm · prepared query session");
    await expect(page.getByTestId("window-count")).toHaveText("100 returned · 100,000 matching · offset 200");
    const revision = await status.getAttribute("data-query-revision");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByTestId("window-count")).toHaveText("100 returned · 100,000 matching · offset 300");
    await expect(status).toHaveAttribute("data-query-revision", revision!);
  } finally {
    releaseWasm();
    await page.unrouteAll({ behavior: "wait" });
  }
});
