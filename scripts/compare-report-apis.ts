import fs from "fs";
import path from "path";

const API_BASE_URL = "https://app.epsilonengg.in/api/v2";

type Primitive = string | number | null | undefined;

interface DeviceLogEntry {
  log_id: number;
  wo_id: number;
  device_id: number;
  uid?: number;
  start_name?: string;
  setting?: string;
  part_no?: string;
  alloted_qty?: number;
  ok_qty?: number;
  reject_qty?: number;
  pcl?: string | number;
  start_time?: string;
  end_time?: string;
  duration?: number;
  job_type?: string | number;
  [key: string]: unknown;
}

interface DeviceLogApiResponse {
  success: boolean;
  result?: {
    logs?: DeviceLogEntry[];
    pagination?: {
      total_pages?: number;
      current_page?: number;
    };
  };
  error?: {
    message?: string;
  };
}

interface WoDetails {
  id: number;
  start_uid: number | null;
  start_name: string;
  setting: string;
  part_no: string;
  alloted_qty: number;
  ok_qty: number;
  reject_qty: number;
  pcl: number | null;
  start_time: string | null;
  end_time: string | null;
  duration: number;
  job_type?: number | string;
  device_id: number;
}

interface WoApiResponse {
  success: boolean;
  result?: {
    wo?: Record<string, unknown>;
  };
  error?: {
    message?: string;
  };
}

interface AggregatedLogSummary {
  woId: number;
  deviceIds: number[];
  logCount: number;
  uid?: number;
  start_name?: string;
  setting?: string;
  part_no?: string;
  alloted_qty?: number;
  ok_qty?: number;
  reject_qty?: number;
  pcl?: string | number;
  start_time?: string;
  end_time?: string;
  duration?: number;
  job_type?: string | number;
}

function loadDotEnvFile(): void {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function parseNumberList(value: string | undefined, fallback: number[]): number[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function normalizeString(value: Primitive): string | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeNumber(value: Primitive): number | undefined {
  if (value == null || value === "") return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function valuesMatch(logValue: Primitive, woValue: Primitive): boolean {
  const logNumber = normalizeNumber(logValue);
  const woNumber = normalizeNumber(woValue);
  if (logNumber !== undefined && woNumber !== undefined) {
    return logNumber === woNumber;
  }

  const logString = normalizeString(logValue);
  const woString = normalizeString(woValue);
  if (logString !== undefined && woString !== undefined) {
    return logString.toLowerCase() === woString.toLowerCase();
  }

  return false;
}

async function fetchDeviceLogPage(
  deviceId: number,
  startDate: string,
  endDate: string,
  page: number,
  token: string,
): Promise<{ logs: DeviceLogEntry[]; totalPages: number; currentPage: number }> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    device_id: String(deviceId),
    page: String(page),
  });

  const response = await fetch(`${API_BASE_URL}/device-log?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`device-log failed for device ${deviceId} page ${page}: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as DeviceLogApiResponse;
  if (!json.success || !json.result?.logs) {
    throw new Error(json.error?.message ?? `device-log returned invalid payload for device ${deviceId} page ${page}`);
  }

  return {
    logs: json.result.logs,
    totalPages: json.result.pagination?.total_pages ?? 1,
    currentPage: json.result.pagination?.current_page ?? page,
  };
}

async function fetchLogsForDevice(
  deviceId: number,
  startDate: string,
  endDate: string,
  token: string,
): Promise<{ logs: DeviceLogEntry[]; pages: number }> {
  const first = await fetchDeviceLogPage(deviceId, startDate, endDate, 1, token);

  if (first.totalPages <= 1) {
    return { logs: first.logs, pages: 1 };
  }

  const remaining = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) =>
      fetchDeviceLogPage(deviceId, startDate, endDate, index + 2, token),
    ),
  );

  return {
    logs: [...first.logs, ...remaining.flatMap((pageResult) => pageResult.logs)],
    pages: first.totalPages,
  };
}

async function fetchWoDetails(woId: number, token: string): Promise<WoDetails | null> {
  const response = await fetch(`${API_BASE_URL}/wo/${woId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as WoApiResponse;
  const wo = json.result?.wo;
  if (!json.success || !wo) {
    return null;
  }

  const details: WoDetails = {
    id: normalizeNumber(wo.id as Primitive) ?? woId,
    start_uid: normalizeNumber(wo.start_uid as Primitive) ?? null,
    start_name: normalizeString(wo.start_name as Primitive) ?? "",
    setting: normalizeString(wo.setting as Primitive) ?? "",
    part_no: normalizeString(wo.part_no as Primitive) ?? "",
    alloted_qty: normalizeNumber(wo.alloted_qty as Primitive) ?? 0,
    ok_qty: normalizeNumber(wo.ok_qty as Primitive) ?? 0,
    reject_qty: normalizeNumber(wo.reject_qty as Primitive) ?? 0,
    pcl: normalizeNumber(wo.pcl as Primitive) ?? null,
    start_time: normalizeString(wo.start_time as Primitive) ?? null,
    end_time: normalizeString(wo.end_time as Primitive) ?? null,
    duration: normalizeNumber(wo.duration as Primitive) ?? 0,
    device_id: normalizeNumber(wo.device_id as Primitive) ?? 0,
  };

  const jobType = wo.job_type as string | number | undefined;
  if (jobType !== undefined) {
    details.job_type = jobType;
  }

  return details;
}

async function fetchAllWoDetails(
  woIds: number[],
  token: string,
  concurrency: number,
): Promise<Map<number, WoDetails>> {
  const ids = [...new Set(woIds)];
  const results = new Map<number, WoDetails>();
  let index = 0;

  async function worker(): Promise<void> {
    while (index < ids.length) {
      const nextId = ids[index++]!;
      const details = await fetchWoDetails(nextId, token);
      if (details) {
        results.set(nextId, details);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()),
  );

  return results;
}

function aggregateLogsByWo(logs: DeviceLogEntry[]): Map<number, AggregatedLogSummary> {
  const byWo = new Map<number, AggregatedLogSummary>();

  for (const log of logs) {
    if (!Number.isFinite(log.wo_id) || log.wo_id <= 0) continue;

    const existing = byWo.get(log.wo_id) ?? {
      woId: log.wo_id,
      deviceIds: [],
      logCount: 0,
    };

    existing.logCount += 1;
    if (!existing.deviceIds.includes(log.device_id)) {
      existing.deviceIds.push(log.device_id);
      existing.deviceIds.sort((left, right) => left - right);
    }

    for (const field of [
      "uid",
      "start_name",
      "setting",
      "part_no",
      "alloted_qty",
      "ok_qty",
      "reject_qty",
      "pcl",
      "start_time",
      "end_time",
      "duration",
      "job_type",
    ] as const) {
      const current = existing[field];
      const next = log[field];
      if ((current == null || current === "") && next != null && next !== "") {
        existing[field] = next as never;
      }
    }

    byWo.set(log.wo_id, existing);
  }

  return byWo;
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main(): Promise<void> {
  loadDotEnvFile();

  const token = process.env.EPSILON_TOKEN || process.env.VITE_API_TOKEN;
  if (!token) {
    throw new Error("Missing EPSILON_TOKEN or VITE_API_TOKEN.");
  }

  const deviceIds = parseNumberList(process.env.DEVICE_IDS, [15, 19]);
  const startDate = process.env.START_DATE ?? "10-03-2026 04:11";
  const endDate = process.env.END_DATE ?? "14-03-2026 04:11";
  const woLimit = normalizeNumber(process.env.WO_LIMIT) ?? 0;
  const concurrency = normalizeNumber(process.env.WO_CONCURRENCY) ?? 10;

  const deviceLogStartedAt = Date.now();
  const perDeviceResults = await Promise.all(
    deviceIds.map((deviceId) => fetchLogsForDevice(deviceId, startDate, endDate, token)),
  );
  const deviceLogDurationMs = Date.now() - deviceLogStartedAt;

  const logs = perDeviceResults.flatMap((item) => item.logs);
  const logsByWo = aggregateLogsByWo(logs);
  const allWoIds = Array.from(logsByWo.keys()).sort((left, right) => left - right);
  const selectedWoIds = woLimit > 0 ? allWoIds.slice(0, woLimit) : allWoIds;

  const woFetchStartedAt = Date.now();
  const woDetailsMap = await fetchAllWoDetails(selectedWoIds, token, concurrency);
  const woFetchDurationMs = Date.now() - woFetchStartedAt;

  const fieldComparisons = [
    { logField: "uid", woField: "start_uid" },
    { logField: "start_name", woField: "start_name" },
    { logField: "setting", woField: "setting" },
    { logField: "part_no", woField: "part_no" },
    { logField: "alloted_qty", woField: "alloted_qty" },
    { logField: "ok_qty", woField: "ok_qty" },
    { logField: "reject_qty", woField: "reject_qty" },
    { logField: "pcl", woField: "pcl" },
    { logField: "start_time", woField: "start_time" },
    { logField: "end_time", woField: "end_time" },
    { logField: "duration", woField: "duration" },
    { logField: "job_type", woField: "job_type" },
  ] as const;

  const coverageStats = new Map<string, {
    presentInLogs: number;
    presentInWo: number;
    exactMatch: number;
    mismatch: number;
    missingInLogs: number;
  }>();
  const mismatches: Array<Record<string, unknown>> = [];

  for (const comparison of fieldComparisons) {
    coverageStats.set(comparison.logField, {
      presentInLogs: 0,
      presentInWo: 0,
      exactMatch: 0,
      mismatch: 0,
      missingInLogs: 0,
    });
  }

  for (const [woId, woDetails] of woDetailsMap.entries()) {
    const summary = logsByWo.get(woId);
    if (!summary) continue;

    for (const comparison of fieldComparisons) {
      const stats = coverageStats.get(comparison.logField)!;
      const logValue = summary[comparison.logField];
      const woValue = woDetails[comparison.woField];

      if (normalizeString(woValue as Primitive) !== undefined || normalizeNumber(woValue as Primitive) !== undefined) {
        stats.presentInWo += 1;
      }

      if (normalizeString(logValue as Primitive) !== undefined || normalizeNumber(logValue as Primitive) !== undefined) {
        stats.presentInLogs += 1;
      } else {
        stats.missingInLogs += 1;
      }

      if (valuesMatch(logValue as Primitive, woValue as Primitive)) {
        stats.exactMatch += 1;
      } else if (
        (normalizeString(woValue as Primitive) !== undefined || normalizeNumber(woValue as Primitive) !== undefined) &&
        (normalizeString(logValue as Primitive) !== undefined || normalizeNumber(logValue as Primitive) !== undefined)
      ) {
        stats.mismatch += 1;
        if (mismatches.length < 20) {
          mismatches.push({
            woId,
            field: comparison.logField,
            logValue: logValue ?? null,
            woValue: woValue ?? null,
            logCount: summary.logCount,
            deviceIds: summary.deviceIds.join(","),
          });
        }
      }
    }
  }

  const personnelFieldNames = ["uid", "start_name"];
  const personnelReadyCount = Array.from(woDetailsMap.keys()).filter((woId) => {
    const summary = logsByWo.get(woId);
    if (!summary) return false;
    return personnelFieldNames.every((field) => {
      const value = summary[field as keyof AggregatedLogSummary];
      return normalizeString(value as Primitive) !== undefined || normalizeNumber(value as Primitive) !== undefined;
    });
  }).length;

  console.log("\nRequest Shape");
  console.table([
    {
      deviceIds: deviceIds.join(","),
      startDate,
      endDate,
      deviceLogRequests: perDeviceResults.reduce((total, item) => total + item.pages, 0),
      totalLogs: logs.length,
      uniqueWos: allWoIds.length,
      woRequestsPlanned: selectedWoIds.length,
      woRequestsSucceeded: woDetailsMap.size,
      deviceLogTime: formatMs(deviceLogDurationMs),
      woFetchTime: formatMs(woFetchDurationMs),
    },
  ]);

  console.log("\nPer Device Log Pagination");
  console.table(
    deviceIds.map((deviceId, index) => ({
      deviceId,
      pages: perDeviceResults[index]?.pages ?? 0,
      logs: perDeviceResults[index]?.logs.length ?? 0,
    })),
  );

  console.log("\nField Coverage: /device-log compared with /api/v2/wo/:id");
  console.table(
    Array.from(coverageStats.entries()).map(([field, stats]) => ({
      field,
      presentInLogs: stats.presentInLogs,
      presentInWo: stats.presentInWo,
      exactMatch: stats.exactMatch,
      mismatch: stats.mismatch,
      missingInLogs: stats.missingInLogs,
      logCoveragePct: woDetailsMap.size > 0 ? ((stats.presentInLogs / woDetailsMap.size) * 100).toFixed(1) : "0.0",
      exactMatchPct: woDetailsMap.size > 0 ? ((stats.exactMatch / woDetailsMap.size) * 100).toFixed(1) : "0.0",
    })),
  );

  console.log("\nPersonnel Readiness");
  console.table([
    {
      woDetailsCompared: woDetailsMap.size,
      logsWithUidAndStartName: personnelReadyCount,
      readinessPct: woDetailsMap.size > 0 ? ((personnelReadyCount / woDetailsMap.size) * 100).toFixed(1) : "0.0",
    },
  ]);

  if (mismatches.length > 0) {
    console.log("\nMismatch Samples");
    console.table(mismatches);
  }

  const uidCoverage = coverageStats.get("uid")?.presentInLogs ?? 0;
  const startNameCoverage = coverageStats.get("start_name")?.presentInLogs ?? 0;
  const enoughForPersonnelPreload =
    woDetailsMap.size > 0 &&
    uidCoverage / woDetailsMap.size >= 0.95 &&
    startNameCoverage / woDetailsMap.size >= 0.95;

  console.log("\nRecommendation");
  if (enoughForPersonnelPreload) {
    console.log(
      "Use /device-log only for Step 1 personnel preload. Fetch /api/v2/wo/:id only after a person is selected to build the final report.",
    );
  } else {
    console.log(
      "Do not rely only on /device-log for Step 1 yet. If personnel fields are incomplete, add a bulk WO summary endpoint instead of calling /api/v2/wo/:id once per WO.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
