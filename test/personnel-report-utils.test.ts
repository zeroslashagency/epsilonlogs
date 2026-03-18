import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExcelWorkbook } from "../src/report/export-utils.js";
import {
  buildPersonnelOverlapCompareWindows,
  buildPersonnelOverlapLogWindows,
  detectPersonnelMachineOverlaps,
  derivePersonnelOptions,
  fetchRecentLogsForDevices,
  filterLogsByPersonnel,
  filterWoDetailsMapByPersonnel,
  formatMachineScopeLabel,
  groupPersonnelMergedRows,
  resolvePersonnelReportDeviceIds,
  summarizePersonnelActivity,
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
        deviceId: 15,
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it("narrows report generation to the selected person's machines when possible", () => {
    expect(resolvePersonnelReportDeviceIds([11, 12, 13, 14, 15, 16, 19, 18], [11, 14, 18])).toEqual([
      11,
      14,
      18,
    ]);

    expect(resolvePersonnelReportDeviceIds([11, 12], [18, 19])).toEqual([11, 12]);
  });

  it("summarizes personnel activity in a single pass", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [301, makeWoDetails()],
      [
        302,
        makeWoDetails({
          id: 302,
          wo_id_str: "302",
          start_uid: 18,
          start_name: "Arun Prasad",
          device_id: 19,
        }),
      ],
    ]);

    const summary = summarizePersonnelActivity(
      [
        makeLog(),
        makeLog({
          log_id: 2,
          log_time: "2026-03-11T06:05:00Z",
          wo_id: 301,
        }),
        makeLog({
          log_id: 3,
          log_time: "2026-03-11T07:00:00Z",
          wo_id: 302,
          device_id: 19,
          uid: 18,
          start_name: "Arun Prasad",
        }),
      ],
      woDetailsMap,
    );

    expect(summary.get("uid:12")).toEqual({
      logCount: 2,
      latestLogTime: "2026-03-11T06:05:00Z",
    });
    expect(summary.get("uid:18")).toEqual({
      logCount: 1,
      latestLogTime: "2026-03-11T07:00:00Z",
    });
  });

  it("fetches only recent pages for the personnel picker", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input), "https://app.epsilonengg.in");
      const page = Number(url.searchParams.get("page"));

      if (page === 1) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: {
              logs: [makeLog({ log_id: 101, device_id: Number(url.searchParams.get("device_id")) })],
              pagination: { total_pages: 5, total_items: 5, current_page: 1 },
            },
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          success: true,
          result: {
            logs: [
              makeLog({
                log_id: page,
                device_id: Number(url.searchParams.get("device_id")),
              }),
            ],
            pagination: { total_pages: 5, total_items: 5, current_page: page },
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const logs = await fetchRecentLogsForDevices(
      [15, 19],
      {
        startDate: "11-03-2026 06:00",
        endDate: "11-03-2026 18:00",
        toleranceSec: 10,
      },
      "token",
      undefined,
      2,
    );

    const pages = fetchMock.mock.calls.map(([input]) => {
      const url = new URL(String(input), "https://app.epsilonengg.in");
      return `${url.searchParams.get("device_id")}:${url.searchParams.get("page")}`;
    });

    expect(pages).toEqual(["15:1", "19:1", "15:4", "15:5", "19:4", "19:5"]);
    expect(logs.map((log) => `${log.device_id}:${log.log_id}`)).toEqual([
      "15:4",
      "15:5",
      "19:4",
      "19:5",
    ]);
  });

  it("detects simultaneous work on two machines for one person", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [
        301,
        makeWoDetails({
          id: 301,
          wo_id_str: "301",
          device_id: 11,
          job_type: 1,
          start_time: "2026-03-11T10:00:00Z",
          end_time: "2026-03-11T11:00:00Z",
          start_uid: 12,
          start_name: "Ramesh Kumar",
        }),
      ],
      [
        302,
        makeWoDetails({
          id: 302,
          wo_id_str: "302",
          device_id: 14,
          job_type: 2,
          start_time: "2026-03-11T10:20:00Z",
          end_time: "2026-03-11T10:50:00Z",
          start_uid: 12,
          start_name: "Ramesh Kumar",
        }),
      ],
    ]);

    const overlaps = detectPersonnelMachineOverlaps(
      [
        makeLog({
          log_id: 1,
          wo_id: 301,
          device_id: 11,
          log_time: "2026-03-11T10:55:00Z",
          uid: 12,
          start_name: "Ramesh Kumar",
        }),
        makeLog({
          log_id: 2,
          wo_id: 302,
          device_id: 14,
          log_time: "2026-03-11T10:45:00Z",
          uid: 12,
          start_name: "Ramesh Kumar",
        }),
      ],
      woDetailsMap,
    );

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({
      overlapStart: "2026-03-11T10:20:00.000Z",
      overlapEnd: "2026-03-11T10:50:00.000Z",
      overlapDurationSec: 1800,
      left: {
        deviceId: 11,
        woId: 301,
        jobType: "Production",
      },
      right: {
        deviceId: 14,
        woId: 302,
        jobType: "Setting",
      },
    });
  });

  it("does not report overlaps for sequential machine work", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [
        301,
        makeWoDetails({
          id: 301,
          wo_id_str: "301",
          device_id: 11,
          start_time: "2026-03-11T08:00:00Z",
          end_time: "2026-03-11T09:00:00Z",
          start_uid: 12,
          start_name: "Ramesh Kumar",
        }),
      ],
      [
        302,
        makeWoDetails({
          id: 302,
          wo_id_str: "302",
          device_id: 14,
          start_time: "2026-03-11T09:15:00Z",
          end_time: "2026-03-11T10:00:00Z",
          start_uid: 12,
          start_name: "Ramesh Kumar",
        }),
      ],
    ]);

    const overlaps = detectPersonnelMachineOverlaps(
      [
        makeLog({ log_id: 1, wo_id: 301, device_id: 11 }),
        makeLog({ log_id: 2, wo_id: 302, device_id: 14, log_time: "2026-03-11T09:30:00Z" }),
      ],
      woDetailsMap,
    );

    expect(overlaps).toEqual([]);
  });

  it("falls back to log timestamps when WO times are missing", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [
        301,
        makeWoDetails({
          id: 301,
          wo_id_str: "301",
          device_id: 15,
          start_time: null,
          end_time: null,
          start_uid: 12,
          start_name: "Ramesh Kumar",
        }),
      ],
      [
        302,
        makeWoDetails({
          id: 302,
          wo_id_str: "302",
          device_id: 16,
          start_time: "2026-03-11T10:20:00Z",
          end_time: "2026-03-11T10:50:00Z",
          start_uid: 12,
          start_name: "Ramesh Kumar",
        }),
      ],
    ]);

    const overlaps = detectPersonnelMachineOverlaps(
      [
        makeLog({
          log_id: 1,
          wo_id: 301,
          device_id: 15,
          log_time: "2026-03-11T10:00:00Z",
          uid: 12,
          start_name: "Ramesh Kumar",
        }),
        makeLog({
          log_id: 2,
          wo_id: 301,
          device_id: 15,
          log_time: "2026-03-11T10:40:00Z",
          uid: 12,
          start_name: "Ramesh Kumar",
        }),
        makeLog({
          log_id: 3,
          wo_id: 302,
          device_id: 16,
          log_time: "2026-03-11T10:45:00Z",
          uid: 12,
          start_name: "Ramesh Kumar",
        }),
      ],
      woDetailsMap,
    );

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.overlapStart).toBe("2026-03-11T10:20:00.000Z");
    expect(overlaps[0]?.overlapEnd).toBe("2026-03-11T10:40:00.000Z");
  });

  it("builds split overlap log windows with left and right machine lanes", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [
        3008,
        makeWoDetails({
          id: 3008,
          wo_id_str: "3008",
          device_id: 11,
          start_time: "2026-03-17T14:20:00Z",
          end_time: "2026-03-17T14:36:46Z",
          start_uid: 55,
          start_name: "Siva Kumar",
        }),
      ],
      [
        2812,
        makeWoDetails({
          id: 2812,
          wo_id_str: "2812",
          device_id: 14,
          start_time: "2026-03-17T14:20:54Z",
          end_time: "2026-03-17T14:36:46Z",
          start_uid: 55,
          start_name: "Siva Kumar",
        }),
      ],
    ]);

    const overlaps = detectPersonnelMachineOverlaps(
      [
        makeLog({
          log_id: 1,
          wo_id: 3008,
          device_id: 11,
          uid: 55,
          start_name: "Siva Kumar",
          log_time: "2026-03-17T14:36:18Z",
        }),
        makeLog({
          log_id: 2,
          wo_id: 2812,
          device_id: 14,
          uid: 55,
          start_name: "Siva Kumar",
          log_time: "2026-03-17T14:33:55Z",
        }),
      ],
      woDetailsMap,
    );

    const rows: ReportRow[] = [
      makeRow({
        rowId: "vmc1-1",
        logId: 52904,
        label: "JOB - 15",
        durationText: "9s",
        timestamp: new Date("2026-03-17T14:36:18Z").getTime(),
        logTime: new Date("2026-03-17T14:36:18Z"),
        originalLog: makeLog({
          log_id: 52904,
          wo_id: 3008,
          device_id: 11,
          log_time: "2026-03-17T14:36:18Z",
          uid: 55,
          start_name: "Siva Kumar",
        }),
        woSpecs: {
          woId: "3008",
          pclText: "14 min 0 sec",
          allotted: 72,
        },
      }),
      makeRow({
        rowId: "vmc4-1",
        logId: 52833,
        label: "JOB - 19",
        durationText: "3m 3s",
        timestamp: new Date("2026-03-17T14:33:55Z").getTime(),
        logTime: new Date("2026-03-17T14:33:55Z"),
        originalLog: makeLog({
          log_id: 52833,
          wo_id: 2812,
          device_id: 14,
          log_time: "2026-03-17T14:33:55Z",
          uid: 55,
          start_name: "Siva Kumar",
        }),
        woSpecs: {
          woId: "2812",
          pclText: "29 min 0 sec",
          allotted: 144,
        },
      }),
      makeRow({
        rowId: "vmc1-outside",
        logId: 40000,
        label: "Outside",
        timestamp: new Date("2026-03-17T14:40:00Z").getTime(),
        logTime: new Date("2026-03-17T14:40:00Z"),
        originalLog: makeLog({
          log_id: 40000,
          wo_id: 3008,
          device_id: 11,
          log_time: "2026-03-17T14:40:00Z",
          uid: 55,
          start_name: "Siva Kumar",
        }),
      }),
    ];

    const windows = buildPersonnelOverlapLogWindows(rows, overlaps, woDetailsMap);

    expect(windows).toHaveLength(1);
    expect(windows[0]?.slots).toHaveLength(2);
    expect(windows[0]?.slots[0]).toMatchObject({
      timestamp: new Date("2026-03-17T14:36:18Z").getTime(),
    });
    expect(windows[0]?.slots[0]?.leftRows.map((row) => row.rowId)).toEqual(["vmc1-1"]);
    expect(windows[0]?.slots[0]?.rightRows).toEqual([]);
    expect(windows[0]?.slots[1]?.rightRows.map((row) => row.rowId)).toEqual(["vmc4-1"]);
  });

  it("groups same-timestamp rows and resolves computed rows by WO machine", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [
        3008,
        makeWoDetails({
          id: 3008,
          wo_id_str: "3008",
          device_id: 11,
          start_time: "2026-03-17T14:20:00Z",
          end_time: "2026-03-17T14:36:46Z",
          start_uid: 55,
          start_name: "Siva Kumar",
        }),
      ],
      [
        2812,
        makeWoDetails({
          id: 2812,
          wo_id_str: "2812",
          device_id: 14,
          start_time: "2026-03-17T14:20:54Z",
          end_time: "2026-03-17T14:36:46Z",
          start_uid: 55,
          start_name: "Siva Kumar",
        }),
      ],
    ]);

    const overlap = {
      id: "3008:11-2812:14-1",
      overlapStart: "2026-03-17T14:20:54.000Z",
      overlapEnd: "2026-03-17T14:36:46.000Z",
      overlapDurationSec: 952,
      left: {
        sessionKey: "11:3008:1710685200000:1710686206000",
        deviceId: 11,
        woId: 3008,
        woIdLabel: "3008",
        jobType: "Production",
        startTime: "2026-03-17T14:20:00.000Z",
        endTime: "2026-03-17T14:36:46.000Z",
        latestLogTime: "2026-03-17T14:36:18Z",
        latestAction: "WO_STOP",
        logCount: 5,
      },
      right: {
        sessionKey: "14:2812:1710685254000:1710686206000",
        deviceId: 14,
        woId: 2812,
        woIdLabel: "2812",
        jobType: "Production",
        startTime: "2026-03-17T14:20:54.000Z",
        endTime: "2026-03-17T14:36:46.000Z",
        latestLogTime: "2026-03-17T14:36:46Z",
        latestAction: "WO_STOP",
        logCount: 4,
      },
    };

    const sharedTimestamp = new Date("2026-03-17T14:30:43Z");
    const rows: ReportRow[] = [
      makeRow({
        rowId: "left-raw",
        logId: 52742,
        label: "JOB - 15",
        timestamp: sharedTimestamp.getTime(),
        logTime: sharedTimestamp,
        originalLog: makeLog({
          log_id: 52742,
          wo_id: 3008,
          device_id: 11,
          log_time: sharedTimestamp.toISOString(),
          uid: 55,
          start_name: "Siva Kumar",
        }),
      }),
      (() => {
        const row = makeRow({
          rowId: "right-computed-a",
          label: "JOB - 19",
          timestamp: sharedTimestamp.getTime(),
          logTime: sharedTimestamp,
          woSpecs: {
            woId: "2812",
            pclText: "29 min 0 sec",
            allotted: 144,
          },
        });
        delete row.originalLog;
        return row;
      })(),
      (() => {
        const row = makeRow({
          rowId: "right-computed-b",
          label: "9s",
          timestamp: sharedTimestamp.getTime(),
          logTime: sharedTimestamp,
          woSpecs: {
            woId: "2812",
            pclText: "29 min 0 sec",
            allotted: 144,
          },
        });
        delete row.originalLog;
        return row;
      })(),
      makeRow({
        rowId: "skip-header",
        isWoHeader: true,
        timestamp: sharedTimestamp.getTime(),
        logTime: sharedTimestamp,
        woHeaderData: {
          woIdStr: "3008",
          deviceId: 11,
          partNo: "PART-01",
          operatorName: "Siva Kumar",
          pclText: "14 min 0 sec",
          setting: "Production",
          startComment: "Operator change",
        },
      }),
    ];

    const windows = buildPersonnelOverlapLogWindows(rows, [overlap], woDetailsMap);

    expect(windows).toHaveLength(1);
    expect(windows[0]?.slots).toHaveLength(1);
    expect(windows[0]?.slots[0]?.leftRows.map((row) => row.rowId)).toEqual(["left-raw"]);
    expect(windows[0]?.slots[0]?.rightRows.map((row) => row.rowId)).toEqual([
      "right-computed-a",
      "right-computed-b",
    ]);
  });

  it("builds compare matrix windows with lane-specific rows only inside the overlap range", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [
        3008,
        makeWoDetails({
          id: 3008,
          wo_id_str: "3008",
          device_id: 11,
          start_time: "2026-03-17T14:20:00Z",
          end_time: "2026-03-17T14:36:46Z",
          start_uid: 55,
          start_name: "Siva Kumar",
        }),
      ],
      [
        2812,
        makeWoDetails({
          id: 2812,
          wo_id_str: "2812",
          device_id: 14,
          start_time: "2026-03-17T14:20:54Z",
          end_time: "2026-03-17T14:36:46Z",
          start_uid: 55,
          start_name: "Siva Kumar",
        }),
      ],
    ]);

    const overlap = {
      id: "3008:11-2812:14-1",
      overlapStart: "2026-03-17T14:20:54.000Z",
      overlapEnd: "2026-03-17T14:36:46.000Z",
      overlapDurationSec: 952,
      left: {
        sessionKey: "11:3008:1710685200000:1710686206000",
        deviceId: 11,
        woId: 3008,
        woIdLabel: "3008",
        jobType: "Production",
        startTime: "2026-03-17T14:20:00.000Z",
        endTime: "2026-03-17T14:36:46.000Z",
        latestLogTime: "2026-03-17T14:36:18Z",
        latestAction: "WO_STOP",
        logCount: 5,
      },
      right: {
        sessionKey: "14:2812:1710685254000:1710686206000",
        deviceId: 14,
        woId: 2812,
        woIdLabel: "2812",
        jobType: "Production",
        startTime: "2026-03-17T14:20:54.000Z",
        endTime: "2026-03-17T14:36:46.000Z",
        latestLogTime: "2026-03-17T14:36:46Z",
        latestAction: "WO_STOP",
        logCount: 4,
      },
    };

    const rows: ReportRow[] = [
      makeRow({
        rowId: "left-header",
        isWoHeader: true,
        timestamp: new Date("2026-03-17T14:19:00Z").getTime(),
        logTime: new Date("2026-03-17T14:19:00Z"),
        woHeaderData: {
          woIdStr: "3008",
          partNo: "LH-063",
          operatorName: "Siva Kumar",
          pclText: "14 min 0 sec",
          setting: "SET-1",
          deviceId: 11,
          startComment: "Operator change",
        },
      }),
      makeRow({
        rowId: "left-log",
        logId: 52614,
        timestamp: new Date("2026-03-17T14:22:13Z").getTime(),
        logTime: new Date("2026-03-17T14:22:13Z"),
        originalLog: makeLog({
          log_id: 52614,
          wo_id: 3008,
          device_id: 11,
          log_time: "2026-03-17T14:22:13Z",
          uid: 55,
          start_name: "Siva Kumar",
        }),
        woSpecs: {
          woId: "3008",
          pclText: "14 min 0 sec",
          allotted: 72,
        },
      }),
      makeRow({
        rowId: "right-header",
        isWoHeader: true,
        timestamp: new Date("2026-03-17T14:18:00Z").getTime(),
        logTime: new Date("2026-03-17T14:18:00Z"),
        woHeaderData: {
          woIdStr: "2812",
          partNo: "LH-044",
          operatorName: "Siva Kumar",
          pclText: "29 min 0 sec",
          setting: "SET-2",
          deviceId: 14,
          startComment: "Operator change",
        },
      }),
      makeRow({
        rowId: "right-log",
        logId: 52605,
        timestamp: new Date("2026-03-17T14:20:54Z").getTime(),
        logTime: new Date("2026-03-17T14:20:54Z"),
        originalLog: makeLog({
          log_id: 52605,
          wo_id: 2812,
          device_id: 14,
          log_time: "2026-03-17T14:20:54Z",
          uid: 55,
          start_name: "Siva Kumar",
        }),
        woSpecs: {
          woId: "2812",
          pclText: "29 min 0 sec",
          allotted: 144,
        },
      }),
      makeRow({
        rowId: "outside-other-wo",
        logId: 70000,
        timestamp: new Date("2026-03-17T14:25:00Z").getTime(),
        logTime: new Date("2026-03-17T14:25:00Z"),
        originalLog: makeLog({
          log_id: 70000,
          wo_id: 9999,
          device_id: 11,
          log_time: "2026-03-17T14:25:00Z",
          uid: 55,
          start_name: "Siva Kumar",
        }),
        woSpecs: {
          woId: "9999",
          pclText: "1 min 0 sec",
          allotted: 10,
        },
      }),
      makeRow({
        rowId: "left-summary",
        isWoSummary: true,
        timestamp: new Date("2026-03-17T14:37:00Z").getTime(),
        logTime: new Date("2026-03-17T14:37:00Z"),
        woSummaryData: {
          woIdStr: "3008",
          partNo: "LH-063",
          operatorName: "Siva Kumar",
          setting: "SET-1",
          deviceId: 11,
          startTime: "17/03/2026, 14:20",
          endTime: "17/03/2026, 14:36",
          totalDuration: "16m 46s",
          totalJobs: 5,
          totalCycles: 5,
          totalCuttingTime: "14m 0s",
          allotedQty: 72,
          okQty: 28,
          rejectQty: 0,
          totalPauseTime: "0s",
          pauseReasons: [],
          stopComment: "",
          startComment: "",
        },
      }),
    ];

    const panes = buildPersonnelOverlapCompareWindows(rows, [overlap], woDetailsMap);

    expect(panes).toHaveLength(1);
    expect(panes[0]?.lanes.map((lane) => lane.key)).toEqual([
      "11:3008",
      "14:2812",
    ]);
    expect(panes[0]?.slots).toHaveLength(2);
    expect(panes[0]?.slots[0]?.timestamp).toBe(
      new Date("2026-03-17T14:22:13Z").getTime(),
    );
    expect(
      panes[0]?.slots[0]?.laneRows["11:3008"]?.map((row) => row.rowId),
    ).toEqual(["left-log"]);
    expect(
      panes[0]?.slots[1]?.laneRows["14:2812"]?.map((row) => row.rowId),
    ).toEqual(["right-log"]);
    expect(panes[0]?.slots[0]?.laneRows["14:2812"]).toBeUndefined();
  });

  it("groups three simultaneous machines into one matrix window with one time spine", () => {
    const overlapBase = {
      overlapStart: "2026-03-17T14:20:00.000Z",
      overlapEnd: "2026-03-17T14:30:00.000Z",
      overlapDurationSec: 600,
    };

    const overlaps = [
      {
        id: "11-14",
        ...overlapBase,
        left: {
          sessionKey: "11:3008:1710685200000:1710685800000",
          deviceId: 11,
          woId: 3008,
          woIdLabel: "3008",
          jobType: "Production",
          startTime: "2026-03-17T14:20:00.000Z",
          endTime: "2026-03-17T14:30:00.000Z",
          latestLogTime: "2026-03-17T14:29:00Z",
          latestAction: "SPINDLE_OFF",
          logCount: 4,
        },
        right: {
          sessionKey: "14:2812:1710685200000:1710685800000",
          deviceId: 14,
          woId: 2812,
          woIdLabel: "2812",
          jobType: "Production",
          startTime: "2026-03-17T14:20:00.000Z",
          endTime: "2026-03-17T14:30:00.000Z",
          latestLogTime: "2026-03-17T14:28:00Z",
          latestAction: "SPINDLE_OFF",
          logCount: 4,
        },
      },
      {
        id: "11-18",
        ...overlapBase,
        left: {
          sessionKey: "11:3008:1710685200000:1710685800000",
          deviceId: 11,
          woId: 3008,
          woIdLabel: "3008",
          jobType: "Production",
          startTime: "2026-03-17T14:20:00.000Z",
          endTime: "2026-03-17T14:30:00.000Z",
          latestLogTime: "2026-03-17T14:29:00Z",
          latestAction: "SPINDLE_OFF",
          logCount: 4,
        },
        right: {
          sessionKey: "18:4120:1710685200000:1710685800000",
          deviceId: 18,
          woId: 4120,
          woIdLabel: "4120",
          jobType: "Setting",
          startTime: "2026-03-17T14:20:00.000Z",
          endTime: "2026-03-17T14:30:00.000Z",
          latestLogTime: "2026-03-17T14:27:00Z",
          latestAction: "WO_PAUSE",
          logCount: 3,
        },
      },
      {
        id: "14-18",
        ...overlapBase,
        left: {
          sessionKey: "14:2812:1710685200000:1710685800000",
          deviceId: 14,
          woId: 2812,
          woIdLabel: "2812",
          jobType: "Production",
          startTime: "2026-03-17T14:20:00.000Z",
          endTime: "2026-03-17T14:30:00.000Z",
          latestLogTime: "2026-03-17T14:28:00Z",
          latestAction: "SPINDLE_OFF",
          logCount: 4,
        },
        right: {
          sessionKey: "18:4120:1710685200000:1710685800000",
          deviceId: 18,
          woId: 4120,
          woIdLabel: "4120",
          jobType: "Setting",
          startTime: "2026-03-17T14:20:00.000Z",
          endTime: "2026-03-17T14:30:00.000Z",
          latestLogTime: "2026-03-17T14:27:00Z",
          latestAction: "WO_PAUSE",
          logCount: 3,
        },
      },
    ];

    const rows: ReportRow[] = [
      makeRow({
        rowId: "vmc1-row",
        timestamp: new Date("2026-03-17T14:28:00Z").getTime(),
        logTime: new Date("2026-03-17T14:28:00Z"),
        originalLog: makeLog({
          log_id: 1,
          wo_id: 3008,
          device_id: 11,
          log_time: "2026-03-17T14:28:00Z",
        }),
        woSpecs: { woId: "3008", pclText: "14 min 0 sec", allotted: 72 },
      }),
      makeRow({
        rowId: "vmc4-row",
        timestamp: new Date("2026-03-17T14:28:00Z").getTime(),
        logTime: new Date("2026-03-17T14:28:00Z"),
        originalLog: makeLog({
          log_id: 2,
          wo_id: 2812,
          device_id: 14,
          log_time: "2026-03-17T14:28:00Z",
        }),
        woSpecs: { woId: "2812", pclText: "29 min 0 sec", allotted: 144 },
      }),
      makeRow({
        rowId: "cnc-row",
        timestamp: new Date("2026-03-17T14:27:00Z").getTime(),
        logTime: new Date("2026-03-17T14:27:00Z"),
        originalLog: makeLog({
          log_id: 3,
          wo_id: 4120,
          device_id: 18,
          log_time: "2026-03-17T14:27:00Z",
        }),
        woSpecs: { woId: "4120", pclText: "20 min 0 sec", allotted: 80 },
      }),
    ];

    const panes = buildPersonnelOverlapCompareWindows(rows, overlaps, new Map());

    expect(panes).toHaveLength(1);
    expect(panes[0]?.lanes.map((lane) => lane.key)).toEqual([
      "11:3008",
      "14:2812",
      "18:4120",
    ]);
    expect(panes[0]?.slots).toHaveLength(2);
    expect(
      panes[0]?.slots[0]?.laneRows["11:3008"]?.map((row) => row.rowId),
    ).toEqual(["vmc1-row"]);
    expect(
      panes[0]?.slots[0]?.laneRows["14:2812"]?.map((row) => row.rowId),
    ).toEqual(["vmc4-row"]);
    expect(
      panes[0]?.slots[1]?.laneRows["18:4120"]?.map((row) => row.rowId),
    ).toEqual(["cnc-row"]);
  });

  it("keeps separate compare windows when sessions reuse the same displayed WO label", () => {
    const overlaps = [
      {
        id: "2770-2812-early",
        overlapStart: "2026-03-17T23:13:23.000Z",
        overlapEnd: "2026-03-18T01:21:36.000Z",
        overlapDurationSec: 7693,
        left: {
          sessionKey: "12:2770:1742255003000:1742262716000",
          deviceId: 12,
          woId: 2770,
          woIdLabel: "2770",
          jobType: "Production",
          startTime: "2026-03-17T17:43:23.000Z",
          endTime: "2026-03-17T19:51:36.000Z",
          latestLogTime: "2026-03-17T19:49:57.000Z",
          latestAction: "JOB",
          logCount: 20,
        },
        right: {
          sessionKey: "14:2812:1742252279000:1742262696000",
          deviceId: 14,
          woId: 2812,
          woIdLabel: "2812",
          jobType: "Production",
          startTime: "2026-03-17T16:47:59.000Z",
          endTime: "2026-03-17T19:51:36.000Z",
          latestLogTime: "2026-03-17T19:50:00.000Z",
          latestAction: "JOB",
          logCount: 18,
        },
      },
      {
        id: "104-2812-late",
        overlapStart: "2026-03-18T08:00:00.000Z",
        overlapEnd: "2026-03-18T09:00:00.000Z",
        overlapDurationSec: 3600,
        left: {
          sessionKey: "12:104:1742275200000:1742278800000",
          deviceId: 12,
          woId: 104,
          woIdLabel: "104",
          jobType: "Production",
          startTime: "2026-03-18T08:00:00.000Z",
          endTime: "2026-03-18T09:00:00.000Z",
          latestLogTime: "2026-03-18T08:55:00.000Z",
          latestAction: "JOB",
          logCount: 15,
        },
        right: {
          sessionKey: "14:2812:1742274900000:1742279100000",
          deviceId: 14,
          woId: 2812,
          woIdLabel: "2812",
          jobType: "Production",
          startTime: "2026-03-18T07:55:00.000Z",
          endTime: "2026-03-18T09:05:00.000Z",
          latestLogTime: "2026-03-18T08:58:00.000Z",
          latestAction: "JOB",
          logCount: 12,
        },
      },
    ];

    const rows: ReportRow[] = [
      makeRow({
        rowId: "early-left",
        timestamp: new Date("2026-03-17T19:19:57.000Z").getTime(),
        logTime: new Date("2026-03-17T19:19:57.000Z"),
        originalLog: makeLog({
          log_id: 1,
          wo_id: 2770,
          device_id: 12,
          log_time: "2026-03-17T19:19:57.000Z",
        }),
        woSpecs: { woId: "2770", pclText: "29 min 0 sec", allotted: 104 },
      }),
      makeRow({
        rowId: "early-right",
        timestamp: new Date("2026-03-17T19:20:00.000Z").getTime(),
        logTime: new Date("2026-03-17T19:20:00.000Z"),
        originalLog: makeLog({
          log_id: 2,
          wo_id: 2812,
          device_id: 14,
          log_time: "2026-03-17T19:20:00.000Z",
        }),
        woSpecs: { woId: "2812", pclText: "29 min 0 sec", allotted: 68 },
      }),
      makeRow({
        rowId: "late-left",
        timestamp: new Date("2026-03-18T08:30:00.000Z").getTime(),
        logTime: new Date("2026-03-18T08:30:00.000Z"),
        originalLog: makeLog({
          log_id: 3,
          wo_id: 104,
          device_id: 12,
          log_time: "2026-03-18T08:30:00.000Z",
        }),
        woSpecs: { woId: "104", pclText: "31 min 15 sec", allotted: 104 },
      }),
      makeRow({
        rowId: "late-right",
        timestamp: new Date("2026-03-18T08:32:00.000Z").getTime(),
        logTime: new Date("2026-03-18T08:32:00.000Z"),
        originalLog: makeLog({
          log_id: 4,
          wo_id: 2812,
          device_id: 14,
          log_time: "2026-03-18T08:32:00.000Z",
        }),
        woSpecs: { woId: "2812", pclText: "29 min 0 sec", allotted: 68 },
      }),
    ];

    const panes = buildPersonnelOverlapCompareWindows(rows, overlaps, new Map());

    expect(panes).toHaveLength(2);
    expect(panes.map((pane) => pane.lanes.map((lane) => lane.key))).toEqual([
      ["12:2770", "14:2812"],
      ["12:104", "14:2812"],
    ]);
    expect(
      panes[0]?.slots[0]?.laneRows["14:2812"]?.map((row) => row.rowId),
    ).toEqual(["early-right"]);
    expect(
      panes[1]?.slots.some((slot) =>
        (slot.laneRows["12:104"] ?? []).some((row) => row.rowId === "late-left"),
      ),
    ).toBe(true);
  });

  it("groups merged rows by machine and work order in dashboard order", () => {
    const woDetailsMap = new Map<number, WoDetails>([
      [
        2770,
        makeWoDetails({
          id: 2770,
          wo_id_str: "2770",
          device_id: 12,
          start_name: "Harish",
        }),
      ],
      [
        2812,
        makeWoDetails({
          id: 2812,
          wo_id_str: "2812",
          device_id: 14,
          start_name: "Harish",
        }),
      ],
    ]);

    const rows: ReportRow[] = [
      makeRow({
        rowId: "wo-2812-log",
        timestamp: new Date("2026-03-18T01:20:00Z").getTime(),
        logTime: new Date("2026-03-18T01:20:00Z"),
        jobType: "Production",
        originalLog: makeLog({
          log_id: 52833,
          wo_id: 2812,
          device_id: 14,
          log_time: "2026-03-18T01:20:00Z",
          start_name: "Harish",
        }),
        woSpecs: {
          woId: "2812",
          pclText: "29 min 0 sec",
          allotted: 68,
        },
      }),
      (() => {
        const row = makeRow({
          rowId: "wo-2770-computed",
          timestamp: new Date("2026-03-18T01:19:57Z").getTime(),
          logTime: new Date("2026-03-18T01:19:57Z"),
          jobType: "Production",
          woSpecs: {
            woId: "2770",
            pclText: "29 min 0 sec",
            allotted: 104,
          },
        });
        delete row.originalLog;
        return row;
      })(),
      makeRow({
        rowId: "wo-2770-log",
        timestamp: new Date("2026-03-18T01:19:52Z").getTime(),
        logTime: new Date("2026-03-18T01:19:52Z"),
        jobType: "Production",
        originalLog: makeLog({
          log_id: 52919,
          wo_id: 2770,
          device_id: 12,
          log_time: "2026-03-18T01:19:52Z",
          start_name: "Harish",
        }),
        woSpecs: {
          woId: "2770",
          pclText: "29 min 0 sec",
          allotted: 104,
        },
      }),
    ];

    const groups = groupPersonnelMergedRows(rows, woDetailsMap);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.machineLabel)).toEqual(["VMC 2", "VMC 4"]);
    expect(groups.map((group) => group.woIdLabel)).toEqual(["2770", "2812"]);
    expect(groups[0]?.rows.map((row) => row.rowId)).toEqual([
      "wo-2770-computed",
      "wo-2770-log",
    ]);
    expect(groups[1]?.rows.map((row) => row.rowId)).toEqual(["wo-2812-log"]);
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
