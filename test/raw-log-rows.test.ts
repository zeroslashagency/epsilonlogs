import { describe, expect, test } from "vitest";
import { buildRawLogRows, buildWebLogRows } from "../src/report/raw-log-rows";
import { matchRow } from "../src/report/search-utils";
import type { DeviceLogEntry, WoDetails } from "../src/report/report-types";

function makeLog(overrides: Partial<DeviceLogEntry> = {}): DeviceLogEntry {
  return {
    log_id: 1,
    log_time: "2026-03-29T00:00:00Z",
    action: "SPINDLE_ON",
    wo_id: 916,
    device_id: 15,
    job_type: 1,
    start_name: "ATHUL",
    ...overrides,
  };
}

function makeWoDetails(overrides: Partial<WoDetails> = {}): WoDetails {
  return {
    id: 916,
    pcl: 1280,
    start_time: "2026-03-28T16:44:24.718329Z",
    end_time: "2026-03-29T00:47:18.552769Z",
    start_uid: 18,
    stop_uid: 18,
    extensions: [],
    wo_id_str: "2989",
    part_no: "LH-128",
    start_name: "ATHUL",
    stop_name: "ATHUL",
    start_comment: "Started",
    stop_comment: "Operator change",
    setting: "SETTING -1",
    alloted_qty: 192,
    ok_qty: 144,
    reject_qty: 0,
    device_id: 15,
    duration: 28973,
    job_type: 1,
    ...overrides,
  };
}

describe("buildRawLogRows", () => {
  test("preserves every raw log in descending time order", () => {
    const rows = buildRawLogRows(
      [
        makeLog({
          log_id: 250222,
          log_time: "2026-03-28T19:44:31Z",
          action: "WO_PAUSE",
        }),
        makeLog({
          log_id: 250225,
          log_time: "2026-03-28T19:44:33Z",
          action: "SPINDLE_ON",
        }),
      ],
      new Map([[916, makeWoDetails()]]),
    );

    expect(rows.map((row) => row.logId)).toEqual([250225, 250222]);
    expect(rows[0]?.action).toBe("SPINDLE_ON");
    expect(rows[1]?.action).toBe("WO_PAUSE");
    expect(rows[0]?.woSpecs?.woId).toBe("2989");
  });

  test("keeps raw WO start and stop details", () => {
    const rows = buildRawLogRows(
      [
        makeLog({
          log_id: 10,
          action: "WO_START",
          part_no: "LH-128",
          alloted_qty: 192,
          start_comment: "Started",
        }),
        makeLog({
          log_id: 20,
          log_time: "2026-03-29T00:47:18Z",
          action: "WO_STOP",
          ok_qty: 144,
          reject_qty: 0,
          stop_comment: "Operator change",
        }),
      ],
      new Map([[916, makeWoDetails()]]),
    );

    const stopRow = rows[0]!;
    const startRow = rows[1]!;

    expect(stopRow.stopRowData).toEqual({
      ok: 144,
      reject: 0,
      reason: "Operator change",
    });
    expect(startRow.startRowData).toEqual({
      partNo: "LH-128",
      allotted: 192,
      comment: "Started",
    });
  });

  test("supports raw search by log id and action", () => {
    const row = buildRawLogRows(
      [
        makeLog({
          log_id: 250225,
          action: "SPINDLE_ON",
        }),
      ],
      new Map([[916, makeWoDetails()]]),
    )[0]!;

    expect(matchRow(row, "250225")).toBe(true);
    expect(matchRow(row, "spindle_on")).toBe(true);
    expect(matchRow(row, "athul")).toBe(true);
  });

  test("keeps processed UI rows and appends only missing raw log ids", () => {
    const processedRows = [
      {
        rowId: "header-916",
        logTime: new Date("2026-03-29T00:00:00Z"),
        jobType: "Production" as const,
        timestamp: new Date("2026-03-29T00:00:00Z").getTime(),
        isWoHeader: true,
        woHeaderData: {
          woIdStr: "2989",
          partNo: "LH-128",
          operatorName: "ATHUL",
          pclText: "21m 20s",
          setting: "SETTING -1",
          deviceId: 15,
          startComment: "Started",
        },
      },
      {
        rowId: "log-250225",
        sNo: 1,
        logId: 250225,
        logTime: new Date("2026-03-29T01:14:33Z"),
        action: "SPINDLE_ON",
        jobType: "Production" as const,
        timestamp: new Date("2026-03-29T01:14:33Z").getTime(),
        originalLog: makeLog({
          log_id: 250225,
          log_time: "2026-03-29T01:14:33Z",
          action: "SPINDLE_ON",
        }),
      },
    ];

    const webRows = buildWebLogRows(
      [
        makeLog({
          log_id: 250222,
          log_time: "2026-03-29T01:14:31Z",
          action: "WO_PAUSE",
        }),
        makeLog({
          log_id: 250225,
          log_time: "2026-03-29T01:14:33Z",
          action: "SPINDLE_ON",
        }),
      ],
      processedRows,
      new Map([[916, makeWoDetails()]]),
    );

    expect(webRows.filter((row) => row.logId === 250225)).toHaveLength(1);
    expect(webRows.some((row) => row.isWoHeader)).toBe(true);
    expect(webRows.some((row) => row.logId === 250222 && row.action === "WO_PAUSE")).toBe(true);
  });
});
