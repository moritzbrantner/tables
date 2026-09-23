import { afterEach, describe, expect, it, vi } from "vitest";

import { applyTableFilter, type TableDataColumn } from "./data";
import { setTableQueryKernel } from "./query-kernel";

afterEach(() => {
  vi.restoreAllMocks();
  setTableQueryKernel(null);
});

describe("query work ratchets", () => {
  it.each([1_000, 10_000])("does not perform locale setup per ordinary ASCII cell at %i rows", (size) => {
    setTableQueryKernel(null);
    const rows = Array.from({ length: size }, (_, id) => ({ id, name: `Account ${id}` }));
    const columns: TableDataColumn<(typeof rows)[number]>[] = [
      { id: "id", accessor: "id" },
      { id: "name", accessor: "name" },
    ];
    const expected = rows.filter((row) => row.name.toLowerCase().includes("account 17"));
    const lower = vi.spyOn(String.prototype, "toLocaleLowerCase");
    const actual = applyTableFilter(rows, columns, { query: "ACCOUNT 17" });
    const calls = lower.mock.calls.length;
    lower.mockRestore();
    expect(actual).toEqual(expected);
    // Allows query preparation, not one Intl operation per row or cell.
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("keeps Turkish capital I on the host-locale path", () => {
    setTableQueryKernel(null);
    const nativeLower = String.prototype.toLocaleLowerCase;
    vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (
      this: string,
      locales?: Parameters<typeof nativeLower>[0],
    ) {
      return nativeLower.call(this, locales ?? "tr");
    });
    const rows = ["I", "i", "İ", "I\u0307", "A", "J"].map((text) => ({ text }));
    const columns: TableDataColumn<(typeof rows)[number]>[] = [{ id: "text", accessor: "text" }];
    const result = applyTableFilter(rows, columns, { query: "i" });
    expect(result.map((row) => row.text)).toEqual(["i", "İ", "I\u0307"]);
  });

  it("preserves Unicode context and explicit locale semantics", () => {
    setTableQueryKernel(null);
    const rows = ["Account 17", "I", "İ", "Σ", "ΟΣ", "I\u0301", "J\u0301", "A", "ẞ", ""]
      .map((text) => ({ text }));
    const columns: TableDataColumn<(typeof rows)[number]>[] = [{ id: "text", accessor: "text" }];
    for (const locale of [undefined, "tr", "az", "lt", "de", "el", ["tr", "en"]]) {
      for (const query of ["account", "I", "i", "ı", "İ", "σ", "a", "\u0307"]) {
        const needle = query.toLocaleLowerCase(locale);
        const expected = rows.filter((row) => row.text.toLocaleLowerCase(locale).includes(needle));
        expect(applyTableFilter(rows, columns, { query }, locale)).toEqual(expected);
      }
    }
    expect(() => applyTableFilter(rows, columns, { query: "account" }, "not_a_tag")).toThrow();
  });
});
