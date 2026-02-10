import type { BaselineResolution } from "./types.js";

const DEFAULT_ROLLING_WINDOW = 20;

const sanitizeDurations = (durations: number[]): number[] =>
  durations.filter((value) => Number.isFinite(value) && value > 0);

export const median = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1];
    const right = sorted[middle];
    if (left === undefined || right === undefined) {
      return null;
    }
    return (left + right) / 2;
  }
  return sorted[middle] ?? null;
};

export interface ResolveBaselineInput {
  targetDurationSec: number | null;
  historyDurationsSec?: number[];
  defaultIdealSec?: number;
  rollingMedianWindow?: number;
}

export const resolveBaseline = ({
  targetDurationSec,
  historyDurationsSec = [],
  defaultIdealSec = 120,
  rollingMedianWindow = DEFAULT_ROLLING_WINDOW,
}: ResolveBaselineInput): BaselineResolution => {
  if (targetDurationSec !== null && targetDurationSec > 0) {
    return { source: "TARGET", idealCycleSec: targetDurationSec };
  }

  const sanitizedHistory = sanitizeDurations(historyDurationsSec);
  const windowed =
    sanitizedHistory.length > rollingMedianWindow
      ? sanitizedHistory.slice(-rollingMedianWindow)
      : sanitizedHistory;
  const historicalMedian = median(windowed);

  if (historicalMedian !== null) {
    return { source: "ROLLING_MEDIAN", idealCycleSec: historicalMedian };
  }

  return { source: "DEFAULT", idealCycleSec: defaultIdealSec };
};
