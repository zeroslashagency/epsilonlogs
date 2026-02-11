import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/report-builder";
import {
  applyReportV2Filters,
  classifyCycleDuration,
  DEFAULT_REPORT_V2_FILTER_STATE,
  ReportV2FilterState,
} from "../src/report/report-builder-v2";
import type { DeviceLogEntry, ReportConfig, ReportRow, WoDetails } from "../src/report/report-types";

const makeLog = (
  log_id: number,
  offsetSec: number,
  action: DeviceLogEntry["action"],
  wo_id = 900,
): DeviceLogEntry => {
  const base = new Date("2026-02-09T08:00:00Z").getTime();
  return {
    log_id,
    log_time: new Date(base + offsetSec * 1000).toISOString(),
    action,
    wo_id,
    device_id: 15,
  };
};

const makeDetails = (): WoDetails => ({
  id: 900,
  pcl: null,
  start_time: "2026-02-09T08:00:00Z",
  end_time: null,
  start_uid: 1,
  stop_uid: null,
  extensions: [],
  wo_id_str: "900",
  part_no: "PART-X",
  start_name: "Operator",
  stop_name: "Operator",
  start_comment: "",
  stop_comment: "",
  setting: "A",
  alloted_qty: 1,
  ok_qty: 1,
  reject_qty: 0,
  device_id: 15,
  duration: 2400,
});

const makeConfig = (): ReportConfig => ({
  deviceId: 15,
  startDate: "09-02-2026 08:00",
  endDate: "09-02-2026 09:00",
  toleranceSec: 10,
});

describe("report builder numeric duration aggregation", () => {
  it("computes loading and idle totals from durationSec, not duration text parsing", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, 0, "WO_START"),
      makeLog(2, 10, "SPINDLE_ON"),
      makeLog(3, 70, "SPINDLE_OFF"),
      makeLog(4, 130, "SPINDLE_ON"),
      makeLog(5, 190, "SPINDLE_OFF"),
      makeLog(6, 1190, "SPINDLE_ON"),
      makeLog(7, 1250, "SPINDLE_OFF"),
    ];

    const detailsMap = new Map<number, WoDetails>([[900, makeDetails()]]);
    const { stats } = buildReport(logs, detailsMap, makeConfig());

    expect(stats.totalLoadingUnloadingSec).toBe(60);
    expect(stats.totalIdleSec).toBe(1000);
  });
});

describe("cycle classification boundaries", () => {
  it("marks exact green boundaries as GOOD", () => {
    expect(classifyCycleDuration(108, 120).classification).toBe("GOOD");
    expect(classifyCycleDuration(132, 120).classification).toBe("GOOD");
  });

  it("marks inner warning range as WARNING", () => {
    expect(classifyCycleDuration(100, 120).classification).toBe("WARNING");
    expect(classifyCycleDuration(140, 120).classification).toBe("WARNING");
  });

  it("marks outside warning range as BAD", () => {
    expect(classifyCycleDuration(220, 120).classification).toBe("BAD");
  });
});

describe("report v2 filters", () => {
  const rows: ReportRow[] = [
    {
      rowId: "good",
      logTime: new Date("2026-02-09T08:00:00Z"),
      action: "SPINDLE_OFF",
      durationSec: 120,
      jobType: "Production",
      timestamp: 1,
      classification: "GOOD",
    },
    {
      rowId: "warning",
      logTime: new Date("2026-02-09T08:01:00Z"),
      action: "SPINDLE_OFF",
      durationSec: 150,
      jobType: "Production",
      timestamp: 2,
      classification: "WARNING",
    },
    {
      rowId: "bad",
      logTime: new Date("2026-02-09T08:02:00Z"),
      action: "SPINDLE_OFF",
      durationSec: 220,
      jobType: "Production",
      timestamp: 3,
      classification: "BAD",
    },
    {
      rowId: "unknown",
      logTime: new Date("2026-02-09T08:03:00Z"),
      action: "WO_START",
      jobType: "Production",
      timestamp: 4,
      classification: "UNKNOWN",
    },
    {
      rowId: "break",
      logTime: new Date("2026-02-09T08:04:00Z"),
      action: "WO_PAUSE",
      jobType: "Production",
      timestamp: 5,
      classification: "UNKNOWN",
      isPauseBanner: true,
    },
  ];

  it("defaults to Good Only", () => {
    const filtered = applyReportV2Filters(rows, DEFAULT_REPORT_V2_FILTER_STATE);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.rowId).toBe("good");
  });

  it("supports Good + Warning mode", () => {
    const mode: ReportV2FilterState = {
      mode: "GOOD_WARNING",
      includeUnknown: false,
      includeBreakExtensions: false,
    };

    const filtered = applyReportV2Filters(rows, mode);
    expect(filtered.map((row) => row.rowId)).toEqual(["good", "warning"]);
  });

  it("gates unknown and break rows via toggles", () => {
    const withoutBreaks: ReportV2FilterState = {
      mode: "ALL",
      includeUnknown: true,
      includeBreakExtensions: false,
    };

    const withBreaks: ReportV2FilterState = {
      ...withoutBreaks,
      includeBreakExtensions: true,
    };

    expect(applyReportV2Filters(rows, withoutBreaks).map((row) => row.rowId)).toEqual([
      "good",
      "warning",
      "bad",
      "unknown",
    ]);

    expect(applyReportV2Filters(rows, withBreaks).map((row) => row.rowId)).toEqual([
      "good",
      "warning",
      "bad",
      "unknown",
      "break",
    ]);
  });
});
