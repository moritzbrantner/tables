import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  clampColumnMenuPosition,
  getCurrentTime,
  hasColumnMenuActions,
  isContextMenuEnabled,
  shouldIgnoreColumnMenuScrollClose,
  type resolveColumnMenuOptions,
} from "./column-menu";
import type { TableColumn } from "./react-column";


type MenuState =
  | {
      columnId: string;
      kind: "column";
      x: number;
      y: number;
    }
  | {
      kind: "table";
      x: number;
      y: number;
    }
  | null;

export const tableMenuId = "mb-table-options-menu";

export type GridMenuController<TRow> = ReturnType<typeof useGridMenu<TRow>>;

export function useGridMenu<TRow>(columnMenuOptions: ReturnType<typeof resolveColumnMenuOptions>) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const ignoreColumnMenuScrollCloseUntilRef = useRef(0);
  const [menuState, setMenuState] = useState<MenuState>(null);

  const closeMenu = useCallback(() => {
    setMenuState(null);
    menuTriggerRef.current?.focus();
    menuTriggerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    if (!menuState || !menuRef.current) {
      return;
    }

    const focusTarget = menuRef.current.querySelector<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
    );

    focusTarget?.focus({ preventScroll: true });
  }, [menuState]);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    const handleWindowScroll = () => {
      if (!shouldIgnoreColumnMenuScrollClose(ignoreColumnMenuScrollCloseUntilRef.current)) {
        closeMenu();
      }
    };
    const handleWindowResize = () => closeMenu();

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("scroll", handleWindowScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("scroll", handleWindowScroll, true);
    };
  }, [closeMenu, menuState]);

  const dismissMenu = useCallback(() => setMenuState(null), []);

  const dismissMenuOnScroll = useCallback(() => {
    if (!shouldIgnoreColumnMenuScrollClose(ignoreColumnMenuScrollCloseUntilRef.current)) {
      setMenuState(null);
    }
  }, []);

  const openColumnMenu = useCallback(
    (
      column: TableColumn<TRow>,
      trigger: HTMLElement,
      coordinates: { x: number; y: number },
    ) => {
      if (!hasColumnMenuActions(column, columnMenuOptions)) {
        return;
      }

      menuTriggerRef.current = trigger;
      ignoreColumnMenuScrollCloseUntilRef.current = getCurrentTime() + 100;
      setMenuState({
        columnId: column.id,
        kind: "column",
        ...clampColumnMenuPosition(coordinates.x, coordinates.y),
      });
    },
    [columnMenuOptions],
  );

  const handleHeaderContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>, column: TableColumn<TRow>) => {
      if (!isContextMenuEnabled(columnMenuOptions) || !hasColumnMenuActions(column, columnMenuOptions)) {
        return;
      }

      event.preventDefault();
      openColumnMenu(column, event.currentTarget, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [columnMenuOptions, openColumnMenu],
  );

  const handleHeaderKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, column: TableColumn<TRow>) => {
      if (
        !isContextMenuEnabled(columnMenuOptions) ||
        !hasColumnMenuActions(column, columnMenuOptions) ||
        (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))
      ) {
        return;
      }

      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openColumnMenu(column, event.currentTarget, {
        x: rect.left,
        y: rect.bottom,
      });
    },
    [columnMenuOptions, openColumnMenu],
  );

  const handleMenuButtonClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, column: TableColumn<TRow>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      openColumnMenu(column, event.currentTarget, {
        x: rect.left,
        y: rect.bottom,
      });
    },
    [openColumnMenu],
  );

  const handleTableMenuButtonClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      menuTriggerRef.current = event.currentTarget;
      ignoreColumnMenuScrollCloseUntilRef.current = getCurrentTime() + 100;
      setMenuState({
        kind: "table",
        ...clampColumnMenuPosition(rect.left, rect.bottom),
      });
    },
    [],
  );

  return {
    closeMenu,
    dismissMenu,
    dismissMenuOnScroll,
    handleHeaderContextMenu,
    handleHeaderKeyDown,
    handleMenuButtonClick,
    handleTableMenuButtonClick,
    menuRef,
    menuState,
  };
}
