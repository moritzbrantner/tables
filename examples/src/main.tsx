import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./playground/app";
import { attachTablesExampleShortcuts } from "./playground/input-bindings";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

const detachInputBindings = attachTablesExampleShortcuts({
  focusSearch() {
    document.querySelector<HTMLInputElement>('input[aria-label="Search pipeline"]')?.focus();
  },
  navigateOverview() {
    window.location.assign("./");
  },
});
window.addEventListener("pagehide", detachInputBindings, { once: true });

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
