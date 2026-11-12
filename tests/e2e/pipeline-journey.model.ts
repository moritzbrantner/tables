import { getShortestPaths } from "@xstate/graph";
import { createMachine, getNextSnapshot } from "xstate";

// A browser oracle: deliberately no TableState, query helpers or fixture imports.
export const pipelineJourney = createMachine({
  id: "pipeline",
  initial: "all",
  states: {
    all: { on: { SEARCH: "match", RESET: "all" } },
    match: { on: { REPEAT_SEARCH: "match", SORT: "sorted", RESET: "all" } },
    sorted: { on: { REPEAT_SEARCH: "sorted", SELECT: "selected", RESET: "all" } },
    selected: { on: { REPEAT_SEARCH: "selected", MISS: "empty", RESET: "all" } },
    // SELECT is blocked here: no result row exists to act on.
    empty: { on: { REPEAT_SEARCH: "empty", CLEAR_SEARCH: "recovered", RESET: "all" } },
    recovered: { on: { REPEAT_SEARCH: "recovered", RESET: "all" } },
  },
});

export const visibleStates = {
  all: { query: "", rowCount: 50001, sorted: false, selected: false },
  match: { query: "PIPE-000001", rowCount: 2, sorted: false, selected: false },
  sorted: { query: "PIPE-000001", rowCount: 2, sorted: true, selected: false },
  selected: { query: "PIPE-000001", rowCount: 2, sorted: true, selected: true },
  empty: { query: "no-such-pipeline-row", rowCount: 1, sorted: true, selected: true },
  recovered: { query: "", rowCount: 50001, sorted: true, selected: true },
};

export function stateName(state: { value: unknown }) {
  switch (state.value) {
    case "all":
    case "match":
    case "sorted":
    case "selected":
    case "empty":
    case "recovered":
      return state.value;
    default:
      throw new Error(`Unknown pipeline state: ${JSON.stringify(state.value)}`);
  }
}

const shortest = getShortestPaths(pipelineJourney, { limit: 100 });
export type JourneySnapshot = (typeof shortest)[number]["state"];
export type JourneyEvent = { type: string };
export type JourneyPath = { name: string; events: JourneyEvent[] };

export const journeyEdges = shortest.flatMap(({ state }) =>
  Object.keys(pipelineJourney.states[stateName(state)].on).map((type) => ({
    source: stateName(state),
    event: { type },
    target: stateName(getNextSnapshot(pipelineJourney, state, { type })),
  })),
);

export function edgeId(source: string, event: string, target: string): string {
  return `${source} --${event}--> ${target}`;
}

export function generateJourneyPaths(full: boolean): JourneyPath[] {
  if (full) {
    // A shortest prefix plus each outgoing edge covers cycles and self-loops.
    // Repeating self-loops twice also checks idempotent/repeated actions.
    return shortest.flatMap((path) =>
      journeyEdges.filter((edge) => edge.source === stateName(path.state)).map((edge) => ({
        name: edgeId(edge.source, edge.event.type, edge.target),
        events: [
          ...path.steps.filter((step) => step.event.type !== "xstate.init").map((step) => step.event),
          edge.event,
          ...(edge.source === edge.target ? [edge.event] : []),
        ],
      })),
    );
  }

  const path = shortest.find(({ state }) => state.matches("recovered"));
  if (!path) {
    throw new Error("Pipeline recovery must be reachable");
  }
  return [{
    name: "generated recovery path with repeated search and reset",
    events: path.steps.flatMap((step) => {
      if (step.event.type === "xstate.init") {
        return [];
      }
      const repeat = pipelineJourney.states[stateName(step.state)].on.REPEAT_SEARCH;
      return [step.event, ...(repeat ? [{ type: "REPEAT_SEARCH" }, { type: "REPEAT_SEARCH" }] : [])];
    }).concat({ type: "RESET" }),
  }];
}
