import { expect, test, type Page } from "@playwright/test";
import { getInitialSnapshot, getNextSnapshot } from "xstate";
import {
  edgeId,
  generateJourneyPaths,
  journeyEdges,
  pipelineJourney,
  visibleStates,
  stateName,
  type JourneySnapshot,
} from "./pipeline-journey.model";

const full = process.env.TABLES_MODEL_FULL === "1";
const paths = generateJourneyPaths(full);

async function assertVisibleState(page: Page, state: JourneySnapshot) {
  const expected = visibleStates[stateName(state)];
  const grid = page.getByRole("grid", { name: "Pipeline overview" });
  await expect(page.getByRole("searchbox", { name: "Search pipeline" })).toHaveValue(expected.query);
  // The grid exposes source row count/positions even when its view is filtered.
  await expect(grid).toHaveAttribute("aria-rowcount", "50001");
  if (expected.rowCount <= 2) {
    await expect(grid.getByRole("row")).toHaveCount(expected.rowCount);
  }
  await expect(grid.getByRole("button", {
    name: expected.sorted ? "Sort ID descending" : "Sort ID ascending",
    exact: true,
  })).toBeEnabled();
  if (expected.selected) {
    await expect(page.getByText("1 row selected", { exact: true })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Acme Robotics 0001" })).toBeVisible();
  } else {
    await expect(page.getByText("No rows selected.", { exact: true })).toBeVisible();
  }
  if (state.matches("empty")) {
    await expect(grid.getByRole("gridcell")).toHaveCount(0);
    await expect(page.getByText("No rows", { exact: true })).toBeVisible();
    expect(state.can({ type: "SELECT" })).toBe(false);
  } else {
    const row = grid.getByRole("row").nth(1);
    await expect(row).toContainText("PIPE-000001");
    await expect(row).toHaveAttribute("aria-selected", String(expected.selected));
  }
}

for (const input of ["keyboard", "touch"] as const) {
  test.describe(`generated pipeline journey (${input})`, () => {
    test.use(input === "touch"
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } });

    test(`bounded ${full ? "edge traversal" : "smoke"}`, async ({ page }, testInfo) => {
      test.setTimeout(full ? 180_000 : 60_000);
      const states = new Map<string, number>();
      const edges = new Map<string, number>();
      const completedPaths: string[] = [];
      try {
        for (const path of paths) {
          await test.step(path.name, async () => {
            await page.goto("/");
            let state = getInitialSnapshot(pipelineJourney);
            await assertVisibleState(page, state);
            states.set(stateName(state), (states.get(stateName(state)) ?? 0) + 1);
            for (const event of path.events) {
              await test.step(`${stateName(state)}: ${event.type}`, async () => {
                expect(state.can(event)).toBe(true);
                const next = getNextSnapshot(pipelineJourney, state, event);
                const search = page.getByRole("searchbox", { name: "Search pipeline" });
                const grid = page.getByRole("grid", { name: "Pipeline overview" });
                switch (event.type) {
                  case "RESET":
                    await page.goto("/");
                    break;
                  case "SEARCH":
                  case "MISS":
                  case "CLEAR_SEARCH":
                  case "REPEAT_SEARCH":
                    if (input === "touch") {
                      await search.tap();
                      await search.fill(visibleStates[stateName(next)].query);
                    } else {
                      await search.focus();
                      await page.keyboard.press("ControlOrMeta+A");
                      await page.keyboard.press("Backspace");
                      await page.keyboard.insertText(visibleStates[stateName(next)].query);
                    }
                    break;
                  case "SORT": {
                    const sort = grid.getByRole("button", { name: "Sort ID ascending", exact: true });
                    if (input === "touch") {
                      await sort.tap();
                    } else {
                      await sort.focus();
                      await page.keyboard.press("Enter");
                      await expect(grid.getByRole("button", { name: "Sort ID descending", exact: true })).toBeFocused();
                    }
                    break;
                  }
                  case "SELECT": {
                    const cell = grid.getByRole("gridcell", { name: "PIPE-000001", exact: true });
                    if (input === "touch") {
                      await cell.tap();
                    } else {
                      await cell.focus();
                      await page.keyboard.press("Space");
                      await expect(cell).toBeFocused();
                    }
                    break;
                  }
                  default:
                    throw new Error(`Missing browser action: ${event.type}`);
                }
                await assertVisibleState(page, next);
                const id = edgeId(stateName(state), event.type, stateName(next));
                edges.set(id, (edges.get(id) ?? 0) + 1);
                states.set(stateName(next), (states.get(stateName(next)) ?? 0) + 1);
                state = next;
              });
            }
            completedPaths.push(path.name);
          });
        }
        if (full) {
          expect(edges.size).toBe(journeyEdges.length);
        }
      } finally {
        const coverage = {
          mode: full ? "full-edges" : "smoke",
          input,
          plannedPaths: paths.length,
          completedPaths,
          states: Object.keys(visibleStates).sort().map((id) => ({ id, visits: states.get(id) ?? 0 })),
          edges: journeyEdges.map(({ source, event, target }) => edgeId(source, event.type, target))
            .sort().map((id) => ({ id, visits: edges.get(id) ?? 0 })),
          gaps: {
            states: Object.keys(visibleStates).filter((id) => !states.has(id)).sort(),
            edges: journeyEdges.map(({ source, event, target }) => edgeId(source, event.type, target))
              .filter((id) => !edges.has(id)).sort(),
          },
          blocked: [{ state: "empty", event: "SELECT", verified: states.has("empty") }],
        };
        console.log(`Pipeline coverage (${input}): ${JSON.stringify(coverage)}`);
        await testInfo.attach("pipeline-coverage.json", {
          body: JSON.stringify(coverage, null, 2),
          contentType: "application/json",
        });
      }
    });
  });
}
