import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

import { getFixedVirtualRange, getVariableVirtualRange } from "./virtualization";
import {
  createTableWasmKernelFromModule,
  type TableWasmKernel,
} from "./wasm-internal";

const enabled = process.env.TABLES_WASM_PARITY === "1";

describe.runIf(enabled)("tables Wasm parity", () => {
  let kernel: TableWasmKernel;

  beforeAll(async () => {
    const moduleUrl = pathToFileURL(resolve(".artifacts/tables-wasm-node/tables_wasm.js")).href;
    kernel = createTableWasmKernelFromModule(await import(moduleUrl));
  });

  test("matches TypeScript fixed-range semantics across deterministic cases", () => {
    const cases = [
      { count: 1000, itemSize: 20, overscan: 2, scrollOffset: 100, viewportSize: 60 },
      { count: 1, itemSize: 1, overscan: 0, scrollOffset: -5, viewportSize: 1 },
      { count: 50, itemSize: 7, overscan: 4, scrollOffset: 349, viewportSize: 29 },
      { count: 50, itemSize: 7, overscan: 4, scrollOffset: Number.NaN, viewportSize: 29 },
      { count: 50, itemSize: 7, overscan: 4, scrollOffset: Number.POSITIVE_INFINITY, viewportSize: 29 },
      { count: 10, itemSize: Number.POSITIVE_INFINITY, scrollOffset: 0, viewportSize: 20 },
      { count: 10, itemSize: 20, scrollOffset: 0, viewportSize: Number.POSITIVE_INFINITY },
    ];

    for (const options of cases) {
      expect(kernel.fixedVirtualRange(options)).toEqual(getFixedVirtualRange(options));
    }
  });

  test("matches TypeScript variable-range semantics while reusing one Rust layout", () => {
    const itemSizes = [40, -10, Number.NaN, Number.POSITIVE_INFINITY, 60, 100, 80];
    const layout = kernel.createVariableLayout(itemSizes);

    expect(layout.backend).toBe("wasm");
    expect(layout.length).toBe(itemSizes.length);
    expect(layout.totalSize).toBe(280);

    for (const options of [
      { overscan: 0, scrollOffset: -20, viewportSize: 20 },
      { overscan: 1, scrollOffset: 70, viewportSize: 120 },
      { overscan: 3, scrollOffset: 200, viewportSize: 80 },
      { overscan: 1, scrollOffset: Number.NaN, viewportSize: 25 },
      { overscan: 1, scrollOffset: Number.POSITIVE_INFINITY, viewportSize: 25 },
      { overscan: 1, scrollOffset: 0, viewportSize: Number.POSITIVE_INFINITY },
    ]) {
      expect(layout.virtualRange(options)).toEqual(
        getVariableVirtualRange({ ...options, itemSizes }),
      );
    }

    layout.dispose();
    expect(() => layout.virtualRange({ scrollOffset: 0, viewportSize: 20 })).toThrow(
      "disposed",
    );
  });

  test("matches generated table geometries without object serialization", () => {
    let seed = 0x5eed1234;

    for (let scenario = 0; scenario < 40; scenario += 1) {
      const itemSizes = Array.from({ length: 128 + scenario }, (_, index) => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return index % 17 === 0 ? 0 : 1 + (seed % 73);
      });
      const layout = kernel.createVariableLayout(itemSizes);

      for (let query = 0; query < 20; query += 1) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const options = {
          overscan: query % 5,
          scrollOffset: seed % Math.max(1, Math.ceil(layout.totalSize + 200)),
          viewportSize: 1 + ((seed >>> 8) % 500),
        };

        expect(layout.virtualRange(options)).toEqual(
          getVariableVirtualRange({ ...options, itemSizes }),
        );
      }

      layout.dispose();
    }
  });
});
