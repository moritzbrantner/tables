import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  getFixedVirtualRange,
  type VariableVirtualLayout,
  type VirtualRange,
} from "./virtualization";

export type ScrollOffset = {
  left: number;
  top: number;
};


type Size = {
  height: number;
  width: number;
};

export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ height: 0, width: 0 });

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    setSize({
      height: element.clientHeight,
      width: element.clientWidth,
    });

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [ref]);

  return size;
}

function isSameRange(left: VirtualRange, right: VirtualRange) {
  return left.startIndex === right.startIndex && left.endIndex === right.endIndex;
}

/** Row and center-column ranges derived from the scroll position. */
export function useGridWindow({
  centerCount,
  centerLayout,
  columnOverscan,
  columnVirtualization,
  onScroll,
  overscan,
  rowCount,
  rowHeight,
  scrollRef,
  stickyLeftWidth,
  stickyRightWidth,
  viewport,
}: {
  centerCount: number;
  centerLayout: VariableVirtualLayout;
  columnOverscan: number;
  columnVirtualization: boolean;
  onScroll: () => void;
  overscan: number;
  rowCount: number;
  rowHeight: number;
  scrollRef: RefObject<HTMLElement | null>;
  stickyLeftWidth: number;
  stickyRightWidth: number;
  viewport: Size;
}) {
  // Rendered output depends on the scroll position only through the two ranges, so
  // scroll events inside the current ranges skip rendering. The offset lives in a ref
  // so that any render, whatever its cause, still uses the latest position.
  const scrollOffsetRef = useRef<ScrollOffset>({ left: 0, top: 0 });
  const [, requestWindowRender] = useReducer((revision: number) => revision + 1, 0);
  const scrollOffset = scrollOffsetRef.current;
  const centerColumnWidth = centerLayout.totalSize;
  const centerViewportWidth = Math.max(1, viewport.width - stickyLeftWidth - stickyRightWidth);
  const getRowRange = useCallback(
    (scrollTop: number) =>
      getFixedVirtualRange({
        count: rowCount,
        itemSize: rowHeight,
        overscan,
        scrollOffset: scrollTop,
        viewportSize: Math.max(1, viewport.height - rowHeight),
      }),
    [overscan, rowCount, rowHeight, viewport.height],
  );
  const getColumnRange = useCallback(
    (scrollLeft: number): VirtualRange =>
      columnVirtualization
        ? centerLayout.virtualRange({
            overscan: columnOverscan,
            scrollOffset: Math.max(0, scrollLeft - stickyLeftWidth),
            viewportSize: centerViewportWidth,
          })
        : {
            endIndex: centerCount,
            offsetAfter: 0,
            offsetBefore: 0,
            startIndex: 0,
            totalSize: centerColumnWidth,
            visibleCount: centerCount,
          },
    [
      centerColumnWidth,
      centerCount,
      centerLayout,
      centerViewportWidth,
      columnOverscan,
      columnVirtualization,
      stickyLeftWidth,
    ],
  );
  const rowRange = useMemo(() => getRowRange(scrollOffset.top), [getRowRange, scrollOffset.top]);
  const columnRange = useMemo(
    () => getColumnRange(scrollOffset.left),
    [getColumnRange, scrollOffset.left],
  );

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const next = { left: element.scrollLeft, top: element.scrollTop };

    scrollOffsetRef.current = next;
    if (
      !isSameRange(getRowRange(next.top), rowRange) ||
      !isSameRange(getColumnRange(next.left), columnRange)
    ) {
      requestWindowRender();
    }
    onScroll();
  }, [columnRange, getColumnRange, getRowRange, onScroll, rowRange, scrollRef]);

  const scrollTo = useCallback((next: ScrollOffset) => {
    const element = scrollRef.current;

    if (element) {
      element.scrollLeft = next.left;
      element.scrollTop = next.top;
    }
    scrollOffsetRef.current = next;
    requestWindowRender();
  }, [scrollRef]);

  return { columnRange, handleScroll, rowRange, scrollOffsetRef, scrollTo };
}
