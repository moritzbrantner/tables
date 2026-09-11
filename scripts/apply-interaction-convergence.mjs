import { readFile, writeFile } from "node:fs/promises";

const path = "src/react.tsx";
let source = await readFile(path, "utf8");

const repairs = [
  [
    "export type DataTableProps<TRow>export type DataTableProps<TRow> =",
    "export type DataTableProps<TRow> =",
    "DataTableProps",
  ],
  [
    "type ColumnEntry<TRow>type ColumnEntry<TRow> =",
    "type ColumnEntry<TRow> =",
    "ColumnEntry",
  ],
  [
    "function useElementSize(function useElementSize(",
    "function useElementSize(",
    "useElementSize",
  ],
  [
    "function resolveColumnWidth<TRow>(function resolveColumnWidth<TRow>(",
    "function resolveColumnWidth<TRow>(",
    "resolveColumnWidth",
  ],
];

for (const [before, after, label] of repairs) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Expected exactly one duplicated ${label} extraction boundary`);
  }
  source = `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

await writeFile(path, source);
