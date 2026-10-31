import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { TableColumnSizingState } from "./data";
import type { TableColumn } from "./react-column";
import { clampColumnWidth } from "./react-grid-columns";

export type ColumnResizeMode = "onChange" | "onEnd";

type ResizeState = {
  columnId: string;
  currentWidth: number;
  startWidth: number;
  startX: number;
};

export function useColumnResize<TRow>({
  columnResizeMode,
  columnSizing,
  columns,
  onResizeStart,
  setColumnSizing,
}: {
  columnResizeMode: ColumnResizeMode;
  columnSizing: TableColumnSizingState;
  columns: readonly TableColumn<TRow>[];
  onResizeStart: () => void;
  setColumnSizing: (columnSizing: TableColumnSizingState) => void;
}) {
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setResizeState((current) => {
        if (!current) {
          return current;
        }

        const column = columns.find((candidate) => candidate.id === current.columnId);
        const currentWidth = clampColumnWidth(
          column,
          current.startWidth + event.clientX - current.startX,
        );

        if (columnResizeMode === "onChange") {
          setColumnSizing({
            ...columnSizing,
            [current.columnId]: currentWidth,
          });
        }

        return {
          ...current,
          currentWidth,
        };
      });
    };
    const handlePointerUp = () => {
      setResizeState((current) => {
        if (current && columnResizeMode === "onEnd") {
          setColumnSizing({
            ...columnSizing,
            [current.columnId]: current.currentWidth,
          });
        }

        return null;
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [columnSizing, columnResizeMode, columns, resizeState, setColumnSizing]);

  const handleResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      column: TableColumn<TRow>,
      width: number,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      onResizeStart();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setResizeState({
        columnId: column.id,
        currentWidth: width,
        startWidth: width,
        startX: event.clientX,
      });
    },
    [onResizeStart],
  );

  const handleResizeKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLButtonElement>,
      column: TableColumn<TRow>,
      width: number,
    ) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const step = event.shiftKey ? 32 : 8;
      const nextWidth = clampColumnWidth(column, width + direction * step);
      setColumnSizing({
        ...columnSizing,
        [column.id]: nextWidth,
      });
    },
    [columnSizing, setColumnSizing],
  );

  const resetColumnWidth = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, column: TableColumn<TRow>) => {
      event.preventDefault();
      event.stopPropagation();
      const nextSizing = { ...columnSizing };

      delete nextSizing[column.id];
      setColumnSizing(nextSizing);
    },
    [columnSizing, setColumnSizing],
  );

  return { handleResizeKeyDown, handleResizePointerDown, resetColumnWidth, resizeState };
}
