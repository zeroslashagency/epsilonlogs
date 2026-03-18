import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLatestDeviceLogs } from "../src/report/api-client";
import type { DeviceLogEntry, ReportConfig } from "../src/report/report-types";

function makeLog(logId: number): DeviceLogEntry {
  return {
    log_id: logId,
    log_time: "2026-03-17T06:00:00Z",
    action: "SPINDLE_ON",
    wo_id: 3008,
    device_id: 11,
  };
}

const config: ReportConfig = {
  deviceId: 11,
  startDate: "16-03-2026 00:00",
  endDate: "17-03-2026 11:38",
  toleranceSec: 10,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchLatestDeviceLogs", () => {
  it("returns first page logs when there is only one page", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          logs: [makeLog(101)],
          pagination: { total_pages: 1, total_items: 1, current_page: 1 },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const logs = await fetchLatestDeviceLogs(config, "token");

    expect(logs.map((log) => log.log_id)).toEqual([101]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches only the latest pages for dashboard use", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input), "https://app.epsilonengg.in");
      const page = Number(url.searchParams.get("page"));

      if (page === 1) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: {
              logs: [makeLog(1)],
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
            logs: [makeLog(page)],
            pagination: { total_pages: 5, total_items: 5, current_page: page },
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const logs = await fetchLatestDeviceLogs(config, "token");
    const pages = fetchMock.mock.calls.map(([input]) => {
      const url = new URL(String(input), "https://app.epsilonengg.in");
      return url.searchParams.get("page");
    });

    expect(pages).toEqual(["1", "4", "5"]);
    expect(logs.map((log) => log.log_id)).toEqual([4, 5]);
  });
});
