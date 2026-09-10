import {
  decodeTableViewState,
  encodeTableViewState,
  type TableViewState,
} from "@moritzbrantner/tables/view-state";

const state: TableViewState = decodeTableViewState(null);
const encoded: string = encodeTableViewState(state);

void encoded;
