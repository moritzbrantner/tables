import { describe, expect, it } from "vitest";

import { updateFilterQuery } from "./filter-query";

describe("updateFilterQuery", () => {
  it("preserves column filters while changing the search query", () => {
    const columnFilters = [{ columnId: "stage", operator: "equals" as const, value: "Proposal" }];

    expect(updateFilterQuery({ columnFilters }, "account 17")).toEqual({
      columnFilters,
      query: "account 17",
    });
  });

  it("removes only the query when search is cleared", () => {
    const columnFilters = [{ columnId: "stage", operator: "equals" as const, value: "Proposal" }];

    expect(updateFilterQuery({ columnFilters, query: "account" }, "  ")).toEqual({
      columnFilters,
    });
  });

  it("returns null when clearing the only active filter", () => {
    expect(updateFilterQuery({ query: "account" }, "")).toBeNull();
  });
});
