import { useEffect, useState } from "react";

import {
  DataTable as CoreDataTable,
  VirtualTable as CoreVirtualTable,
  type DataTableProps,
  type VirtualTableProps,
} from "./react";
import { loadTableWasmKernel } from "./wasm";

export type {
  ColumnResizeMode,
  DataTableProps,
  RowKey,
  TableColumnMenuOptions,
  TableColumnMenuTrigger,
  TableProcessingMode,
  TableSelectionMode,
  VirtualTableProps,
} from "./react";

export function DataTable<TRow>(props: DataTableProps<TRow>) {
  useTableRustKernel();
  return <CoreDataTable {...props} />;
}

export function VirtualTable<TRow>(props: VirtualTableProps<TRow>) {
  useTableRustKernel();
  return <CoreVirtualTable {...props} />;
}

function useTableRustKernel() {
  const [, setKernelRevision] = useState(0);

  useEffect(() => {
    let mounted = true;

    void loadTableWasmKernel().then((kernel) => {
      if (mounted && kernel) {
        setKernelRevision(1);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);
}
