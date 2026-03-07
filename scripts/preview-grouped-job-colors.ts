import fs from "fs";
import path from "path";
import { buildReport } from "../src/report/report-builder.js";
import {
  buildGroupedExportRows,
  resolveGroupedJobBlockFillColor,
} from "../src/report/export-utils.js";
import type {
  DeviceLogEntry,
  ReportConfig,
  WoDetails,
} from "../src/report/report-types.js";

const API_BASE_URL = "https://app.epsilonengg.in/api/v2";

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

    const value = rawValue.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

function parseNumberList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

async function fetchDeviceLogsDirect(
  config: ReportConfig,
  token: string,
): Promise<DeviceLogEntry[]> {
  const allLogs: DeviceLogEntry[] = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      start_date: config.startDate,
      end_date: config.endDate,
      device_id: String(config.deviceId),
      page: String(currentPage),
    });

    const response = await fetch(`${API_BASE_URL}/device-log?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Device log fetch failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (!json.success || !json.result?.logs) {
      throw new Error(json.error?.message || "Device log payload missing logs");
    }

    allLogs.push(...json.result.logs);
    totalPages = json.result.pagination?.total_pages || 1;
    currentPage = (json.result.pagination?.current_page || currentPage) + 1;
  } while (currentPage <= totalPages);

  return allLogs;
}

async function fetchWoDetailsDirect(woId: number, token: string): Promise<WoDetails | null> {
  const response = await fetch(`${API_BASE_URL}/wo/${woId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
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
    start_comment: wo.start_comment || wo.start_remarks || wo.start_reason || "",
    stop_comment: wo.stop_comment || wo.stop_remarks || wo.stop_reason || "",
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
  };
}

async function fetchAllWoDetailsDirect(woIds: number[], token: string): Promise<Map<number, WoDetails>> {
  const uniqueIds = [...new Set(woIds)];
  const woDetailsMap = new Map<number, WoDetails>();

  for (const woId of uniqueIds) {
    const details = await fetchWoDetailsDirect(woId, token);
    if (details) {
      woDetailsMap.set(woId, details);
    }
  }

  return woDetailsMap;
}

async function main(): Promise<void> {
  loadDotEnvFile();

  const token = process.env.EPSILON_TOKEN || process.env.VITE_API_TOKEN;
  if (!token) {
    throw new Error("Missing EPSILON_TOKEN or VITE_API_TOKEN.");
  }

  const config: ReportConfig = {
    deviceId: Number(process.env.DEVICE_ID ?? 15),
    startDate: process.env.START_DATE ?? "01-03-2026 11:00",
    endDate: process.env.END_DATE ?? "07-03-2026 17:00",
    toleranceSec: Number(process.env.TOLERANCE_SEC ?? 10),
  };

  const requestedWoIds = parseNumberList(process.env.WO_IDS);
  const requestedJobTypes = new Set(parseNumberList(process.env.JOB_TYPES).map(String));
  const includeProductionBlocks = process.env.INCLUDE_PRODUCTION_BLOCKS === "1";

  const rawLogs = await fetchDeviceLogsDirect(config, token);
  const startEvents = rawLogs.filter((log) =>
    (log.action === "WO_START" || log.action === "MTR_ON") && log.job_type != null,
  );

  const filteredStarts = startEvents.filter((log) => {
    if (requestedWoIds.length > 0 && !requestedWoIds.includes(log.wo_id)) {
      return false;
    }

    if (requestedJobTypes.size > 0 && !requestedJobTypes.has(String(log.job_type))) {
      return false;
    }

    return true;
  });

  const selectedWoIds = filteredStarts.map((log) => log.wo_id);
  const filteredLogs = rawLogs.filter((log) => {
    if (selectedWoIds.length === 0) return requestedWoIds.length === 0 && requestedJobTypes.size === 0;
    return selectedWoIds.includes(log.wo_id);
  });

  const woDetailsMap = await fetchAllWoDetailsDirect(
    selectedWoIds.length > 0 ? selectedWoIds : rawLogs.map((log) => log.wo_id),
    token,
  );

  const { rows } = buildReport(filteredLogs, woDetailsMap, config);
  const groupedRows = buildGroupedExportRows(rows, woDetailsMap);
  const jobBlockRows = groupedRows.filter((row) => {
    if (row.style !== "jobBlock") return false;
    if (includeProductionBlocks) return true;
    return row.jobType !== "Production";
  });

  console.log("\nPreview Config");
  console.table([{
    deviceId: config.deviceId,
    startDate: config.startDate,
    endDate: config.endDate,
    selectedWoCount: selectedWoIds.length || "all",
    selectedJobTypes: requestedJobTypes.size > 0 ? Array.from(requestedJobTypes).join(",") : "all",
    includeProductionBlocks,
  }]);

  console.log("\nRaw Start Events");
  console.table(filteredStarts.map((log) => ({
    logId: log.log_id,
    woId: log.wo_id,
    action: log.action,
    rawJobType: String(log.job_type),
    partNo: String(log.part_no || "").trim(),
    operator: String(log.start_name || "").trim(),
    comment: String(log.start_comment || "").replace(/\s+/g, " ").trim(),
  })));

  console.log("\nGrouped Excel Job Block Preview");
  console.table(jobBlockRows.map((row) => ({
    woId: row.woId || "",
    jobType: row.jobType || "",
    color: resolveGroupedJobBlockFillColor(row.jobType || "Other"),
    action: row.row.Action,
    time: row.row.TIME,
    job: row.row.JOB,
    notes: row.row.Notes,
    operator: row.row.OP,
  })));

  if (jobBlockRows.length === 0) {
    console.log("No grouped non-production job blocks found for the current filters.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
