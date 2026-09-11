import { expect, test } from "@playwright/test";

test("localizes table-owned copy and preserves narrow themed tables", async ({ page }) => {
  await page.goto("/localization.html");

  await expect(page.getByRole("region", { name: "Data table" })).toBeVisible();

  await page.getByLabel("Language").selectOption("de");
  await expect(page.getByRole("region", { name: "Datentabelle" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tabellenoptionen öffnen" })).toBeVisible();

  await page.getByLabel("Language").selectOption("es");
  await expect(page.getByRole("region", { name: "Tabla de datos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir opciones de tabla" })).toBeVisible();

  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-demo-theme", "dark");

  const table = page.locator(".mb-table");
  const semanticTheme = await table.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.getPropertyValue("--mb-table-row-bg").trim(),
      focus: style.getPropertyValue("--mb-table-focus").trim(),
      text: style.getPropertyValue("--mb-table-text").trim(),
    };
  });
  expect(semanticTheme.background).not.toBe("");
  expect(semanticTheme.focus).not.toBe("");
  expect(semanticTheme.text).not.toBe("");

  await page.getByRole("button", { name: "Use narrow width" }).click();
  const preview = page.getByTestId("localization-preview");
  const box = await preview.boundingBox();
  expect(box?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(421);

  const scroll = page.locator(".mb-table__scroll");
  const overflow = await scroll.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(true);
});
