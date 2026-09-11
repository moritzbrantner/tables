import { readFile, writeFile } from "node:fs/promises";

const path = "src/react.tsx";
let source = await readFile(path, "utf8");
const before = "export type RowKey<TRow>export type RowKey<TRow> =";
const after = "export type RowKey<TRow> =";
const index = source.indexOf(before);

if (index < 0 || source.indexOf(before, index + before.length) >= 0) {
  throw new Error("Expected exactly one duplicated RowKey extraction boundary");
}

source = `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
await writeFile(path, source);
