import fs from "fs";
import path from "path";

const API_BASE_URL = "https://app.epsilonengg.in/api/v2";
const DEFAULT_CONCURRENCY = 10;

type Primitive = string | number | null | undefined;

interface DeviceLogEntry {
  log_id: number;
  wo_id: number;
  device_id: number;
  uid?: number;
  start_name?: string;
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

interface BenchmarkCase {
  label: string;
  startDate: string;
  endDate: string;
}

interface PersonBucket {
  key: string;
  name: string;
  uid: number | null;
  woIds: number[];
  logCount: number;
  deviceIds: number[];
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

function normalizeString(value: Primitive): string {
  return String(value ?? "").trim();
}

function normalizeNumber(value: Primitive): number | null {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : null;
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function fetchDeviceLogPage(
  deviceId: number,
  startDate: string,
  endDate: string,
  page: number,
  token: string,
): Promise<{ logs: DeviceLogEntry[]; totalPages: number }> {
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

async function fetchWoDetails(woId: number, token: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/wo/${woId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return false;
  }

  const json = await response.json();
  return Boolean(json?.success && json?.result?.wo);
}

async function fetchWoBatch(
  woIds: number[],
  token: string,
  concurrency: number,
): Promise<{ successCount: number; durationMs: number }> {
  const ids = [...new Set(woIds)];
  let successCount = 0;
  let index = 0;
  const startedAt = Date.now();

  async function worker(): Promise<void> {
    while (index < ids.length) {
      const nextId = ids[index++]!;
      if (await fetchWoDetails(nextId, token)) {
        successCount += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()),
  );

  return {
    successCount,
    durationMs: Date.now() - startedAt,
  };
}

function bucketPersonnel(logs: DeviceLogEntry[]): PersonBucket[] {
  const buckets = new Map<string, {
    key: string;
    name: string;
    uid: number | null;
    woIds: Set<number>;
    logCount: number;
    deviceIds: Set<number>;
  }>();

  for (const log of logs) {
    const name = normalizeString(log.start_name) || "Unknown";
    const uid = normalizeNumber(log.uid);
    const key = uid !== null ? `uid:${uid}` : `name:${name.toLowerCase()}`;
    const bucket = buckets.get(key) ?? {
      key,
      name,
      uid,
      woIds: new Set<number>(),
      logCount: 0,
      deviceIds: new Set<number>(),
    };

    bucket.logCount += 1;
    if (log.wo_id > 0) {
      bucket.woIds.add(log.wo_id);
    }
    if (log.device_id > 0) {
      bucket.deviceIds.add(log.device_id);
    }
    if (uid !== null && bucket.uid === null) {
      bucket.uid = uid;
    }
    if (name && bucket.name === "Unknown") {
      bucket.name = name;
    }

    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      key: bucket.key,
      name: bucket.name,
      uid: bucket.uid,
      woIds: Array.from(bucket.woIds).sort((left, right) => left - right),
      logCount: bucket.logCount,
      deviceIds: Array.from(bucket.deviceIds).sort((left, right) => left - right),
    }))
    .sort((left, right) => {
      if (right.woIds.length !== left.woIds.length) {
        return right.woIds.length - left.woIds.length;
      }
      return right.logCount - left.logCount;
    });
}

async function probeSummarySearch(
  token: string,
  startDate: string,
  endDate: string,
  deviceId: number,
): Promise<{ status: number; supported: boolean }> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    device_id: String(deviceId),
  });

  const response = await fetch(`${API_BASE_URL}/wo?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  return {
    status: response.status,
    supported: response.ok,
  };
}

async function runCase(
  testCase: BenchmarkCase,
  deviceIds: number[],
  token: string,
  concurrency: number,
): Promise<void> {
  const logsStartedAt = Date.now();
  const logBatches = await Promise.all(
    deviceIds.map((deviceId) =>
      fetchLogsForDevice(deviceId, testCase.startDate, testCase.endDate, token),
    ),
  );
  const logsDurationMs = Date.now() - logsStartedAt;

  const logs = logBatches.flatMap((batch) => batch.logs);
  const uniqueWoIds = [...new Set(logs.map((log) => log.wo_id).filter((woId) => woId > 0))].sort((a, b) => a - b);
  const personnel = bucketPersonnel(logs);
  const topPerson = personnel[0] ?? null;
  const medianPerson = personnel.length > 0 ? personnel[Math.floor(personnel.length / 2)]! : null;

  const topPersonWoBench = topPerson
    ? await fetchWoBatch(topPerson.woIds, token, concurrency)
    : { successCount: 0, durationMs: 0 };

  const allWoBench = await fetchWoBatch(uniqueWoIds, token, concurrency);
  const summarySearchProbe = await probeSummarySearch(
    token,
    testCase.startDate,
    testCase.endDate,
    deviceIds[0] ?? 15,
  );

  console.log(`\n=== ${testCase.label} ===`);
  console.table([
    {
      range: `${testCase.startDate} -> ${testCase.endDate}`,
      devices: deviceIds.join(","),
      logPages: logBatches.reduce((total, batch) => total + batch.pages, 0),
      totalLogs: logs.length,
      uniqueWos: uniqueWoIds.length,
      personnelCount: personnel.length,
      logsOnlyPreload: formatMs(logsDurationMs),
      currentFlowTotal: formatMs(logsDurationMs + allWoBench.durationMs),
      deferredWorstSelectedPerson: topPerson ? `${topPerson.name} (${topPerson.woIds.length} WOs)` : "n/a",
      deferredWorstTotal: formatMs(logsDurationMs + topPersonWoBench.durationMs),
      woSummarySearchStatus: summarySearchProbe.status,
    },
  ]);

  console.log("\nTop Personnel By WO Count");
  console.table(
    personnel.slice(0, 10).map((person) => ({
      name: person.name,
      uid: person.uid,
      uniqueWos: person.woIds.length,
      logCount: person.logCount,
      devices: person.deviceIds.join(","),
    })),
  );

  console.log("\nStrategy Detail");
  console.table([
    {
      strategy: "A) Logs-only preload",
      requests: logBatches.reduce((total, batch) => total + batch.pages, 0),
      phase1Time: formatMs(logsDurationMs),
      note: "Fastest possible today for discovery. Uses only /device-log.",
    },
    {
      strategy: "B) Current flow",
      requests: logBatches.reduce((total, batch) => total + batch.pages, 0) + uniqueWoIds.length,
      phase1Time: formatMs(logsDurationMs + allWoBench.durationMs),
      note: "Current behavior: logs + all /wo/:id summaries before selection.",
    },
    {
      strategy: "C) Deferred summaries",
      requests: logBatches.reduce((total, batch) => total + batch.pages, 0) + (topPerson?.woIds.length ?? 0),
      phase1Time: formatMs(logsDurationMs),
      note: topPerson
        ? `After selection, worst observed heavy person needs ${topPerson.woIds.length} WO summary calls taking ${formatMs(topPersonWoBench.durationMs)}.`
        : "No personnel found.",
    },
  ]);

  if (medianPerson) {
    console.log("\nMedian Personnel Snapshot");
    console.table([
      {
        name: medianPerson.name,
        uid: medianPerson.uid,
        uniqueWos: medianPerson.woIds.length,
        logCount: medianPerson.logCount,
        devices: medianPerson.deviceIds.join(","),
      },
    ]);
  }

  console.log("\nCapability Check");
  if (summarySearchProbe.supported) {
    console.log("A date-scoped WO summary list endpoint appears to exist. That could support a true summary-first strategy.");
  } else {
    console.log(
      `No date-scoped WO summary search endpoint was found at /api/v2/wo?... (HTTP ${summarySearchProbe.status}). /api/v2/wo/:id is lookup-only today.`,
    );
  }
}

async function main(): Promise<void> {
  loadDotEnvFile();

  const token = process.env.EPSILON_TOKEN || process.env.VITE_API_TOKEN;
  if (!token) {
    throw new Error("Missing EPSILON_TOKEN or VITE_API_TOKEN.");
  }

  const deviceIds = parseNumberList(process.env.DEVICE_IDS, [15, 19]);
  const concurrency = Number(process.env.WO_CONCURRENCY ?? DEFAULT_CONCURRENCY);
  const preset = normalizeString(process.env.BENCH_PRESET).toLowerCase() || "std";

  const casesByPreset: Record<string, BenchmarkCase[]> = {
    std: [
      {
        label: "1 Month",
        startDate: "15-02-2026 00:00",
        endDate: "15-03-2026 00:00",
      },
      {
        label: "6 Months",
        startDate: "15-09-2025 00:00",
        endDate: "15-03-2026 00:00",
      },
      {
        label: "1 Year",
        startDate: "15-03-2025 00:00",
        endDate: "15-03-2026 00:00",
      },
    ],
    short: [
      {
        label: "1 Month",
        startDate: "15-02-2026 00:00",
        endDate: "15-03-2026 00:00",
      },
      {
        label: "3 Months",
        startDate: "15-12-2025 00:00",
        endDate: "15-03-2026 00:00",
      },
    ],
  };

  const cases = casesByPreset[preset] ?? casesByPreset.std;

  console.log(`Benchmark preset: ${preset}`);
  console.log(`Devices: ${deviceIds.join(",")}`);
  console.log(`WO concurrency: ${concurrency}`);

  for (const testCase of cases) {
    await runCase(testCase, deviceIds, token, concurrency);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
