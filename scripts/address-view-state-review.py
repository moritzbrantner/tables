from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


view_path = Path("src/view-state.ts")
view = view_path.read_text()
view = replace_once(
    view,
    '''  if (Object.prototype.hasOwnProperty.call(value, "value")) {
    const decodedValue = decodeValue(value.value);
    if (isTableColumnFilterValue(decodedValue)) {
      filter.value = decodedValue;
    }
  }
''',
    '''  if (Object.prototype.hasOwnProperty.call(value, "value")) {
    const encodedValue = value.value;
    const decodedValue = decodeValue(encodedValue);
    if (
      !isRecord(encodedValue) ||
      typeof encodedValue.kind !== "string" ||
      (decodedValue === undefined && encodedValue.kind !== "undefined") ||
      !isTableColumnFilterValue(decodedValue)
    ) {
      return null;
    }
    filter.value = decodedValue;
  }
''',
    "reject malformed encoded filter values",
)
view_path.write_text(view)

# Use the documented subpath in the real example so source aliases are exercised by check:pages.
app_path = Path("examples/src/playground/app.tsx")
app = app_path.read_text()
app = replace_once(
    app,
    '''  DataTable,
  VirtualTable,
  decodeTableViewState,
  encodeTableViewState,
  tableStateToViewState,
  viewStateToTableState,
  type TableFilter,
''',
    '''  DataTable,
  VirtualTable,
  type TableFilter,
''',
    "remove root codec imports",
)
app = replace_once(
    app,
    'import "../../../styles.css";\n',
    '''import {
  decodeTableViewState,
  encodeTableViewState,
  tableStateToViewState,
  viewStateToTableState,
} from "@moritzbrantner/tables/view-state";
import "../../../styles.css";
''',
    "use view-state subpath",
)
app_path.write_text(app)

# Match the new package subpath in local TypeScript and Vite development resolution.
tsconfig_path = Path("tsconfig.json")
tsconfig = tsconfig_path.read_text()
tsconfig = replace_once(
    tsconfig,
    '      "@moritzbrantner/tables/react": ["./src/react-rust.tsx"],\n'
    '      "@moritzbrantner/tables/virtualization": ["./src/virtualization.ts"]\n',
    '      "@moritzbrantner/tables/react": ["./src/react-rust.tsx"],\n'
    '      "@moritzbrantner/tables/view-state": ["./src/view-state.ts"],\n'
    '      "@moritzbrantner/tables/virtualization": ["./src/virtualization.ts"]\n',
    "TypeScript view-state alias",
)
tsconfig_path.write_text(tsconfig)

vite_path = Path("vite.config.ts")
vite = vite_path.read_text()
vite = replace_once(
    vite,
    '''      {
        find: /^@moritzbrantner\\/tables\\/virtualization$/,
        replacement: path.resolve(rootDir, "src/virtualization.ts"),
      },
''',
    '''      {
        find: /^@moritzbrantner\\/tables\\/view-state$/,
        replacement: path.resolve(rootDir, "src/view-state.ts"),
      },
      {
        find: /^@moritzbrantner\\/tables\\/virtualization$/,
        replacement: path.resolve(rootDir, "src/virtualization.ts"),
      },
''',
    "Vite view-state alias",
)
vite_path.write_text(vite)

# Add a regression for the malformed-value case raised in review.
test_path = Path("src/view-state.test.ts")
test = test_path.read_text()
marker = '''  it("serializes only durable table state and excludes selection and predicates", () => {
'''
case = '''  it("drops filters whose tagged values are structurally invalid", () => {
    const decoded = decodeTableViewState(
      JSON.stringify({
        columnOrder: [],
        columnSizing: {},
        columnVisibility: {},
        filter: {
          columnFilters: [
            {
              columnId: "bad-string",
              operator: "equals",
              value: { kind: "string", value: 3 },
            },
            {
              columnId: "bad-date",
              operator: "equals",
              value: { kind: "date", value: "not-a-date" },
            },
            {
              columnId: "explicit-undefined",
              operator: "equals",
              value: { kind: "undefined" },
            },
          ],
        },
        sort: [],
        version: TABLE_VIEW_STATE_VERSION,
      }),
    );

    expect(decoded.filter?.columnFilters).toEqual([
      { columnId: "explicit-undefined", operator: "equals", value: undefined },
    ]);
  });

'''
test = replace_once(test, marker, case + marker, "malformed-value regression")
test_path.write_text(test)
