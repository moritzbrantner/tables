export type VirtualRange = {
  endIndex: number;
  offsetAfter: number;
  offsetBefore: number;
  startIndex: number;
  totalSize: number;
  visibleCount: number;
};

export type FixedVirtualRangeOptions = {
  count: number;
  itemSize: number;
  overscan?: number;
  scrollOffset: number;
  viewportSize: number;
};

export type VariableVirtualRangeOptions = {
  itemSizes: readonly number[];
  overscan?: number;
  scrollOffset: number;
  viewportSize: number;
};

export function getFixedVirtualRange({
  count,
  itemSize,
  overscan = 2,
  scrollOffset,
  viewportSize,
}: FixedVirtualRangeOptions): VirtualRange {
  if (count <= 0 || itemSize <= 0 || viewportSize <= 0) {
    return emptyVirtualRange();
  }

  const safeOffset = clamp(scrollOffset, 0, count * itemSize);
  const startIndex = clamp(Math.floor(safeOffset / itemSize) - overscan, 0, count);
  const endIndex = clamp(
    Math.ceil((safeOffset + viewportSize) / itemSize) + overscan,
    startIndex,
    count,
  );

  return {
    endIndex,
    offsetAfter: Math.max(0, (count - endIndex) * itemSize),
    offsetBefore: startIndex * itemSize,
    startIndex,
    totalSize: count * itemSize,
    visibleCount: endIndex - startIndex,
  };
}

export function getVariableVirtualRange({
  itemSizes,
  overscan = 1,
  scrollOffset,
  viewportSize,
}: VariableVirtualRangeOptions): VirtualRange {
  if (itemSizes.length === 0 || viewportSize <= 0) {
    return emptyVirtualRange();
  }

  const offsets = getOffsets(itemSizes);
  const totalSize = offsets[offsets.length - 1] ?? 0;
  const safeOffset = clamp(scrollOffset, 0, totalSize);
  const visibleStart = findIndexAtOffset(offsets, safeOffset);
  const visibleEnd = findIndexAtOffset(offsets, safeOffset + viewportSize) + 1;
  const startIndex = clamp(visibleStart - overscan, 0, itemSizes.length);
  const endIndex = clamp(visibleEnd + overscan, startIndex, itemSizes.length);

  return {
    endIndex,
    offsetAfter: Math.max(0, totalSize - offsets[endIndex]),
    offsetBefore: offsets[startIndex] ?? 0,
    startIndex,
    totalSize,
    visibleCount: endIndex - startIndex,
  };
}

export function getOffsets(itemSizes: readonly number[]): number[] {
  const offsets = [0];

  for (const size of itemSizes) {
    offsets.push(offsets[offsets.length - 1] + Math.max(0, size));
  }

  return offsets;
}

function emptyVirtualRange(): VirtualRange {
  return {
    endIndex: 0,
    offsetAfter: 0,
    offsetBefore: 0,
    startIndex: 0,
    totalSize: 0,
    visibleCount: 0,
  };
}

function findIndexAtOffset(offsets: readonly number[], offset: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = offsets[mid] ?? 0;
    const end = offsets[mid + 1] ?? start;

    if (offset < start) {
      high = mid - 1;
    } else if (offset >= end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return clamp(low, 0, Math.max(0, offsets.length - 2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
