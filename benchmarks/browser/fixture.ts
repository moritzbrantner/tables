export type Row = { id: number; name: string; bucket: number; value: number };
export type Query = { query: string; descending: boolean | null; page: number };
export type Scope = "client" | "window";
export type Provider = "tables" | "ag-grid" | "mui";
export const pageSize = 100;
export const providers: Provider[] = ["tables", "ag-grid", "mui"];
export const workloads = ["mount", "filter", "sort", "page"] as const;
export type Workload = (typeof workloads)[number];

export function createRows(size: number): Row[] {
  return Array.from({ length: size }, (_, id) => ({
    id, name: `Account ${id % 2000}`, bucket: Math.floor(id / 7) % 5,
    value: (id * 7919) % 100000,
  }));
}
export function queryFor(workload: Workload, variant: number): Query {
  return {
    query: workload === "filter" ? (variant % 2 === 0 ? "account 1" : "account 2") : "",
    descending: workload === "sort" ? variant % 2 === 0 : null,
    page: workload === "page" ? 1 + variant % 2 : 0,
  };
}
export function reference(rows: Row[], query: Query): { rows: Row[]; count: number } {
  const result = query.query ? rows.filter((row) => row.name.toLowerCase().includes(query.query)) : rows.slice();
  if (query.descending !== null) {
    result.sort((left, right) => (query.descending ? right.value - left.value : left.value - right.value) || left.id - right.id);
  }
  return { rows: result.slice(query.page * pageSize, (query.page + 1) * pageSize), count: result.length };
}
