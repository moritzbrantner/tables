import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = path.resolve(root, "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
for (const [name, version] of Object.entries(manifest.dependencies)) {
  const installed = JSON.parse(readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")).version;
  if (installed !== version) throw new Error(`Reference ${name} is ${installed}, expected ${version}`);
}
const output = path.join(repo, "dist-browser-references");
export default defineConfig({
  root,
  base: "/tables/references/",
  define: { tableReferenceVersions: JSON.stringify(manifest.dependencies) },
  build: { outDir: output, emptyOutDir: true },
  plugins: [react(), {
    name: "reference-wasm-siblings",
    closeBundle() {
      const target = path.join(output, "assets/wasm");
      mkdirSync(target, { recursive: true });
      for (const name of ["tables_wasm.js", "tables_wasm_bg.wasm"]) {
        copyFileSync(path.join(repo, "src/wasm/generated", name), path.join(target, name));
      }
    },
  }],
  resolve: { dedupe: ["react", "react-dom"] },
});
