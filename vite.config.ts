import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const rootDir = fileURLToPath(new URL("./", import.meta.url));
const examplesDir = path.resolve(rootDir, "examples");

// The library loads an ES module whose own relative URL loads the Wasm binary.
// Copy both together: treating only the JS loader as a hashed Vite asset breaks
// its sibling lookup. The first library candidate is relative to assets/*.js.
function browserWasmAssets(): Plugin {
  let outDir = "";
  return {
    name: "tables-browser-wasm-assets",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const target = path.join(outDir, "assets/wasm");
      mkdirSync(target, { recursive: true });
      for (const name of ["tables_wasm.js", "tables_wasm_bg.wasm"]) {
        const source = path.join(rootDir, "src/wasm/generated", name);
        if (!existsSync(source)) {
          throw new Error("Build the browser query kernel with bun run build:wasm before building examples.");
        }
        copyFileSync(source, path.join(target, name));
      }
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  build: {
    rolldownOptions: {
      input: {
        benchmarks: path.resolve(examplesDir, "benchmarks.html"),
        dense: path.resolve(examplesDir, "dense.html"),
        index: path.resolve(examplesDir, "index.html"),
        localization: path.resolve(examplesDir, "localization.html"),
        server: path.resolve(examplesDir, "server.html"),
        states: path.resolve(examplesDir, "states.html"),
        variations: path.resolve(examplesDir, "variations.html"),
        wide: path.resolve(examplesDir, "wide.html"),
      },
    },
  },
  plugins: [react(), tailwindcss(), browserWasmAssets()],
  root: examplesDir,
  resolve: {
    alias: [
      {
        find: /^@moritzbrantner\/tables$/,
        replacement: path.resolve(rootDir, "src/index.ts"),
      },
      {
        find: /^@moritzbrantner\/tables\/react$/,
        replacement: path.resolve(rootDir, "src/react.tsx"),
      },
      {
        find: /^@moritzbrantner\/tables\/data$/,
        replacement: path.resolve(rootDir, "src/data.ts"),
      },
      {
        find: /^@moritzbrantner\/tables\/server$/,
        replacement: path.resolve(rootDir, "src/server.ts"),
      },
      {
        find: /^@moritzbrantner\/tables\/view-state$/,
        replacement: path.resolve(rootDir, "src/view-state.ts"),
      },
      {
        find: /^@moritzbrantner\/tables\/virtualization$/,
        replacement: path.resolve(rootDir, "src/virtualization.ts"),
      },
      {
        find: /^@moritzbrantner\/tables\/wasm$/,
        replacement: path.resolve(rootDir, "src/wasm.ts"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
