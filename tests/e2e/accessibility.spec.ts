import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const acceptancePages = [
  { name: "overview", path: "/" },
  { name: "server workflow", path: "/server.html" },
  { name: "localized themes", path: "/localization.html" },
] as const;

for (const acceptancePage of acceptancePages) {
  test(`${acceptancePage.name} has no serious automated accessibility violations`, async ({ page }) => {
    await page.goto(acceptancePage.path);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      result.violations,
      result.violations
        .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`)
        .join("\n"),
    ).toEqual([]);
  });
}
