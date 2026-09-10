import { createTableColumnHelper } from "./react";
import { createTableColumnDefHelper } from "./table";

type Row = { id: string; total: number };

const grid = createTableColumnHelper<Row>();
grid.accessor("total", {
  cell: (value) => {
    const typed: number = value;
    return typed.toFixed(2);
  },
  header: "Total",
  id: "total",
});

const semantic = createTableColumnDefHelper<Row>();
semantic.accessor("total", {
  cell: (value) => {
    const typed: number = value;
    return typed.toFixed(2);
  },
  header: "Total",
  id: "total",
});
