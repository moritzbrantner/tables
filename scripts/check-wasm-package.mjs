import { existsSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "dist/wasm/tables_wasm.js",
  "dist/wasm/tables_wasm_bg.wasm",
  "dist/wasm.js",
  "dist/wasm.d.ts",
];

const missing = required.filter((path) => !existsSync(resolve(path)));
if (missing.length > 0) {
  throw new Error(`tables package is missing Wasm artifacts: ${missing.join(", ")}`);
}
