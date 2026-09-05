import type {
  FixedVirtualRangeOptions,
  VariableVirtualRangeOptions,
  VirtualRange,
} from "./virtualization";

export type TableWasmVariableLayout = {
  readonly backend: "wasm";
  readonly length: number;
  readonly totalSize: number;
  dispose(): void;
  virtualRange(options: Omit<VariableVirtualRangeOptions, "itemSizes">): VirtualRange;
};

export type TableWasmKernel = {
  createVariableLayout(itemSizes: readonly number[]): TableWasmVariableLayout;
  fixedVirtualRange(options: FixedVirtualRangeOptions): VirtualRange;
};

type GeneratedVariableLayout = {
  readonly length: number;
  readonly totalSize: number;
  free(): void;
  virtualRange(overscan: number, scrollOffset: number, viewportSize: number): Float64Array;
};

type GeneratedTablesWasmModule = {
  VariableLayout: new (itemSizes: Float64Array) => GeneratedVariableLayout;
  fixedVirtualRange(
    count: number,
    itemSize: number,
    overscan: number,
    scrollOffset: number,
    viewportSize: number,
  ): Float64Array;
};

export function createTableWasmKernelFromModule(value: unknown): TableWasmKernel {
  const module = normalizeGeneratedModule(value);

  return {
    createVariableLayout(itemSizes) {
      const layout = new module.VariableLayout(Float64Array.from(itemSizes));
      let disposed = false;

      return {
        backend: "wasm",
        get length() {
          return disposed ? 0 : layout.length;
        },
        get totalSize() {
          return disposed ? 0 : layout.totalSize;
        },
        dispose() {
          if (!disposed) {
            layout.free();
            disposed = true;
          }
        },
        virtualRange({ overscan = 1, scrollOffset, viewportSize }) {
          if (disposed) {
            throw new Error("tables Wasm variable layout has been disposed");
          }

          return decodeVirtualRange(
            layout.virtualRange(normalizeWasmUnsigned(overscan), scrollOffset, viewportSize),
          );
        },
      };
    },
    fixedVirtualRange({ count, itemSize, overscan = 2, scrollOffset, viewportSize }) {
      return decodeVirtualRange(
        module.fixedVirtualRange(
          normalizeWasmUnsigned(count),
          itemSize,
          normalizeWasmUnsigned(overscan),
          scrollOffset,
          viewportSize,
        ),
      );
    },
  };
}

function normalizeGeneratedModule(value: unknown): GeneratedTablesWasmModule {
  const direct = readGeneratedModule(value);
  if (direct) {
    return direct;
  }

  if (isRecord(value)) {
    const nested = readGeneratedModule(value.default);
    if (nested) {
      return nested;
    }
  }

  throw new TypeError("tables Wasm module does not expose the expected virtualization adapter");
}

function readGeneratedModule(value: unknown): GeneratedTablesWasmModule | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.fixedVirtualRange !== "function" || typeof value.VariableLayout !== "function") {
    return null;
  }

  return value as GeneratedTablesWasmModule;
}

function decodeVirtualRange(values: ArrayLike<number>): VirtualRange {
  if (values.length !== 6) {
    throw new TypeError(`tables Wasm virtual range must contain 6 fields, received ${values.length}`);
  }

  const startIndex = readIndex(values[0], "startIndex");
  const endIndex = readIndex(values[1], "endIndex");
  const offsetBefore = readFiniteNumber(values[2], "offsetBefore");
  const offsetAfter = readFiniteNumber(values[3], "offsetAfter");
  const totalSize = readFiniteNumber(values[4], "totalSize");
  const visibleCount = readIndex(values[5], "visibleCount");

  return {
    endIndex,
    offsetAfter,
    offsetBefore,
    startIndex,
    totalSize,
    visibleCount,
  };
}

function readIndex(value: number | undefined, field: string): number {
  const number = readFiniteNumber(value, field);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`tables Wasm field ${field} must be a non-negative safe integer`);
  }
  return number;
}

function readFiniteNumber(value: number | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`tables Wasm field ${field} must be finite`);
  }
  return value;
}

function normalizeWasmUnsigned(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(0xffff_ffff, Math.floor(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
