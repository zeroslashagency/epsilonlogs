import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportCompareMatrix, ReportTable } from "../src/report/ReportTable";
import type { PersonnelOverlapCompareWindow } from "../src/report/personnel-report-utils";
import type { ReportRow, WoDetails } from "../src/report/report-types";

describe("ReportTable", () => {
  it("hides synthetic pause banner rows and keeps the raw pause log visible", () => {
    const rows: ReportRow[] = [
      {
        rowId: "pause-banner-13219",
        logTime: new Date("2026-03-11T14:46:48Z"),
        jobType: "Production",
        timestamp: 2,
        isPauseBanner: true,
        pauseBannerData: {
          reason: "Paused",
          durationText: "27m 47s",
          isShiftBreak: false,
        },
      },
      {
        rowId: "log-13219",
        logId: 13219,
        logTime: new Date("2026-03-11T14:46:48Z"),
        action: "WO_PAUSE",
        durationText: "27m 47s",
        jobType: "Production",
        timestamp: 3,
        operatorName: "ATHUL",
        woSpecs: {
          woId: "2770",
          pclText: "17 min 55 sec",
          allotted: 96,
        },
      },
    ];

    const markup = renderToStaticMarkup(<ReportTable rows={rows} />);

    expect(markup).toContain("13219");
    expect(markup).toContain("Paused");
    expect(markup).not.toContain("WO Pause");
    expect(markup).not.toContain("⚠️");
  });

  it("renders the machine column for normal report rows", () => {
    const rows: ReportRow[] = [
      {
        rowId: "log-20001",
        logId: 20001,
        logTime: new Date("2026-03-17T14:46:48Z"),
        action: "SPINDLE_OFF",
        durationText: "12s",
        jobType: "Production",
        timestamp: 4,
        operatorName: "JINTU KHAN",
        originalLog: {
          log_id: 20001,
          device_id: 19,
          wo_id: 2982,
          log_time: "2026-03-17T14:46:48Z",
          action: "SPINDLE_OFF",
          uid: 10,
          start_name: "JINTU KHAN",
          data: null,
        },
        woSpecs: {
          woId: "2982",
          pclText: "21 min 30 sec",
          allotted: 152,
        },
      },
    ];

    const markup = renderToStaticMarkup(<ReportTable rows={rows} />);

    expect(markup).toContain("Machine");
    expect(markup).toContain("VMC 7");
  });

  it("renders machine labels inside the overlap compare lanes", () => {
    const laneRow: ReportRow = {
      rowId: "compare-1",
      logId: 52833,
      logTime: new Date("2026-03-18T01:20:00Z"),
      action: "SPINDLE_OFF",
      durationText: "8s",
      label: "JOB - 08",
      jobType: "Production",
      operatorName: "HARISH",
      timestamp: new Date("2026-03-18T01:20:00Z").getTime(),
      originalLog: {
        log_id: 52833,
        device_id: 14,
        wo_id: 2812,
        log_time: "2026-03-18T01:20:00Z",
        action: "SPINDLE_OFF",
        uid: 22,
        start_name: "HARISH",
        data: null,
      },
      woSpecs: {
        woId: "2812",
        pclText: "29 min 0 sec",
        allotted: 68,
      },
    };

    const windows: PersonnelOverlapCompareWindow[] = [
      {
        id: "harish-compare",
        startTime: "2026-03-17T19:43:23.000Z",
        endTime: "2026-03-17T19:51:36.000Z",
        durationSec: 493,
        lanes: [
          {
            key: "12:2770",
            sessionKey: "12:2770:1742237003000:1742237516000",
            deviceId: 12,
            woId: 2770,
            woIdLabel: "2770",
            jobType: "Production",
            startTime: "2026-03-17T19:43:23.000Z",
            endTime: "2026-03-17T19:52:59.000Z",
            latestLogTime: "2026-03-17T19:49:57.000Z",
            latestAction: "JOB",
            logCount: 20,
          },
          {
            key: "14:2812",
            sessionKey: "14:2812:1742236079000:1742237496000",
            deviceId: 14,
            woId: 2812,
            woIdLabel: "2812",
            jobType: "Production",
            startTime: "2026-03-17T19:37:59.000Z",
            endTime: "2026-03-17T19:51:36.000Z",
            latestLogTime: "2026-03-17T19:50:00.000Z",
            latestAction: "JOB",
            logCount: 18,
          },
        ],
        slots: [
          {
            timestamp: new Date("2026-03-18T01:20:00Z").getTime(),
            laneRows: {
              "14:2812": [laneRow],
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(<ReportCompareMatrix windows={windows} />);

    expect(markup).toContain("Machine");
    expect(markup).toContain("VMC 2");
    expect(markup).toContain("VMC 4");
    expect(markup).toContain("WO #2812");
  });

  it("resolves machine labels for computed rows through WO details", () => {
    const rows: ReportRow[] = [
      {
        rowId: "computed-2770",
        logTime: new Date("2026-03-18T01:19:52Z"),
        action: "SPINDLE_ON",
        durationText: "3s",
        label: "JOB - 51",
        jobType: "Production",
        operatorName: "HARISH",
        timestamp: new Date("2026-03-18T01:19:52Z").getTime(),
        woSpecs: {
          woId: "2770",
          pclText: "29 min 0 sec",
          allotted: 104,
        },
      },
    ];
    const woDetailsMap = new Map<number, WoDetails>([
      [
        2770,
        {
          id: 2770,
          pcl: 1740,
          start_time: "2026-03-17T17:43:23.130Z",
          end_time: "2026-03-17T19:52:59.000Z",
          start_uid: 22,
          stop_uid: 22,
          extensions: [],
          wo_id_str: "2770",
          part_no: "LH008",
          start_name: "HARISH",
          stop_name: "HARISH",
          start_comment: "",
          stop_comment: "",
          setting: "SET-1",
          alloted_qty: 104,
          ok_qty: 104,
          reject_qty: 0,
          device_id: 12,
          duration: 7776,
        },
      ],
    ]);

    const markup = renderToStaticMarkup(
      <ReportTable rows={rows} woDetailsMap={woDetailsMap} />,
    );

    expect(markup).toContain("Machine");
    expect(markup).toContain("VMC 2");
  });
});
