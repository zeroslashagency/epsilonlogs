import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportTable } from "../src/report/ReportTable";
import type { ReportRow } from "../src/report/report-types";

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
});
