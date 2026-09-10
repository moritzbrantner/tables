from pathlib import Path

path = Path("README.md")
text = path.read_text()
marker = "## Big Data Defaults\n"
section = '''## Durable View State

Table-owned, non-sensitive view state can be serialized without coupling the package to a router. The versioned codec covers filtering, sorting, column visibility, order, and sizing. It deliberately excludes row selection, functions such as custom predicates, menu state, focus, scroll position, and resize gestures.

```tsx
import {
  decodeTableViewState,
  encodeTableViewState,
  tableStateToViewState,
  viewStateToTableState,
} from "@moritzbrantner/tables/view-state";

const params = new URLSearchParams(window.location.search);
const initialState = viewStateToTableState(decodeTableViewState(params.get("table")));

// After a table state change:
params.set("table", encodeTableViewState(tableStateToViewState(nextState)));
```

The encoded value is ordinary JSON designed to be stored as a `URLSearchParams` value. Column ids and filter strings do not rely on delimiter conventions, and decoding malformed or unknown-version input returns the default empty view state rather than throwing.

'''
if text.count(marker) != 1:
    raise SystemExit(f"expected one README marker, found {text.count(marker)}")
path.write_text(text.replace(marker, section + marker, 1))
