import { describe, expect, it } from "vitest";

import { getFixedVirtualRange, getOffsets, getVariableVirtualRange } from "./virtualization";

describe("getFixedVirtualRange", () => {
  it("returns a padded range for a scrolled viewport", () => {
    expect(
      getFixedVirtualRange({
        count: 1000,
        itemSize: 20,
        overscan: 2,
        scrollOffset: 100,
        viewportSize: 60,
      }),
    ).toEqual({
      endIndex: 10,
      offsetAfter: 19800,
      offsetBefore: 60,
      startIndex: 3,
      totalSize: 20000,
      visibleCount: 7,
    });
  });

  it("returns an empty range for invalid dimensions", () => {
    expect(
      getFixedVirtualRange({
        count: 10,
        itemSize: 0,
        scrollOffset: 0,
        viewportSize: 100,
      }),
    ).toMatchObject({
      endIndex: 0,
      startIndex: 0,
      visibleCount: 0,
    });
  });
});

describe("getVariableVirtualRange", () => {
  it("uses item offsets for variable-width virtualization", () => {
    expect(getOffsets([40, 60, 100])).toEqual([0, 40, 100, 200]);
    expect(
      getVariableVirtualRange({
        itemSizes: [40, 60, 100, 80],
        overscan: 1,
        scrollOffset: 70,
        viewportSize: 120,
      }),
    ).toEqual({
      endIndex: 4,
      offsetAfter: 0,
      offsetBefore: 0,
      startIndex: 0,
      totalSize: 280,
      visibleCount: 4,
    });
  });
});
