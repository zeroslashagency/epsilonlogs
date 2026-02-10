import { classifyApiPayload } from "../src/index.js";
import type { WoApiResponse } from "../src/index.js";

const token = process.env.EPSILON_TOKEN;
if (!token) {
  console.error("Missing EPSILON_TOKEN environment variable.");
  process.exit(1);
}

const startId = Number(process.env.WO_START_ID ?? 207);
const endId = Number(process.env.WO_END_ID ?? 306);
const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 15000);

const ids = Array.from({ length: endId - startId + 1 }, (_, idx) => startId + idx);

const fetchJson = async (woId: number): Promise<WoApiResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://app.epsilonengg.in/api/v2/wo/${woId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const payload = (await response.json()) as WoApiResponse;
    return payload;
  } finally {
    clearTimeout(timeout);
  }
};

const stats = {
  total: ids.length,
  success: 0,
  missing: 0,
  good: 0,
  warning: 0,
  bad: 0,
  unknown: 0,
  targetZeroPositiveTimeSaved: 0,
  timeSavedInconsistent: 0,
};

for (const woId of ids) {
  try {
    const payload = await fetchJson(woId);
    if (!payload.success || !payload.result?.wo) {
      stats.missing += 1;
      continue;
    }
    stats.success += 1;
    const rows = classifyApiPayload(payload);
    const woRow = rows.find((item) => item.rowKind === "WO");
    if (!woRow || woRow.rowKind !== "WO") {
      stats.unknown += 1;
      continue;
    }
    if (woRow.classification === "GOOD") stats.good += 1;
    if (woRow.classification === "WARNING") stats.warning += 1;
    if (woRow.classification === "BAD") stats.bad += 1;
    if (woRow.classification === "UNKNOWN") stats.unknown += 1;
    if (woRow.reasonCode === "TARGET_ZERO_TIME_SAVED_POSITIVE") {
      stats.targetZeroPositiveTimeSaved += 1;
    }
    const target = woRow.workOrder.targetDurationSec;
    const duration = woRow.workOrder.durationSec;
    const timeSaved = woRow.workOrder.timeSavedSec;
    const expected = target !== null && duration !== null ? target - duration : null;
    if (
      target !== null &&
      duration !== null &&
      timeSaved !== null &&
      expected !== null &&
      Math.abs(timeSaved - expected) > 1
    ) {
      stats.timeSavedInconsistent += 1;
    }
  } catch (error) {
    console.error(`WO ${woId} fetch/classify error`, error);
    stats.missing += 1;
  }
}

console.table(stats);
