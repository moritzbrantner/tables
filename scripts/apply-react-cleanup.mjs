import { readFile, writeFile } from "node:fs/promises";

const path = "src/react.tsx";
let source = await readFile(path, "utf8");
const before = "  type TableColumnMenuTrigger,\n";
const index = source.indexOf(before);

if (index < 0 || source.indexOf(before, index + before.length) >= 0) {
  throw new Error("Expected exactly one unused TableColumnMenuTrigger import");
}

source = `${source.slice(0, index)}${source.slice(index + before.length)}`;
await writeFile(path, source);
