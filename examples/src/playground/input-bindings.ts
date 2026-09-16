export const INPUT_BINDINGS_BUNDLE_URL =
  "https://moritzbrantner.github.io/input-bindings/input-bindings-browser.js";

export type TablesExampleShortcutActions = {
  focusSearch: () => void;
  navigateOverview: () => void;
};

const CONTEXT_ID = "tablesExample";

export const TABLES_EXAMPLE_SHORTCUT_REGISTRY = Object.freeze({
  actions: [
    {
      id: "tables.focusSearch",
      title: "Focus table search",
      categoryPath: ["Tables example", "Navigation"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: "tables.examples.focusSearch.default",
          action: "tables.focusSearch",
          sequence: [{ key: { kind: "logical", value: "/" }, modifiers: {} }],
          when: { op: "context", id: CONTEXT_ID },
          priority: 0,
        },
      ],
      provenance: { source: "tables/examples", version: "1" },
    },
    {
      id: "tables.navigateOverview",
      title: "Go to pipeline overview",
      categoryPath: ["Tables example", "Navigation"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: "tables.examples.navigateOverview.default",
          action: "tables.navigateOverview",
          sequence: [
            { key: { kind: "logical", value: "g" }, modifiers: {} },
            { key: { kind: "logical", value: "p" }, modifiers: {} },
          ],
          when: { op: "context", id: CONTEXT_ID },
          priority: 0,
        },
      ],
      provenance: { source: "tables/examples", version: "1" },
    },
  ],
});

export function attachTablesExampleShortcuts(actions: TablesExampleShortcutActions): () => void {
  let disposed = false;
  let detachRuntime = () => {};

  void import(/* @vite-ignore */ INPUT_BINDINGS_BUNDLE_URL).then(
    ({ InputRuntimeController, attachKeyboardRuntime }) => {
      if (disposed) return;

      const controller = new InputRuntimeController({
        registry: TABLES_EXAMPLE_SHORTCUT_REGISTRY,
        getActiveContexts: () => new Set([CONTEXT_ID]),
        chordTimeoutMs: 900,
        consumePolicy: "matched",
        onDispatch: (dispatch: { action: string; phase: string }) => {
          if (dispatch.phase !== "press") return;
          if (dispatch.action === "tables.focusSearch") actions.focusSearch();
          if (dispatch.action === "tables.navigateOverview") actions.navigateOverview();
        },
      });

      detachRuntime = attachKeyboardRuntime(controller, {
        keyTarget: document,
        focusTarget: window,
        visibilityTarget: document,
        ignoreTextEntry: true,
        mode: "logical",
      });
    },
    (error) => {
      console.error("Failed to load shared input-bindings runtime", error);
    },
  );

  return () => {
    disposed = true;
    detachRuntime();
  };
}
