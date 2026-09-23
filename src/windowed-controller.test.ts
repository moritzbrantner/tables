import { afterEach, expect, it, vi } from "vitest";
import { createWindowedController } from "../examples/src/windowed-controller";
import { setTableQueryKernel } from "./query-kernel";

const rows = Array.from({ length: 20 }, (_, id) => ({ id, name: `Account ${id}`, value: id }));
const columns = [{ id: "name", accessor: "name" as const }, { id: "value", accessor: "value" as const }];
const initial = { offset: 0, query: "account", descending: true, reuse: true };
afterEach(() => setTableQueryKernel(null));

it("reuses one owned session, disposes replaced results, and supports effect cleanup/restart", () => {
  const dispose = vi.fn();
  const prepare = vi.fn(() => ({
    filteredRowCount: rows.length,
    queryWindow: ({ offset, limit }: { offset: number; limit: number }) => ({
      filteredRowCount: rows.length,
      sourceIndices: rows.map((row) => row.id).slice(offset, offset + limit),
    }), dispose,
  }));
  setTableQueryKernel({ queryTable: vi.fn(), prepareTableQuery: prepare });
  const controller = createWindowedController(rows, columns, 5);
  const first = controller.read(initial);
  const page = controller.read({ ...initial, offset: 5 });
  expect(page.model.rows).toEqual(rows.slice(5, 10));
  expect(page.revision).toBe(first.revision);
  expect(prepare).toHaveBeenCalledTimes(1);
  controller.read({ ...initial, query: "account 1" });
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(dispose).toHaveBeenCalledTimes(1);
  controller.dispose(); controller.dispose();
  expect(dispose).toHaveBeenCalledTimes(2);
  controller.read(initial);
  expect(prepare).toHaveBeenCalledTimes(3);
  controller.dispose();
  expect(dispose).toHaveBeenCalledTimes(3);
});

it("switches execution modes without changing ordered pages or full counts", () => {
  const controller = createWindowedController(rows, columns, 5);
  const prepared = controller.read({ ...initial, offset: 10 });
  const oneOff = controller.read({ ...initial, offset: 10, reuse: false });
  expect(oneOff.model).toEqual(prepared.model);
  const again = controller.read({ ...initial, offset: 10 });
  expect(again.model).toEqual(prepared.model);
  expect(again.revision).toBeGreaterThan(oneOff.revision);
  controller.dispose();
});
