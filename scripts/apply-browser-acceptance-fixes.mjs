import { readFile, writeFile } from "node:fs/promises";

async function patch(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [before, after, label] of replacements) {
    const index = source.indexOf(before);
    if (index < 0 || source.indexOf(before, index + before.length) >= 0) {
      throw new Error(`${path}: expected exactly one ${label} target`);
    }
    source = `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
  }
  await writeFile(path, source);
}

await patch("src/react.tsx", [
  [
    "    <section\n      aria-label={resolvedAriaLabel}\n      className=",
    "    <section\n      className=",
    "outer section aria label",
  ],
  [
    "      <div\n        ref={scrollRef}\n        className=\"mb-table__scroll\"",
    "      <div\n        aria-label={resolvedAriaLabel}\n        ref={scrollRef}\n        className=\"mb-table__scroll\"",
    "grid aria label",
  ],
]);

await patch("examples/src/styles.css", [
  [
    ".localization-preview--narrow {\n  max-width: 420px;\n}",
    ".localization-preview--narrow {\n  justify-self: start;\n  max-width: 420px;\n  width: min(420px, 100%);\n}",
    "narrow preview width",
  ],
]);

await patch("tests/e2e/localization-theme.spec.ts", [
  [
    "  const preview = page.getByTestId(\"localization-preview\");\n  const box = await preview.boundingBox();",
    "  const preview = page.getByTestId(\"localization-preview\");\n  await expect(preview).toHaveClass(/localization-preview--narrow/);\n  const box = await preview.boundingBox();",
    "narrow preview assertion",
  ],
]);

await patch("src/react.messages.test.tsx", [
  [
    "expect(screen.getByRole(\"region\", { name: \"Datentabelle\" })).toBeTruthy();",
    "expect(screen.getByRole(\"grid\", { name: \"Datentabelle\" })).toBeTruthy();",
    "localized grid role assertion",
  ],
]);
