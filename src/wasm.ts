import { setTableQueryKernel } from "./query-kernel";
import {
  createVariableVirtualLayout,
  getFixedVirtualRange,
  type FixedVirtualRangeOptions,
  type VariableVirtualRangeOptions,
  type VirtualRange,
} from "./virtualization";
import {
  createTableWasmKernelFromModule,
  type TableWasmKernel,
  type TableWasmVariableLayout,
} from "./wasm-internal";

export type { TableWasmKernel, TableWasmVariableLayout } from "./wasm-internal";

export type TableVirtualizationBackend = "typescript" | "wasm";

export type TableVariableLayout = {
  readonly backend: TableVirtualizationBackend;
  readonly length: number;
  readonly totalSize: number;
  dispose(): void;
  virtualRange(options: Omit<VariableVirtualRangeOptions, "itemSizes">): VirtualRange;
};

let loadedKernel: TableWasmKernel | null = null;
let loadingKernel: Promise<TableWasmKernel | null> | null = null;

export function getLoadedTableWasmKernel(): TableWasmKernel | null {
  return loadedKernel;
}

export async function loadTableWasmKernel(): Promise<TableWasmKernel | null> {
  if (loadedKernel) {
    return loadedKernel;
  }

  if (loadingKernel) {
    return loadingKernel;
  }

  loadingKernel = loadGeneratedModule()
    .then((module) => {
      loadedKernel = createTableWasmKernelFromModule(module);
      setTableQueryKernel(loadedKernel);
      return loadedKernel;
    })
    .catch(() => null);

  try {
    return await loadingKernel;
  } finally {
    loadingKernel = null;
  }
}

export function getFixedVirtualRangeWithBackend(options: FixedVirtualRangeOptions): VirtualRange {
  return loadedKernel?.fixedVirtualRange(options) ?? getFixedVirtualRange(options);
}

export function createTableVariableLayout(itemSizes: readonly number[]): TableVariableLayout {
  if (loadedKernel) {
    return loadedKernel.createVariableLayout(itemSizes);
  }

  return createTypeScriptVariableLayout(itemSizes);
}

function createTypeScriptVariableLayout(itemSizes: readonly number[]): TableVariableLayout {
  const layout = createVariableVirtualLayout(itemSizes);

  return {
    backend: "typescript",
    length: layout.length,
    totalSize: layout.totalSize,
    dispose() {},
    virtualRange(options) {
      return layout.virtualRange(options);
    },
  };
}

async function loadGeneratedModule(): Promise<unknown> {
  const candidates = [
    new URL("./wasm/tables_wasm.js", import.meta.url).href,
    new URL("./wasm/generated/tables_wasm.js", import.meta.url).href,
  ];
  let lastError: unknown;

  for (const moduleUrl of candidates) {
    try {
      const module = await import(/* @vite-ignore */ moduleUrl);
      if (typeof module.default === "function") {
        await module.default();
      }
      return module;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("tables Wasm module could not be loaded");
}
