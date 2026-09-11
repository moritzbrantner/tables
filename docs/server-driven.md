# Server-driven tables

`tables` treats remote data as an application-owned workflow. The package never fetches data and never owns a query client, router, cache, endpoint, cursor, or transport.

## Contract

Use `mode="manual"` when the `rows` prop is already the current server page or window. Filtering and sorting controls continue to emit `TableState`, but `VirtualTable` does not process the supplied rows locally.

Pass the server's counts explicitly:

- `totalRowCount`: the authoritative total represented by the grid.
- `filteredRowCount`: the count after server-side filtering when known.
- `sortedRowCount`: the count represented by the sorted result when known.

The current `rows` array is only the loaded window. It must not be treated as the whole data set.

## Deterministic requests and query keys

`createTableServerRequest(state, window)` reduces complete table state to the state a server can actually consume: durable filter state, sort state, and a normalized `{ offset, limit }` window. Selection and display-only state such as column order, sizing, and visibility do not affect the request.

`createTableServerQueryKey(state, window)` returns a deterministic tuple suitable for an external query/cache layer. `encodeTableServerRequest` provides the corresponding stable string representation. Custom predicate functions are intentionally excluded because functions are application behavior, not serializable server query state.

Applications remain free to translate this request into REST query parameters, a POST/QUERY body, GraphQL variables, RPC input, or another transport-specific contract.

## Loading, stale rows, and empty results

A host may keep the current server window mounted while a replacement window is loading by leaving `rows` unchanged and setting `loading`. The table renders the loading state over those existing rows; replacing the rows remains the host's responsibility.

An empty current result should be represented with `rows={[]}` and an application-owned `emptyState`. A loading request and an empty completed result are distinct states.

## Deterministic example

`examples/server.html` uses an in-memory adapter in place of a live backend. The adapter is deliberately outside the table package and demonstrates:

- external filtering and sorting;
- deterministic request/query-key derivation;
- page/window ownership by the host;
- server-provided counts;
- current rows remaining mounted during a simulated refresh;
- empty results without a network dependency.

This keeps the example repeatable in tests while preserving the same ownership boundary required by a real backend or TanStack Query integration.
