import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/report-builder";
import type { DeviceLogEntry, ReportConfig, WoDetails } from "../src/report/report-types";

const config: ReportConfig = {
  deviceId: 15,
  startDate: "09-02-2026 08:00",
  endDate: "09-02-2026 09:00",
  toleranceSec: 10,
};

function makeLog(
  log_id: number,
  isoTime: string,
  action: string,
  wo_id: unknown,
  overrides: Partial<DeviceLogEntry> = {},
): DeviceLogEntry {
  return {
    log_id,
    log_time: isoTime,
    action,
    wo_id: wo_id as number,
    device_id: 15,
    ...overrides,
  } as DeviceLogEntry;
}

function makeDetails(overrides: Partial<WoDetails> = {}): WoDetails {
  return {
    id: 3008,
    pcl: 120,
    start_time: "2026-02-09T08:00:00Z",
    end_time: "2026-02-09T08:10:00Z",
    start_uid: 1,
    stop_uid: 1,
    extensions: [],
    wo_id_str: "3008",
    part_no: "LH-063",
    start_name: "ATHUL",
    stop_name: "ATHUL",
    start_comment: "Started",
    stop_comment: "Completed",
    setting: "SETTING -1",
    alloted_qty: 10,
    ok_qty: 4,
    reject_qty: 0,
    device_id: 15,
    duration: 600,
    ...overrides,
  };
}

describe("report pipeline regressions", () => {
  it("canonicalizes mixed wo_id types so one WO stays in one segment", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, "2026-02-09T08:00:00Z", "WO_START", "3008", { job_type: 1 }),
      makeLog(2, "2026-02-09T08:00:10Z", "SPINDLE_ON", 3008),
      makeLog(3, "2026-02-09T08:01:10Z", "SPINDLE_OFF", 3008),
      makeLog(4, "2026-02-09T08:02:00Z", "WO_STOP", 3008),
    ];

    const woDetailsMap = new Map<number, WoDetails>([[3008, makeDetails()]]);
    const report = buildReport(logs, woDetailsMap, config);

    expect(report.stats.woBreakdowns).toHaveLength(1);
    expect(report.stats.woBreakdowns[0]?.woId).toBe("3008");
    expect(report.stats.woBreakdowns[0]?.operator).toBe("ATHUL");
  });

  it("continues job numbering across multiple segments of the same WO", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, "2026-02-09T08:00:00Z", "WO_START", 3008, { job_type: 1 }),
      makeLog(2, "2026-02-09T08:00:10Z", "SPINDLE_ON", 3008),
      makeLog(3, "2026-02-09T08:01:10Z", "SPINDLE_OFF", 3008),
      makeLog(4, "2026-02-09T08:02:00Z", "WO_STOP", 3008),
      makeLog(5, "2026-02-09T08:10:00Z", "WO_START", 3008, { job_type: 1 }),
      makeLog(6, "2026-02-09T08:10:10Z", "SPINDLE_ON", 3008),
      makeLog(7, "2026-02-09T08:11:10Z", "SPINDLE_OFF", 3008),
      makeLog(8, "2026-02-09T08:12:00Z", "WO_STOP", 3008),
    ];

    const woDetailsMap = new Map<number, WoDetails>([[3008, makeDetails({ ok_qty: 2 })]]);
    const report = buildReport(logs, woDetailsMap, config);

    const jobLabels = report.rows
      .filter((row) => row.action === "SPINDLE_ON")
      .map((row) => row.label);

    expect(jobLabels).toEqual(expect.arrayContaining(["JOB - 01", "JOB - 02"]));
    expect(jobLabels.filter((label) => label === "JOB - 01")).toHaveLength(1);
  });

  it("attaches boundary loading rows to the next job block", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, "2026-02-09T08:00:00Z", "WO_START", 3008, { job_type: 1 }),
      makeLog(2, "2026-02-09T08:00:10Z", "SPINDLE_ON", 3008),
      makeLog(3, "2026-02-09T08:01:10Z", "SPINDLE_OFF", 3008),
      makeLog(4, "2026-02-09T08:01:15Z", "SPINDLE_ON", 3008),
      makeLog(5, "2026-02-09T08:02:15Z", "SPINDLE_OFF", 3008),
      makeLog(6, "2026-02-09T08:02:27Z", "SPINDLE_ON", 3008),
      makeLog(7, "2026-02-09T08:03:27Z", "SPINDLE_OFF", 3008),
      makeLog(8, "2026-02-09T08:03:32Z", "SPINDLE_ON", 3008),
      makeLog(9, "2026-02-09T08:04:32Z", "SPINDLE_OFF", 3008),
      makeLog(10, "2026-02-09T08:04:40Z", "WO_STOP", 3008),
    ];

    const woDetailsMap = new Map<number, WoDetails>([[3008, makeDetails({ ok_qty: 4 })]]);
    const report = buildReport(logs, woDetailsMap, config);

    const boundaryGap = report.rows.find(
      (row) => row.isComputed && row.label === "Loading /Unloading Time" && row.durationSec === 12,
    );

    expect(boundaryGap?.jobBlockLabel).toBe("JOB - 02");
  });

  it("keeps duplicate SPINDLE_ON logs visible and pairs from the first ON", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, "2026-02-09T08:00:00Z", "WO_START", 3008, { job_type: 1 }),
      makeLog(2, "2026-02-09T08:00:10Z", "SPINDLE_ON", 3008),
      makeLog(3, "2026-02-09T08:01:10Z", "SPINDLE_ON", 3008),
      makeLog(4, "2026-02-09T08:03:10Z", "SPINDLE_OFF", 3008),
      makeLog(5, "2026-02-09T08:03:20Z", "WO_STOP", 3008),
    ];

    const woDetailsMap = new Map<number, WoDetails>([[3008, makeDetails({ ok_qty: 1 })]]);
    const report = buildReport(logs, woDetailsMap, config);
    const visibleLogIds = new Set(report.rows.map((row) => row.logId).filter((value): value is number => typeof value === "number"));

    expect(report.stats.totalCycles).toBe(1);
    expect(report.stats.totalCuttingSec).toBe(180);
    expect(visibleLogIds.has(2)).toBe(true);
    expect(visibleLogIds.has(3)).toBe(true);
    expect(visibleLogIds.has(4)).toBe(true);
  });

  it("keeps trailing unmatched SPINDLE_ON logs visible instead of dropping them", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, "2026-02-09T08:00:00Z", "WO_START", 3008, { job_type: 1 }),
      makeLog(2, "2026-02-09T08:00:10Z", "SPINDLE_ON", 3008),
      makeLog(3, "2026-02-09T08:01:00Z", "WO_STOP", 3008),
    ];

    const woDetailsMap = new Map<number, WoDetails>([[3008, makeDetails({ ok_qty: 0 })]]);
    const report = buildReport(logs, woDetailsMap, config);

    expect(report.stats.totalCycles).toBe(0);
    expect(report.rows.some((row) => row.logId === 2 && row.action === "SPINDLE_ON")).toBe(true);
  });
});
