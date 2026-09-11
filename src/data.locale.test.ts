import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("reuses a single collator within each locale-aware table operation", () => {
    const collator = vi.spyOn(Intl, "Collator");
    const rows: Row[] = Array.from({ length: 32 }, (_, index) => ({
      id: index,
      name: `Row ${32 - index}`,
    }));

    applyTableSort(rows, columns, [{ columnId: "name", direction: "asc" }], "en");
    expect(collator).toHaveBeenCalledTimes(1);

    collator.mockClear();
    applyTableFilter(
      rows,
      columns,
      { columnFilters: [{ columnId: "name", operator: "equals", value: "row 1" }] },
      "en",
    );
    expect(collator).toHaveBeenCalledTimes(1);
  });
});
