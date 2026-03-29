import { describe, expect, it } from "vitest";
import { applyM30CompletionSignals } from "../src/report/m30-actions";
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
  wo_id: number,
  overrides: Partial<DeviceLogEntry> = {},
): DeviceLogEntry {
  return {
    log_id,
    log_time: isoTime,
    action,
    wo_id,
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
    ok_qty: 2,
    reject_qty: 0,
    device_id: 15,
    duration: 600,
    job_type: 1,
    ...overrides,
  };
}

describe("M30 completion signals", () => {
  it("collapses M30 bursts into hard job boundaries on supported machines", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, "2026-02-09T08:00:00Z", "WO_START", 3008, {
        job_type: 1,
        start_name: "ATHUL",
        wo_name: "3008",
      }),
      makeLog(2, "2026-02-09T08:00:10Z", "SPINDLE_ON", 3008, {
        job_type: 1,
        start_name: "ATHUL",
        wo_name: "3008",
      }),
      makeLog(3, "2026-02-09T08:01:10Z", "M30_CHANGED_0", 0),
      makeLog(4, "2026-02-09T08:01:12Z", "M30_CHANGED_0", 0),
      makeLog(5, "2026-02-09T08:02:00Z", "SPINDLE_ON", 3008, {
        job_type: 1,
        start_name: "ATHUL",
        wo_name: "3008",
      }),
      makeLog(6, "2026-02-09T08:03:00Z", "M30_CHANGED_0", 0),
      makeLog(7, "2026-02-09T08:03:04Z", "M30_CHANGED_0", 0),
      makeLog(8, "2026-02-09T08:04:00Z", "WO_STOP", 3008, {
        job_type: 1,
        start_name: "ATHUL",
        wo_name: "3008",
      }),
    ];

    const transformedLogs = applyM30CompletionSignals(logs);
    const syntheticOffLogs = transformedLogs.filter(
      (log) => log.action === "SPINDLE_OFF" && log.completionSource === "M30",
    );

    expect(syntheticOffLogs).toHaveLength(2);
    expect(syntheticOffLogs[0]?.log_time).toBe("2026-02-09T08:01:10Z");
    expect(syntheticOffLogs[0]?.wo_id).toBe(3008);
    expect(syntheticOffLogs[0]?.m30BurstCount).toBe(2);
    expect(syntheticOffLogs[1]?.log_time).toBe("2026-02-09T08:03:00Z");

    const report = buildReport(
      logs,
      new Map<number, WoDetails>([[3008, makeDetails()]]),
      config,
    );

    const completedRows = report.rows.filter(
      (row) => row.displayAction === "M30_CHANGED",
    );
    const loadingRow = report.rows.find(
      (row) =>
        row.isComputed
        && row.label === "Loading /Unloading Time"
        && row.durationSec === 50,
    );
    const jobLabels = report.rows
      .filter((row) => row.action === "SPINDLE_ON")
      .map((row) => row.label);

    expect(report.stats.totalCycles).toBe(2);
    expect(completedRows).toHaveLength(2);
    expect(jobLabels).toEqual(expect.arrayContaining(["JOB - 01", "JOB - 02"]));
    expect(loadingRow?.jobBlockLabel).toBe("JOB - 02");
  });

  it("does not synthesize M30 completions for unsupported machines", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, "2026-02-09T08:00:00Z", "WO_START", 3008, {
        device_id: 11,
        job_type: 1,
        start_name: "ATHUL",
      }),
      makeLog(2, "2026-02-09T08:00:10Z", "SPINDLE_ON", 3008, {
        device_id: 11,
        job_type: 1,
      }),
      makeLog(3, "2026-02-09T08:01:10Z", "M30_CHANGED_0", 0, {
        device_id: 11,
      }),
      makeLog(4, "2026-02-09T08:01:12Z", "M30_CHANGED_0", 0, {
        device_id: 11,
      }),
    ];

    const transformedLogs = applyM30CompletionSignals(logs);
    expect(
      transformedLogs.some((log) => log.action === "SPINDLE_OFF" && log.completionSource === "M30"),
    ).toBe(false);
  });

  it("ignores M30 bursts when no production spindle cycle is open", () => {
    const logs: DeviceLogEntry[] = [
      makeLog(1, "2026-02-09T08:00:00Z", "MTR_ON", 348, {
        job_type: 4,
        start_name: "BABU",
        wo_name: "2251",
      }),
      makeLog(2, "2026-02-09T08:00:20Z", "M30_CHANGED_0", 0),
      makeLog(3, "2026-02-09T08:00:24Z", "M30_CHANGED_0", 0),
      makeLog(4, "2026-02-09T08:01:00Z", "MTR_OFF", 348, {
        job_type: 4,
        start_name: "BABU",
        wo_name: "2251",
      }),
    ];

    const transformedLogs = applyM30CompletionSignals(logs);
    expect(
      transformedLogs.some((log) => log.action === "SPINDLE_OFF" && log.completionSource === "M30"),
    ).toBe(false);
  });
});
