import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL("./", import.meta.url));
const examplesDir = path.resolve(rootDir, "examples");

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  build: {
    rolldownOptions: {
      input: {
        dense: path.resolve(examplesDir, "dense.html"),
        index: path.resolve(examplesDir, "index.html"),
        states: path.resolve(examplesDir, "states.html"),
        wide: path.resolve(examplesDir, "wide.html"),
      },
    },
  },
  plugins: [react(), tailwindcss()],
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
        find: /^@moritzbrantner\/tables\/virtualization$/,
        replacement: path.resolve(rootDir, "src/virtualization.ts"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
