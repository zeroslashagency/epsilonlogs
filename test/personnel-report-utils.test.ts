import { describe, expect, it } from "vitest";
import { buildExcelWorkbook } from "../src/report/export-utils.js";
import {
  derivePersonnelOptions,
  filterLogsByPersonnel,
  filterWoDetailsMapByPersonnel,
  formatMachineScopeLabel,
} from "../src/report/personnel-report-utils.js";
import type {
  DeviceLogEntry,
  ReportRow,
  ReportStats,
  WoDetails,
} from "../src/report/report-types.js";

function makeWoDetails(overrides: Partial<WoDetails> = {}): WoDetails {
  return {
    id: 301,
    pcl: 700,
    start_time: "2026-03-11T06:00:00Z",
    end_time: "2026-03-11T07:00:00Z",
    start_uid: 12,
    stop_uid: 12,
    extensions: [],
    wo_id_str: "301",
    part_no: "PART-01",
    start_name: "Ramesh Kumar",
    stop_name: "Ramesh Kumar",
    start_comment: "",
    stop_comment: "",
    setting: "SET-1",
    alloted_qty: 20,
    ok_qty: 18,
    reject_qty: 2,
    device_id: 15,
    duration: 3600,
    ...overrides,
  };
}

function makeLog(overrides: Partial<DeviceLogEntry> = {}): DeviceLogEntry {
  return {
    log_id: 1,
    log_time: "2026-03-11T06:00:00Z",
    action: "WO_START",
    wo_id: 301,
    device_id: 15,
    uid: 12,
    start_name: "Ramesh Kumar",
    ...overrides,
  };
}

function makeStats(): ReportStats {
  return {
    totalJobs: 1,
    totalCycles: 2,
    totalCuttingSec: 120,
    totalPauseSec: 30,
    totalLoadingUnloadingSec: 10,
    totalIdleSec: 0,
    totalWoDurationSec: 180,
    machineUtilization: 67,
    totalAllotedQty: 20,
    totalOkQty: 18,
    totalRejectQty: 2,
    totalLogs: 4,
    woBreakdowns: [
      {
        woId: "301",
        partNo: "PART-01",
        operator: "Ramesh Kumar",
        setting: "SET-1",
        jobs: 1,
        cycles: 2,
        cuttingSec: 120,
        pauseSec: 30,
        loadingSec: 10,
        allotedQty: 20,
        okQty: 18,
        rejectQty: 2,
        pcl: 700,
        avgCycleSec: 60,
        startTime: "11-03-2026 06:00",
        endTime: "11-03-2026 07:00",
        durationSec: 3600,
      },
    ],
    operatorSummaries: [
      {
        name: "Ramesh Kumar",
        woCount: 1,
        totalJobs: 1,
        totalCycles: 2,
        totalCuttingSec: 120,
        totalPauseSec: 30,
        avgCycleSec: 60,
      },
    ],
  };
}

function makeRow(overrides: Partial<ReportRow> = {}): ReportRow {
  const logTime = new Date("2026-03-11T06:00:00Z");
  return {
    rowId: "row-1",
    logId: 1,
    sNo: 1,
    logTime,
    action: "WO_START",
    jobType: "Production",
    operatorName: "Ramesh Kumar",
    timestamp: logTime.getTime(),
    originalLog: makeLog(),
    ...overrides,
  };
}

describe("personnel report utilities", () => {
  it("derives unique personnel options across WO details and logs", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [301, makeWoDetails()],
      [302, makeWoDetails({ id: 302, wo_id_str: "302", start_uid: null, start_name: "Arun Prasad", device_id: 19 })],
    ]);
    const arunLog = makeLog({
      log_id: 2,
      wo_id: 302,
      device_id: 19,
      start_name: "Arun Prasad",
    });
    delete arunLog.uid;
    const logs = [
      makeLog(),
      arunLog,
      makeLog({ log_id: 3, wo_id: 301, device_id: 15, uid: 12, start_name: "Ramesh Kumar" }),
    ];

    const options = derivePersonnelOptions(woDetailsMap, logs);

    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      name: "Arun Prasad",
      uid: null,
      woIds: [302],
      deviceIds: [19],
    });
    expect(options[1]).toMatchObject({
      name: "Ramesh Kumar",
      uid: 12,
      woIds: [301],
      deviceIds: [15],
    });
  });

  it("filters logs and WO details for one selected person", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [301, makeWoDetails()],
      [302, makeWoDetails({ id: 302, wo_id_str: "302", start_uid: 18, start_name: "Arun Prasad", device_id: 19 })],
    ]);
    const selected = derivePersonnelOptions(woDetailsMap, [makeLog()]).find(
      (option) => option.name === "Ramesh Kumar",
    );

    expect(selected).toBeTruthy();

    const filteredDetails = filterWoDetailsMapByPersonnel(woDetailsMap, selected!);
    const filteredLogs = filterLogsByPersonnel(
      [
        makeLog(),
        makeLog({ log_id: 2, wo_id: 302, device_id: 19, uid: 18, start_name: "Arun Prasad" }),
      ],
      woDetailsMap,
      selected!,
    );

    expect(Array.from(filteredDetails.keys())).toEqual([301]);
    expect(filteredLogs).toHaveLength(1);
    expect(filteredLogs[0]?.wo_id).toBe(301);
  });

  it("formats multi-machine scope label with device names", () => {
    const label = formatMachineScopeLabel(
      [15, 19],
      new Map([
        [15, "VMC-15"],
        [19, "VMC-19"],
      ]),
    );

    expect(label).toBe("VMC-15 (15), VMC-19 (19)");
  });
});

describe("personnel export metadata", () => {
  it("writes the custom analysis title and multi-machine scope label", async () => {
    const workbook = await buildExcelWorkbook({
      rows: [makeRow()],
      stats: makeStats(),
      woDetailsMap: new Map([[301, makeWoDetails()]]),
      deviceNameMap: new Map([
        [15, "VMC-15"],
        [19, "VMC-19"],
      ]),
      analysisTitle: "Personnel Logs Analysis",
      reportConfig: {
        startDate: "11-03-2026 06:00",
        endDate: "11-03-2026 18:00",
        deviceIds: [15, 19],
        scopeLabel: "VMC-15 (15), VMC-19 (19)",
      },
    });

    const analysisSheet = workbook.getWorksheet("Analysis");

    expect(String(analysisSheet?.getCell("A1").value ?? "")).toBe(
      "Personnel Logs Analysis",
    );
    expect(String(analysisSheet?.getCell("B4").value ?? "")).toBe(
      "VMC-15 (15), VMC-19 (19)",
    );
  });
});
