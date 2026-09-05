import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const sourceDir = resolve("src/wasm/generated");
const targetDir = resolve("dist/wasm");

if (!existsSync(sourceDir)) {
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });
for (const file of ["tables_wasm.js", "tables_wasm_bg.wasm"]) {
  const source = resolve(sourceDir, file);
  if (existsSync(source)) {
    cpSync(source, resolve(targetDir, file));
  }
}
