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
  const safeCount = normalizeUnsignedInteger(count);
  const safeOverscan = normalizeUnsignedInteger(overscan);

  if (safeCount === 0 || !isPositiveFinite(itemSize) || !isPositiveFinite(viewportSize)) {
    return emptyVirtualRange();
  }

  const totalSize = safeCount * itemSize;
  const safeOffset = normalizeOffset(scrollOffset, totalSize);
  const startIndex = clamp(Math.floor(safeOffset / itemSize) - safeOverscan, 0, safeCount);
  const endIndex = clamp(
    Math.ceil((safeOffset + viewportSize) / itemSize) + safeOverscan,
    startIndex,
    safeCount,
  );

  return {
    endIndex,
    offsetAfter: Math.max(0, (safeCount - endIndex) * itemSize),
    offsetBefore: startIndex * itemSize,
    startIndex,
    totalSize,
    visibleCount: endIndex - startIndex,
  };
}

export function getVariableVirtualRange({
  itemSizes,
  overscan = 1,
  scrollOffset,
  viewportSize,
}: VariableVirtualRangeOptions): VirtualRange {
  if (itemSizes.length === 0 || !isPositiveFinite(viewportSize)) {
    return emptyVirtualRange();
  }

  const safeOverscan = normalizeUnsignedInteger(overscan);
  const offsets = getOffsets(itemSizes);
  const totalSize = offsets[offsets.length - 1] ?? 0;
  const safeOffset = normalizeOffset(scrollOffset, totalSize);
  const visibleStart = findIndexAtOffset(offsets, safeOffset);
  const visibleEnd = findIndexAtOffset(offsets, safeOffset + viewportSize) + 1;
  const startIndex = clamp(visibleStart - safeOverscan, 0, itemSizes.length);
  const endIndex = clamp(visibleEnd + safeOverscan, startIndex, itemSizes.length);

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
    offsets.push((offsets[offsets.length - 1] ?? 0) + normalizeSize(size));
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

function normalizeOffset(offset: number, totalSize: number): number {
  if (Number.isNaN(offset) || offset <= 0) {
    return 0;
  }

  if (offset >= totalSize) {
    return totalSize;
  }

  return offset;
}

function normalizeSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function normalizeUnsignedInteger(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
