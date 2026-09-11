import { describe, expect, it } from "vitest";

import {
  applyTableFilter,
  applyTableSort,
  compareTableValues,
  createTableModel,
  type TableDataColumn,
} from "./data";

type Row = { id: number; name: string };

const columns: TableDataColumn<Row>[] = [
  { accessor: "id", id: "id", type: "number" },
  { accessor: "name", id: "name", type: "string" },
];

describe("locale-aware table text semantics", () => {
  it("uses locale-aware case folding for global search", () => {
    const rows: Row[] = [
      { id: 1, name: "İZMİR" },
      { id: 2, name: "Ankara" },
    ];

    expect(applyTableFilter(rows, columns, { query: "izmir" }, "tr")).toEqual([rows[0]]);
  });

  it("uses Intl collation for client-side sorting", () => {
    const rows: Row[] = [
      { id: 1, name: "å" },
      { id: 2, name: "z" },
    ];

    expect(applyTableSort(rows, columns, [{ columnId: "name", direction: "asc" }], "sv")).toEqual([
      rows[1],
      rows[0],
    ]);
    expect(compareTableValues("z", "å", "sv")).toBeLessThan(0);
  });

  it("keeps locale as model configuration rather than durable state", () => {
    const rows: Row[] = [
      { id: 1, name: "İZMİR" },
      { id: 2, name: "Ankara" },
    ];

    const model = createTableModel({ columns, filter: { query: "izmir" }, locale: "tr", rows });
    expect(model.rows).toEqual([rows[0]]);
  });
});
