import { describe, expect, it } from "vitest";
import { formatDateForApi } from "../src/report/api-client";
import type {
  DeviceLogEntry,
  ReportRow,
  WoDetails,
} from "../src/report/report-types";
import {
  buildWoFetchConfig,
  buildWoFilename,
  compareDashboardMachineOrder,
  collectUniqueOriginalLogs,
  mergeMachineIds,
  parseManualMachineId,
  selectPreferredCardsPerMachine,
} from "../src/hub-v2/wo-report-utils";

function makeLog(overrides: Partial<DeviceLogEntry> = {}): DeviceLogEntry {
  return {
    log_id: 100,
    log_time: "2026-03-15T08:00:00Z",
    action: "WO_START",
    wo_id: 2893,
    device_id: 15,
    ...overrides,
  };
}

function makeRow(overrides: Partial<ReportRow> = {}): ReportRow {
  const logTime = new Date("2026-03-15T08:00:00Z");
  return {
    rowId: "row-1",
    logId: 100,
    logTime,
    jobType: "Production",
    timestamp: logTime.getTime(),
    originalLog: makeLog(),
    ...overrides,
  };
}

function makeDetails(overrides: Partial<WoDetails> = {}): WoDetails {
  return {
    id: 2893,
    pcl: 840,
    start_time: "2026-03-15T08:00:00Z",
    end_time: "2026-03-15T09:20:00Z",
    start_uid: 11,
    stop_uid: 11,
    extensions: [],
    wo_id_str: "2893",
    part_no: "PART-2893",
    start_name: "Athul",
    stop_name: "Athul",
    start_comment: "",
    stop_comment: "",
    setting: "SET-1",
    alloted_qty: 10,
    ok_qty: 8,
    reject_qty: 2,
    device_id: 19,
    duration: 4800,
    ...overrides,
  };
}

describe("wo report utils", () => {
  it("merges dashboard machine ids without duplicates", () => {
    expect(mergeMachineIds([15, 16, 17], [17, 19, 21])).toEqual([
      15,
      16,
      17,
      19,
      21,
    ]);
  });

  it("parses manual machine ids", () => {
    expect(parseManualMachineId(" 19 ")).toBe(19);
    expect(parseManualMachineId("machine-19")).toBeNull();
    expect(parseManualMachineId("0")).toBeNull();
  });

  it("sorts machines in dashboard display order", () => {
    const orderedMachineIds = [11, 12, 13, 14, 15, 16, 19, 18] as const;
    const machineIds = [16, 12, 18, 13, 11, null, 29];

    const sorted = [...machineIds].sort((left, right) =>
      compareDashboardMachineOrder(left, right, orderedMachineIds),
    );

    expect(sorted).toEqual([11, 12, 13, 16, 18, 29, null]);
  });

  it("keeps only the best current card for each machine", () => {
    const cards = [
      {
        woId: "2982",
        machineId: 16,
        latestTimestamp: 100,
        executionStatus: "LIVE",
      },
      {
        woId: "2770",
        machineId: 16,
        latestTimestamp: 200,
        executionStatus: "COMPLETE",
      },
      {
        woId: "3012",
        machineId: 12,
        latestTimestamp: 150,
        executionStatus: "LIVE",
      },
    ];

    const selected = selectPreferredCardsPerMachine(cards, {
      LIVE: 0,
      PROCESSING: 1,
      COMPLETE: 2,
    });

    expect(selected).toEqual([
      {
        woId: "2982",
        machineId: 16,
        latestTimestamp: 100,
        executionStatus: "LIVE",
      },
      {
        woId: "3012",
        machineId: 12,
        latestTimestamp: 150,
        executionStatus: "LIVE",
      },
    ]);
  });

  it("collects unique original logs in ascending order", () => {
    const rows: ReportRow[] = [
      makeRow({
        rowId: "row-2",
        logId: 101,
        timestamp: new Date("2026-03-15T08:10:00Z").getTime(),
        originalLog: makeLog({
          log_id: 101,
          log_time: "2026-03-15T08:10:00Z",
        }),
      }),
      makeRow(),
      makeRow({ rowId: "row-3" }),
    ];

    expect(collectUniqueOriginalLogs(rows).map((log) => log.log_id)).toEqual([
      100,
      101,
    ]);
  });

  it("builds a WO fetch config from WO details", () => {
    const config = buildWoFetchConfig({
      woDetails: makeDetails(),
      fallbackLogs: [],
      fallbackDeviceId: 15,
    });

    expect(config).toEqual({
      deviceId: 19,
      startDate: formatDateForApi(new Date("2026-03-15T08:00:00Z")),
      endDate: formatDateForApi(new Date("2026-03-15T09:20:00Z")),
      toleranceSec: 10,
    });
  });

  it("falls back to dashboard logs when WO details are partial", () => {
    const config = buildWoFetchConfig({
      woDetails: makeDetails({ start_time: null, end_time: null, device_id: 0 }),
      fallbackLogs: [
        makeLog(),
        makeLog({
          log_id: 102,
          action: "WO_STOP",
          log_time: "2026-03-15T08:45:00Z",
          device_id: 15,
        }),
      ],
    });

    expect(config).toEqual({
      deviceId: 15,
      startDate: formatDateForApi(new Date("2026-03-15T08:00:00Z")),
      endDate: formatDateForApi(new Date("2026-03-15T08:45:00Z")),
      toleranceSec: 10,
    });
  });

  it("builds stable filenames for dashboard exports", () => {
    expect(buildWoFilename("2893", "xlsx")).toBe("wo_2893.xlsx");
    expect(buildWoFilename("WO 2893 / A", "xlsx", { grouped: true })).toBe(
      "wo_WO_2893_A_grouped.xlsx",
    );
    expect(buildWoFilename("WO 2893 / A", "pdf")).toBe("wo_WO_2893_A.pdf");
  });
});
