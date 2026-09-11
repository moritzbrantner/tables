import { readFile, writeFile } from "node:fs/promises";

const path = "src/react.tsx";
let source = await readFile(path, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing patch target: ${label}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous patch target: ${label}`);
  }
  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

replaceOnce(
  "  rowHeight?: number;\n  rowKey: RowKey<TRow>;",
  "  rowHeight?: number;\n  /** Zero-based position of the first supplied row within a manual/server result. */\n  rowIndexOffset?: number;\n  rowKey: RowKey<TRow>;",
  "VirtualTable rowIndexOffset prop",
);
replaceOnce(
  "  rowHeight = defaultRowHeight,\n  rowKey,",
  "  rowHeight = defaultRowHeight,\n  rowIndexOffset = 0,\n  rowKey,",
  "VirtualTable rowIndexOffset default",
);
replaceOnce(
  "  const selectedRowKeys = activeState.selection.selectedRowKeys;",
  "  const resolvedRowIndexOffset =\n    mode === \"manual\" && Number.isFinite(rowIndexOffset)\n      ? Math.max(0, Math.trunc(rowIndexOffset))\n      : 0;\n  const selectedRowKeys = activeState.selection.selectedRowKeys;",
  "manual row index offset normalization",
);
replaceOnce(
  "                    aria-rowindex={rowIndex + 2}",
  "                    aria-rowindex={resolvedRowIndexOffset + rowIndex + 2}",
  "server aria row position",
);
replaceOnce(
  "                        {rowIndex + 1}",
  "                        {resolvedRowIndexOffset + rowIndex + 1}",
  "server displayed row position",
);

await writeFile(path, source);
