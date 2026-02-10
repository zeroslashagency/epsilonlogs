import type { ClassifiedRow, FilterState } from "./types.js";

export const DEFAULT_FILTER_STATE: FilterState = {
  mode: "GOOD_ONLY",
  includeUnknown: false,
  includeBreakExtensions: false,
};

export const applyFilters = (
  rows: ClassifiedRow[],
  filterState: FilterState = DEFAULT_FILTER_STATE,
): ClassifiedRow[] => {
  return rows.filter((row) => {
    if (row.rowKind === "EXTENSION") {
      return filterState.includeBreakExtensions;
    }

    if (row.classification === "UNKNOWN") {
      return filterState.includeUnknown;
    }

    if (filterState.mode === "GOOD_ONLY") {
      return row.classification === "GOOD";
    }

    if (filterState.mode === "GOOD_WARNING") {
      return row.classification === "GOOD" || row.classification === "WARNING";
    }

    return true;
  });
};
