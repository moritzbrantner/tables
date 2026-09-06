from pathlib import Path

path = Path("src/react.tsx")
source = path.read_text()

old = '''  const categorical = Boolean(filterOptions?.length);
  const [draft, setDraft] = useState<ColumnFilterDraft>(() =>
    createInitialColumnFilterDraft(columnType, activeColumnFilter, categorical),
  );'''
new = '''  const categorical = Boolean(filterOptions?.length);
  const categoricalValues = getCategoricalFilterValues(activeColumnFilter, filterOptions);
  const [draft, setDraft] = useState<ColumnFilterDraft>(() =>
    createInitialColumnFilterDraft(columnType, activeColumnFilter, categorical),
  );'''
assert old in source, "categorical state anchor not found"
source = source.replace(old, new, 1)

old = '''  const updateDraft = (updates: Partial<ColumnFilterDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };
  const applyFilter = () => {'''
new = '''  const updateDraft = (updates: Partial<ColumnFilterDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };
  const toggleCategoricalValue = (option: string) => {
    const nextValues = categoricalValues.includes(option)
      ? categoricalValues.filter((value) => value !== option)
      : [...categoricalValues, option];

    setFilter(
      nextValues.length > 0
        ? replaceColumnFilter(activeFilter, {
            columnId: column.id,
            operator: "in",
            value: nextValues,
          })
        : removeColumnFilter(activeFilter, column.id),
    );
  };
  const applyFilter = () => {'''
assert old in source, "filter action anchor not found"
source = source.replace(old, new, 1)

old = '''      {showFilter ? (
        <div className="mb-table__column-menu-section">
          <label className="mb-table__column-menu-field">
            <span>Filter</span>
            <select
              onChange={(event) =>
                updateDraft({ operator: event.target.value as TableFilterOperator })
              }
              value={draft.operator}
            >
              {operators.map((operator) => (
                <option key={operator} value={operator}>
                  {filterOperatorLabels[operator]}
                </option>
              ))}
            </select>
          </label>

          {renderFilterValueControl(columnType, filterOptions, draft, updateDraft)}

          <div className="mb-table__column-menu-actions">
            <button
              className="mb-table__column-menu-button"
              disabled={!canApplyFilter}
              onClick={applyFilter}
              type="button"
            >
              Apply
            </button>
            <button
              className="mb-table__column-menu-button"
              disabled={!activeColumnFilter}
              onClick={clearColumnFilter}
              type="button"
            >
              Clear filter
            </button>
          </div>
          <button
            className="mb-table__column-menu-button"
            disabled={!activeFilter?.columnFilters?.length}
            onClick={clearAllFilters}
            type="button"
          >
            Clear all filters
          </button>
        </div>
      ) : null}'''
new = '''      {showFilter ? (
        <div className="mb-table__column-menu-section">
          {categorical ? (
            <>
              <div
                aria-label={`Filter ${label}`}
                className="mb-table__column-menu-section"
                role="group"
              >
                {filterOptions?.map((option) => {
                  const selected = categoricalValues.includes(option);

                  return (
                    <button
                      aria-label={option}
                      aria-pressed={selected}
                      className="mb-table__column-menu-button"
                      key={option}
                      onClick={() => toggleCategoricalValue(option)}
                      type="button"
                    >
                      <span aria-hidden="true">{selected ? "✓ " : "○ "}</span>
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>
              <button
                className="mb-table__column-menu-button"
                disabled={!activeColumnFilter}
                onClick={clearColumnFilter}
                type="button"
              >
                Clear filter
              </button>
            </>
          ) : (
            <>
              <label className="mb-table__column-menu-field">
                <span>Filter</span>
                <select
                  onChange={(event) =>
                    updateDraft({ operator: event.target.value as TableFilterOperator })
                  }
                  value={draft.operator}
                >
                  {operators.map((operator) => (
                    <option key={operator} value={operator}>
                      {filterOperatorLabels[operator]}
                    </option>
                  ))}
                </select>
              </label>

              {renderFilterValueControl(columnType, undefined, draft, updateDraft)}

              <div className="mb-table__column-menu-actions">
                <button
                  className="mb-table__column-menu-button"
                  disabled={!canApplyFilter}
                  onClick={applyFilter}
                  type="button"
                >
                  Apply
                </button>
                <button
                  className="mb-table__column-menu-button"
                  disabled={!activeColumnFilter}
                  onClick={clearColumnFilter}
                  type="button"
                >
                  Clear filter
                </button>
              </div>
            </>
          )}
          <button
            className="mb-table__column-menu-button"
            disabled={!activeFilter?.columnFilters?.length}
            onClick={clearAllFilters}
            type="button"
          >
            Clear all filters
          </button>
        </div>
      ) : null}'''
assert old in source, "filter menu block not found"
source = source.replace(old, new, 1)

old = '''function replaceColumnFilter<TRow>(
  filter: TableFilter<TRow> | null,
  columnFilter: TableColumnFilter,
): TableFilter<TRow> | null {'''
new = '''function getCategoricalFilterValues(
  filter: TableColumnFilter | undefined,
  filterOptions: readonly string[] | undefined,
): string[] {
  if (!filter || !filterOptions?.length) {
    return [];
  }

  const values =
    filter.operator === "in" && Array.isArray(filter.value)
      ? filter.value
      : filter.operator === "equals"
        ? [filter.value]
        : [];
  const selectedValues = new Set(
    values.filter((value): value is string => typeof value === "string"),
  );

  return filterOptions.filter((option) => selectedValues.has(option));
}

function replaceColumnFilter<TRow>(
  filter: TableFilter<TRow> | null,
  columnFilter: TableColumnFilter,
): TableFilter<TRow> | null {'''
assert old in source, "replaceColumnFilter anchor not found"
source = source.replace(old, new, 1)
path.write_text(source)

test_path = Path("src/react.typed-filter.test.tsx")
test_source = test_path.read_text()
old_test = '''  it("uses an enum select and filters by the selected value", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /open column actions for stage/i }));
    const dialog = screen.getByRole("dialog", { name: /column actions for stage/i });
    const operator = within(dialog).getByLabelText("Filter") as HTMLSelectElement;
    const value = within(dialog).getByLabelText("Value") as HTMLSelectElement;

    expect(operator.value).toBe("equals");
    expect(value.tagName).toBe("SELECT");
    expect(Array.from(value.options).map((option) => option.value)).toEqual([
      "",
      "Proposal",
      "Closed",
    ]);

    fireEvent.change(value, { target: { value: "Closed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByText("Alpha")).toBeNull();
  });'''
new_test = '''  it("uses direct multi-select enum filters without an operator dropdown", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /open column actions for stage/i }));
    const dialog = screen.getByRole("dialog", { name: /column actions for stage/i });

    expect(within(dialog).queryByLabelText("Filter")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /apply/i })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Proposal" }));
    expect(
      within(dialog).getByRole("button", { name: "Proposal" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByText("Beta")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Closed" }));
    expect(
      within(dialog).getByRole("button", { name: "Closed" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Proposal" }));
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.getByText("Beta")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Closed" }));
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });'''
assert old_test in test_source, "typed enum filter test anchor not found"
test_path.write_text(test_source.replace(old_test, new_test, 1))
