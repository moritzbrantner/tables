from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# Enforce the public TableColumnFilter.value runtime domain on decoded payloads.
view_path = Path("src/view-state.ts")
view = view_path.read_text()
view = replace_once(
    view,
    '''  if (Object.prototype.hasOwnProperty.call(value, "value")) {
    filter.value = decodeValue(value.value) as TableColumnFilter["value"];
  }
''',
    '''  if (Object.prototype.hasOwnProperty.call(value, "value")) {
    const decodedValue = decodeValue(value.value);
    if (isTableColumnFilterValue(decodedValue)) {
      filter.value = decodedValue;
    }
  }
''',
    "decoded filter value boundary",
)
view = replace_once(
    view,
    '''function decodeSort(value: unknown): TableSortState {
''',
    '''function isTableColumnFilterValue(value: unknown): value is TableColumnFilter["value"] {
  return (
    value == null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string" ||
    value instanceof Date ||
    Array.isArray(value)
  );
}

function decodeSort(value: unknown): TableSortState {
''',
    "filter value validator",
)
view_path.write_text(view)

# Dogfood the codec in the primary Pages playground without moving router ownership into the package.
app_path = Path("examples/src/playground/app.tsx")
app = app_path.read_text()
app = replace_once(
    app,
    '''import {
  DataTable,
  VirtualTable,
  type TableFilter,
  type TableModel,
  type TableRowKey,
} from "@moritzbrantner/tables";
''',
    '''import {
  DataTable,
  VirtualTable,
  decodeTableViewState,
  encodeTableViewState,
  tableStateToViewState,
  viewStateToTableState,
  type TableFilter,
  type TableModel,
  type TableRowKey,
  type TableState,
} from "@moritzbrantner/tables";
''',
    "playground imports",
)
app = replace_once(
    app,
    '''  const [pipelineFilter, setPipelineFilter] = useState<TableFilter<PipelineRow> | null>({
    query: "",
  });
''',
    '''  const initialPipelineTableState = useMemo<Partial<TableState<PipelineRow>>>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    const params = new URLSearchParams(window.location.search);
    return viewStateToTableState<PipelineRow>(decodeTableViewState(params.get("table")));
  }, []);
  const [pipelineFilter, setPipelineFilter] = useState<TableFilter<PipelineRow> | null>(
    () => initialPipelineTableState.filter ?? null,
  );
''',
    "initial URL state",
)
app = replace_once(
    app,
    '''  const handleModelChange = useCallback((model: TableModel<PipelineRow>) => {
    setVisibleRows(model.rows.length);
  }, []);
''',
    '''  const handleModelChange = useCallback((model: TableModel<PipelineRow>) => {
    setVisibleRows(model.rows.length);
  }, []);
  const persistPipelineState = useCallback((state: TableState<PipelineRow>) => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("table", encodeTableViewState(tableStateToViewState(state)));
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const handlePipelineFilterChange = useCallback((filter: TableFilter<PipelineRow> | null) => {
    setPipelineFilter(filter);
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const viewState = decodeTableViewState(url.searchParams.get("table"));
    viewState.filter = filter
      ? {
          ...(filter.columnFilters ? { columnFilters: filter.columnFilters } : {}),
          ...(filter.query !== undefined ? { query: filter.query } : {}),
          ...(filter.queryColumnIds ? { queryColumnIds: filter.queryColumnIds } : {}),
        }
      : null;
    url.searchParams.set("table", encodeTableViewState(viewState));
    window.history.replaceState(window.history.state, "", url);
  }, []);
''',
    "URL persistence callbacks",
)
app = replace_once(
    app,
    '''          <OverviewPage
            density={density}
            filter={pipelineFilter}
''',
    '''          <OverviewPage
            density={density}
            filter={pipelineFilter}
            initialState={initialPipelineTableState}
''',
    "overview initial state prop",
)
app = replace_once(
    app,
    '''            onModelChange={handleModelChange}
''',
    '''            onModelChange={handleModelChange}
            onViewStateChange={persistPipelineState}
''',
    "overview persistence prop",
)
app = replace_once(
    app,
    '''            setFilter={setPipelineFilter}
            setSelectedRowKeys={setSelectedPipelineRowKeys}
''',
    '''            setFilter={handlePipelineFilterChange}
            setSelectedRowKeys={setSelectedPipelineRowKeys}
''',
    "overview filter callback",
)
app = replace_once(
    app,
    '''  filter,
  onDensityChange,
  onModelChange,
''',
    '''  filter,
  initialState,
  onDensityChange,
  onModelChange,
  onViewStateChange,
''',
    "overview destructuring",
)
app = replace_once(
    app,
    '''  filter: TableFilter<PipelineRow> | null;
  onDensityChange: (density: TableDensity) => void;
  onModelChange: (model: TableModel<PipelineRow>) => void;
''',
    '''  filter: TableFilter<PipelineRow> | null;
  initialState: Partial<TableState<PipelineRow>>;
  onDensityChange: (density: TableDensity) => void;
  onModelChange: (model: TableModel<PipelineRow>) => void;
  onViewStateChange: (state: TableState<PipelineRow>) => void;
''',
    "overview prop types",
)
app = replace_once(
    app,
    '''            height="min(620px, calc(100vh - 270px))"
            onModelChange={onModelChange}
''',
    '''            height="min(620px, calc(100vh - 270px))"
            initialState={initialState}
            onModelChange={onModelChange}
''',
    "VirtualTable initial state",
)
app = replace_once(
    app,
    '''              if (type === "selection") {
                setSelectedRowKeys(state.selection.selectedRowKeys);
              }
''',
    '''              if (type === "selection") {
                setSelectedRowKeys(state.selection.selectedRowKeys);
              } else {
                onViewStateChange(state);
              }
''',
    "persist non-selection transitions",
)
app_path.write_text(app)

# Browser contract: both external search and internal sort survive reload through the URL codec.
Path("tests/e2e/view-state.spec.ts").write_text('''import { expect, test } from "@playwright/test";

test("persists durable pipeline view state through the URL", async ({ page }) => {
  await page.goto("/");

  const search = page.getByLabel("Search pipeline");
  await search.fill("north");
  await page.getByRole("button", { name: "Sort ID ascending" }).click();

  await expect.poll(() => new URL(page.url()).searchParams.get("table")).not.toBeNull();
  const persistedUrl = page.url();
  expect(new URL(persistedUrl).searchParams.get("table")).toContain('"version":1');

  await page.reload();

  await expect(page.getByLabel("Search pipeline")).toHaveValue("north");
  await expect(page.getByRole("button", { name: "Sort ID descending" })).toBeVisible();
});
''')
