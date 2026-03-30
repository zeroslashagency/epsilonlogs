import {
  DeviceLogApiResponse,
  DeviceLogEntry,
  ReportConfig,
  WoDetails,
  WoSummaryApiResponse,
  WoSummaryEntry,
} from "./report-types";

const API_BASE_URL = "/api/v2";
const WO_API_BASE_URL = "/api/v1";
const woDetailsRequestCache = new Map<number, Promise<WoDetails | null>>();

interface DevicesApiResponse {
  success: boolean;
  result?: {
    devices?: Array<{
      id?: number;
      name?: string;
    }>;
  };
}

export interface DeviceLogsFetchProgress {
  deviceId: number;
  completedPages: number;
  totalPages: number;
}

export interface WoDetailsFetchProgress {
  completed: number;
  total: number;
  woId: number;
}

export interface WoSummaryFetchConfig {
  startDate: string;
  endDate: string;
  userId?: number;
  deviceId?: number;
}

async function fetchWoSummaryPage(
  page: number,
  config: WoSummaryFetchConfig,
  token: string,
  signal?: AbortSignal,
): Promise<{ workOrders: WoSummaryEntry[]; totalPages: number }> {
  const params = new URLSearchParams({
    start_date: config.startDate,
    end_date: config.endDate,
    page: String(page),
  });

  if (typeof config.userId === "number") {
    params.set("user_id", String(config.userId));
  }

  if (typeof config.deviceId === "number") {
    params.set("device_id", String(config.deviceId));
  }

  const response = await fetch(`${WO_API_BASE_URL}/wo?${params.toString()}`, {
    method: "GET",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: signal ?? null,
  });

  if (!response.ok) {
    throw new Error(`WO API Error: ${response.status} ${response.statusText}`);
  }

  const responseText = await response.text();
  let json: WoSummaryApiResponse;

  try {
    json = JSON.parse(responseText) as WoSummaryApiResponse;
  } catch {
    throw new Error(
      `WO API returned non-JSON response. Check /api/v1 proxy configuration.`,
    );
  }

  if (!json.success || !json.result?.work_orders) {
    throw new Error(json.error?.message ?? "Failed to fetch work orders");
  }

  return {
    workOrders: json.result.work_orders.map((workOrder) => ({
      id: workOrder.id || 0,
      wo_id: String(workOrder.wo_id || workOrder.id || ""),
      start_uid: workOrder.start_uid ?? null,
      device_id: workOrder.device_id || 0,
      setting: workOrder.setting || "",
      start_time: workOrder.start_time || null,
      end_time: workOrder.end_time || null,
      part_no: workOrder.part_no || "",
      alloted_qty: workOrder.alloted_qty || 0,
      start_comment: workOrder.start_comment || "",
      ok_qty: workOrder.ok_qty || 0,
      reject_qty: workOrder.reject_qty || 0,
      stop_comment: workOrder.stop_comment || "",
      status: workOrder.status || "Unknown",
      stop_uid: workOrder.stop_uid ?? null,
      pcl: workOrder.pcl ?? null,
      duration: workOrder.duration ?? null,
      target_duration: workOrder.target_duration ?? null,
      idle_time: workOrder.idle_time ?? null,
    })),
    totalPages: json.result.pagination?.total_pages ?? 1,
  };
}

export async function fetchWoSummaries(
  config: WoSummaryFetchConfig,
  token: string,
  signal?: AbortSignal,
): Promise<WoSummaryEntry[]> {
  const first = await fetchWoSummaryPage(1, config, token, signal);
  const allWorkOrders = [...first.workOrders];

  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await fetchWoSummaryPage(page, config, token, signal);
    allWorkOrders.push(...next.workOrders);
  }

  return allWorkOrders;
}

/**
 * Internal: fetches a single page of device logs.
 */
async function fetchDeviceLogPage(
  page: number,
  config: ReportConfig,
  token: string,
  signal?: AbortSignal,
): Promise<{ logs: DeviceLogEntry[]; totalPages: number }> {
  const { deviceId, startDate, endDate } = config;
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    device_id: deviceId.toString(),
    page: page.toString(),
  });

  const url = `${API_BASE_URL}/device-log?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: signal ?? null,
  });

  if (!response.ok) {
    throw new Error(
      `Device Log API Error: ${response.status} ${response.statusText}`,
    );
  }

  const json: DeviceLogApiResponse = await response.json();

  if (!json.success || !json.result?.logs) {
    throw new Error(json.error?.message ?? "Failed to fetch device logs");
  }

  return {
    logs: json.result.logs,
    totalPages: json.result.pagination?.total_pages ?? 1,
  };
}

/**
 * Fetches ALL pages of device logs in parallel.
 * Page 1 is fetched first to discover total_pages, then remaining
 * pages are requested concurrently via Promise.all.
 */
export async function fetchDeviceLogs(
  config: ReportConfig,
  token: string,
  signal?: AbortSignal,
  onProgress?: (progress: DeviceLogsFetchProgress) => void,
): Promise<DeviceLogEntry[]> {
  // 1. Fetch page 1 to discover total_pages
  const first = await fetchDeviceLogPage(1, config, token, signal);
  const totalPages = Math.max(1, first.totalPages);
  let completedPages = 1;

  onProgress?.({
    deviceId: config.deviceId,
    completedPages,
    totalPages,
  });

  if (first.totalPages <= 1) {
    return first.logs;
  }

  // 2. Fetch remaining pages in parallel
  const remaining = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) =>
      fetchDeviceLogPage(i + 2, config, token, signal).then((result) => {
        completedPages += 1;
        onProgress?.({
          deviceId: config.deviceId,
          completedPages,
          totalPages,
        });
        return result.logs;
      }),
    ),
  );

  return [...first.logs, ...remaining.flat()];
}

/**
 * Fetches only the latest device-log pages.
 * This is used by the live dashboard so it doesn't need to load
 * the full device history for every machine on every refresh.
 */
export async function fetchLatestDeviceLogs(
  config: ReportConfig,
  token: string,
  signal?: AbortSignal,
  pagesBack = 2,
  onProgress?: (progress: DeviceLogsFetchProgress) => void,
): Promise<DeviceLogEntry[]> {
  const first = await fetchDeviceLogPage(1, config, token, signal);
  const startPage = Math.max(2, first.totalPages - pagesBack + 1);
  const latestPageCount = Math.max(0, first.totalPages - startPage + 1);
  const totalPages = 1 + latestPageCount;
  let completedPages = 1;

  onProgress?.({
    deviceId: config.deviceId,
    completedPages,
    totalPages,
  });

  if (first.totalPages <= 1) {
    return first.logs;
  }

  const latestPages = await Promise.all(
    Array.from({ length: latestPageCount }, (_, i) =>
      fetchDeviceLogPage(startPage + i, config, token, signal).then((result) => {
        completedPages += 1;
        onProgress?.({
          deviceId: config.deviceId,
          completedPages,
          totalPages,
        });
        return result.logs;
      }),
    ),
  );

  return latestPages.flat();
}

export async function fetchWoDetails(
  woId: number,
  token: string,
): Promise<WoDetails | null> {
  const cachedRequest = woDetailsRequestCache.get(woId);
  if (cachedRequest) {
    return cachedRequest;
  }

  const url = `${API_BASE_URL}/wo/${woId}`;

  const request = (async () => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch WO ${woId}: ${response.status}`);
        return null;
      }

      const json = await response.json();

      if (!json.success || !json.result?.wo) {
        return null;
      }

      const wo = json.result.wo;
      const extensions = json.result.extensions || [];

      return {
        id: wo.id || 0,
        pcl: wo.pcl || null,
        start_time: wo.start_time || null,
        end_time: wo.end_time || null,
        start_uid: wo.start_uid || null,
        stop_uid: wo.stop_uid || null,
        extensions: extensions.map((ext: any) => ({
          id: ext.id || 0,
          wo_id: ext.wo_id || woId,
          extension_time: ext.extension_time || null,
          extension_comment: ext.extension_comment || null,
          extension_duration: ext.extension_duration || 0,
        })),
        wo_id_str: String(wo.wo_id || woId),
        part_no: wo.part_no || "",
        start_name: wo.start_name || "",
        stop_name: wo.stop_name || "",
        start_comment:
          wo.start_comment || wo.start_remarks || wo.start_reason || "",
        stop_comment:
          wo.stop_comment || wo.stop_remarks || wo.stop_reason || "",
        setting: wo.setting || "",
        alloted_qty: wo.alloted_qty || 0,
        ok_qty: wo.ok_qty || 0,
        reject_qty: wo.reject_qty || 0,
        device_id: wo.device_id || 0,
        duration: wo.duration || 0,
        job_type: wo.job_type,
        target_duration: wo.target_duration,
        time_saved: wo.time_saved ?? null,
        load_time: wo.load_time ?? null,
        idle_time: wo.idle_time ?? null,
        battery_level: wo.battery_level ?? null,
        status: wo.status ?? null,
      };
    } catch (error) {
      console.error(`Error fetching WO ${woId}:`, error);
      return null;
    } finally {
      woDetailsRequestCache.delete(woId);
    }
  })();

  woDetailsRequestCache.set(woId, request);
  return request;
}

/**
 * Fetches WO details for multiple IDs using a concurrency pool.
 * Up to CONCURRENCY requests run simultaneously instead of batching
 * sequentially, eliminating idle time between batches.
 */
export async function fetchAllWoDetails(
  woIds: number[],
  token: string,
  onProgress?: (progress: WoDetailsFetchProgress) => void,
): Promise<Map<number, WoDetails>> {
  const uniqueIds = [...new Set(woIds)];
  const results = new Map<number, WoDetails>();

  if (uniqueIds.length === 0) {
    return results;
  }

  const CONCURRENCY = 10;
  const total = uniqueIds.length;
  let index = 0;
  let completed = 0;

  async function runNext(): Promise<void> {
    while (index < uniqueIds.length) {
      const id = uniqueIds[index++]!;
      const wo = await fetchWoDetails(id, token);
      if (wo) {
        results.set(id, wo);
      }

      completed += 1;
      onProgress?.({
        completed,
        total,
        woId: id,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, uniqueIds.length) }, runNext),
  );

  return results;
}

export async function fetchDeviceNameMap(
  token: string,
): Promise<Map<number, string>> {
  const url = `${API_BASE_URL}/devices`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn(
        `Failed to fetch devices: ${response.status} ${response.statusText}`,
      );
      return new Map();
    }

    const json: DevicesApiResponse = await response.json();
    if (!json.success || !json.result?.devices) {
      return new Map();
    }

    const nameMap = new Map<number, string>();
    for (const device of json.result.devices) {
      if (
        typeof device.id === "number" &&
        typeof device.name === "string" &&
        device.name.trim()
      ) {
        nameMap.set(device.id, device.name.trim());
      }
    }

    return nameMap;
  } catch (error) {
    console.warn("Failed to fetch device names:", error);
    return new Map();
  }
}

export function formatDateForApi(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}
