import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyFilters,
  classifyApiPayload,
  classifyParsedPayload,
  classifyWorkOrder,
  parseWoApiResponse,
  resolveBaseline,
  type ParsedWorkOrder,
  type WoApiResponse,
} from "../src/index.js";

const loadFixture = <T>(fileName: string): T => {
  const fullPath = resolve(process.cwd(), "fixtures", fileName);
  return JSON.parse(readFileSync(fullPath, "utf8")) as T;
};

const makeWorkOrder = (overrides: Partial<ParsedWorkOrder> = {}): ParsedWorkOrder => ({
  id: 1,
  woId: "WO-1",
  deviceId: 15,
  partNo: "PART-A",
  status: "COMPLETED",
  startTime: new Date("2026-02-09T10:00:00.000Z"),
  endTime: new Date("2026-02-09T10:02:00.000Z"),
  durationSec: 120,
  targetDurationSec: 120,
  timeSavedSec: 0,
  allotedQty: 100,
  okQty: 100,
  rejectQty: 0,
  loadTimeSec: 20,
  idleTimeSec: 10,
  startComment: null,
  stopComment: null,
  ...overrides,
});

describe("parser", () => {
  it("parses WO + extensions from fixture", () => {
    const apiPayload = loadFixture<WoApiResponse>("wo-306.json");
    const parsed = parseWoApiResponse(apiPayload);
    expect(parsed.workOrder?.id).toBe(306);
    expect(parsed.extensions).toHaveLength(2);
    expect(parsed.extensions[0]?.isBreakLike).toBe(true);
  });
});

describe("baseline", () => {
  it("uses target baseline when target_duration > 0", () => {
    const baseline = resolveBaseline({
      targetDurationSec: 300,
      historyDurationsSec: [100, 120, 130],
      defaultIdealSec: 60,
    });
    expect(baseline.source).toBe("TARGET");
    expect(baseline.idealCycleSec).toBe(300);
  });

  it("uses rolling median when target is zero", () => {
    const baseline = resolveBaseline({
      targetDurationSec: 0,
      historyDurationsSec: [100, 110, 120, 140, 160],
      defaultIdealSec: 60,
    });
    expect(baseline.source).toBe("ROLLING_MEDIAN");
    expect(baseline.idealCycleSec).toBe(120);
  });

  it("uses default when target is zero and history missing", () => {
    const baseline = resolveBaseline({
      targetDurationSec: 0,
      historyDurationsSec: [],
      defaultIdealSec: 90,
    });
    expect(baseline.source).toBe("DEFAULT");
    expect(baseline.idealCycleSec).toBe(90);
  });
});

describe("work order classification", () => {
  it("classifies within threshold as GOOD", () => {
    const row = classifyWorkOrder(makeWorkOrder(), {
      thresholdPct: 0.1,
      minThresholdSec: 5,
    });
    expect(row.classification).toBe("GOOD");
  });

  it("treats boundary values as GOOD", () => {
    const lowerBoundary = classifyWorkOrder(
      makeWorkOrder({
        durationSec: 108,
        timeSavedSec: 12,
      }),
      {
        thresholdPct: 0.1,
        minThresholdSec: 5,
      },
    );
    const upperBoundary = classifyWorkOrder(
      makeWorkOrder({
        durationSec: 132,
        timeSavedSec: -12,
      }),
      {
        thresholdPct: 0.1,
        minThresholdSec: 5,
      },
    );

    expect(lowerBoundary.classification).toBe("GOOD");
    expect(upperBoundary.classification).toBe("GOOD");
  });

  it("downgrades small deviations to WARNING", () => {
    const lowerWarning = classifyWorkOrder(
      makeWorkOrder({
        durationSec: 100,
        timeSavedSec: 20,
      }),
      {
        thresholdPct: 0.1,
        minThresholdSec: 5,
      },
    );
    const upperWarning = classifyWorkOrder(
      makeWorkOrder({
        durationSec: 140,
        timeSavedSec: -20,
      }),
      {
        thresholdPct: 0.1,
        minThresholdSec: 5,
      },
    );

    expect(lowerWarning.classification).toBe("WARNING");
    expect(upperWarning.classification).toBe("WARNING");
  });

  it("classifies severe deviations as BAD", () => {
    const row = classifyWorkOrder(
      makeWorkOrder({
        durationSec: 220,
        timeSavedSec: -100,
      }),
      {
        thresholdPct: 0.1,
        minThresholdSec: 5,
      },
    );
    expect(row.classification).toBe("BAD");
  });

  it("prevents false green when target=0 and time_saved is positive", () => {
    const row = classifyWorkOrder(
      makeWorkOrder({
        targetDurationSec: 0,
        durationSec: 120,
        timeSavedSec: 20,
      }),
      {
        historyDurationsSec: [118, 119, 120, 121, 122],
      },
    );
    expect(row.classification).toBe("WARNING");
    expect(row.reasonCode).toBe("TARGET_ZERO_TIME_SAVED_POSITIVE");
  });

  it("does not let inconsistent time_saved change color", () => {
    const row = classifyWorkOrder(
      makeWorkOrder({
        targetDurationSec: 120,
        durationSec: 120,
        timeSavedSec: 30,
      }),
      {},
    );
    expect(row.classification).toBe("GOOD");
    expect(row.reasonText).toContain("time_saved mismatch");
  });

  it("flags ok_qty > alloted_qty and blocks green", () => {
    const row = classifyWorkOrder(
      makeWorkOrder({
        okQty: 120,
        allotedQty: 100,
      }),
      {},
    );
    expect(row.classification).toBe("WARNING");
    expect(row.reasonCode).toBe("OK_QTY_EXCEEDS_ALLOTED");
  });

  it("returns UNKNOWN for invalid timestamps", () => {
    const row = classifyWorkOrder(
      makeWorkOrder({
        startTime: null,
      }),
      {},
    );
    expect(row.classification).toBe("UNKNOWN");
    expect(row.reasonCode).toBe("INVALID_TIMESTAMP");
  });
});

describe("timeline + filters", () => {
  it("classifies extensions as downtime UNKNOWN rows", () => {
    const payload = loadFixture<WoApiResponse>("wo-306.json");
    const rows = classifyApiPayload(payload, {
      historyDurationsSec: [16000, 16200, 16100],
      fallbackIdealSec: 120,
    });
    const extensionRows = rows.filter((item) => item.rowKind === "EXTENSION");
    expect(extensionRows).toHaveLength(2);
    expect(extensionRows[0]?.category).toBe("DOWNTIME");
    expect(extensionRows[0]?.classification).toBe("UNKNOWN");
  });

  it("applies default Good Only filter", () => {
    const rows = classifyParsedPayload(
      {
        workOrder: makeWorkOrder(),
        extensions: [],
      },
      {},
    );
    const filtered = applyFilters(rows);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.rowKind).toBe("WO");
    expect(filtered[0]?.classification).toBe("GOOD");
  });

  it("includes unknown and break rows when toggles are enabled", () => {
    const payload = loadFixture<WoApiResponse>("wo-306.json");
    const rows = classifyApiPayload(payload, {
      historyDurationsSec: [16104, 16090, 16110],
    });
    const filtered = applyFilters(rows, {
      mode: "GOOD_WARNING",
      includeUnknown: true,
      includeBreakExtensions: true,
    });
    expect(filtered.some((row) => row.rowKind === "EXTENSION")).toBe(true);
  });
});
