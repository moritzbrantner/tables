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
    for (const itemSize of [0, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(
        getFixedVirtualRange({
          count: 10,
          itemSize,
          scrollOffset: 0,
          viewportSize: 100,
        }),
      ).toMatchObject({ endIndex: 0, startIndex: 0, visibleCount: 0 });
    }

    expect(
      getFixedVirtualRange({
        count: 10,
        itemSize: 20,
        scrollOffset: 0,
        viewportSize: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({ endIndex: 0, startIndex: 0, visibleCount: 0 });
  });

  it("normalizes non-finite scroll offsets like the Rust core", () => {
    const base = {
      count: 10,
      itemSize: 20,
      overscan: 0,
      viewportSize: 40,
    };

    expect(getFixedVirtualRange({ ...base, scrollOffset: Number.NaN })).toEqual(
      getFixedVirtualRange({ ...base, scrollOffset: 0 }),
    );
    expect(getFixedVirtualRange({ ...base, scrollOffset: Number.POSITIVE_INFINITY })).toEqual(
      getFixedVirtualRange({ ...base, scrollOffset: 200 }),
    );
  });

  it("preserves range and spacer invariants across boundary offsets", () => {
    for (const count of [1, 2, 5, 9]) {
      for (const itemSize of [1, 3, 7]) {
        const totalSize = count * itemSize;
        for (const viewportSize of [1, 2, 5, 11]) {
          for (const overscan of [0, 1, 3]) {
            for (const scrollOffset of [-5, 0, 1, totalSize - 1, totalSize, totalSize + 5]) {
              const range = getFixedVirtualRange({
                count,
                itemSize,
                overscan,
                scrollOffset,
                viewportSize,
              });

              expect(range.startIndex).toBeGreaterThanOrEqual(0);
              expect(range.endIndex).toBeGreaterThanOrEqual(range.startIndex);
              expect(range.endIndex).toBeLessThanOrEqual(count);
              expect(range.visibleCount).toBe(range.endIndex - range.startIndex);
              expect(range.offsetBefore).toBe(range.startIndex * itemSize);
              expect(range.offsetAfter).toBe((count - range.endIndex) * itemSize);
              expect(range.totalSize).toBe(totalSize);
            }
          }
        }
      }
    }
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

  it("clamps scroll offsets before the start and beyond the end", () => {
    expect(
      getVariableVirtualRange({
        itemSizes: [40, 60, 100],
        overscan: 0,
        scrollOffset: -25,
        viewportSize: 20,
      }),
    ).toEqual({
      endIndex: 1,
      offsetAfter: 160,
      offsetBefore: 0,
      startIndex: 0,
      totalSize: 200,
      visibleCount: 1,
    });

    expect(
      getVariableVirtualRange({
        itemSizes: [40, 60, 100],
        overscan: 0,
        scrollOffset: 999,
        viewportSize: 20,
      }),
    ).toEqual({
      endIndex: 3,
      offsetAfter: 0,
      offsetBefore: 100,
      startIndex: 2,
      totalSize: 200,
      visibleCount: 1,
    });
  });

  it("normalizes malformed item sizes to zero-width entries", () => {
    expect(getOffsets([40, -10, Number.NaN, Number.POSITIVE_INFINITY, 20])).toEqual([
      0,
      40,
      40,
      40,
      40,
      60,
    ]);
  });

  it("returns an empty range for a non-finite viewport", () => {
    expect(
      getVariableVirtualRange({
        itemSizes: [40, 60, 100],
        scrollOffset: 0,
        viewportSize: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      endIndex: 0,
      offsetAfter: 0,
      offsetBefore: 0,
      startIndex: 0,
      totalSize: 0,
      visibleCount: 0,
    });
  });

  it("preserves range and spacer invariants for varied item sizes", () => {
    for (const itemSizes of [[1, 2, 3, 4], [8, 1, 5, 2], [3, 3, 3, 3], [1, 10, 1, 10]]) {
      const offsets = getOffsets(itemSizes);
      const totalSize = offsets.at(-1) ?? 0;
      for (const overscan of [0, 1, 2]) {
        for (const viewportSize of [1, 3, 7]) {
          for (const scrollOffset of [-3, 0, 1, totalSize - 1, totalSize, totalSize + 3]) {
            const range = getVariableVirtualRange({ itemSizes, overscan, scrollOffset, viewportSize });
            expect(range.startIndex).toBeGreaterThanOrEqual(0);
            expect(range.endIndex).toBeGreaterThanOrEqual(range.startIndex);
            expect(range.endIndex).toBeLessThanOrEqual(itemSizes.length);
            expect(range.visibleCount).toBe(range.endIndex - range.startIndex);
            expect(range.offsetBefore).toBe(offsets[range.startIndex]);
            expect(range.offsetAfter).toBe(totalSize - offsets[range.endIndex]);
            expect(range.totalSize).toBe(totalSize);
          }
        }
      }
    }
  });
});
