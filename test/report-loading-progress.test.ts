import { describe, expect, it } from "vitest";

import {
  REPORT_PROGRESS_STAGES,
  clampProgress,
  getStageProgress,
} from "../src/report/loading-progress";

describe("report loading progress", () => {
  it("clamps raw progress values into a valid percentage", () => {
    expect(clampProgress(-10)).toBe(0);
    expect(clampProgress(42.5)).toBe(42.5);
    expect(clampProgress(180)).toBe(100);
  });

  it("keeps stage progress monotonic across the report pipeline", () => {
    const checkpoints = [
      getStageProgress("logs", 0),
      getStageProgress("logs", 1),
      getStageProgress("details", 0),
      getStageProgress("details", 1),
      getStageProgress("filter", 0),
      getStageProgress("filter", 1),
      getStageProgress("build", 0),
      getStageProgress("build", 1),
      getStageProgress("overlaps", 0),
      getStageProgress("overlaps", 1),
      getStageProgress("finalize", 1),
    ];

    expect(checkpoints).toEqual([...checkpoints].sort((left, right) => left - right));
    expect(checkpoints.at(-1)).toBe(100);
  });

  it("respects stage boundaries when mapping partial ratios", () => {
    const halfLogs = getStageProgress("logs", 0.5);
    const halfDetails = getStageProgress("details", 0.5);

    expect(halfLogs).toBe(REPORT_PROGRESS_STAGES.logs.start + 30);
    expect(halfDetails).toBe(REPORT_PROGRESS_STAGES.details.start + 12.5);
    expect(getStageProgress("finalize", 5)).toBe(100);
  });
});
