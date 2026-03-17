import { formatDateForApi } from "../report/api-client";
import type {
  DeviceLogEntry,
  ReportConfig,
  ReportRow,
  WoDetails,
} from "../report/report-types";

export const DEFAULT_DASHBOARD_MACHINE_IDS = [15, 16, 17, 18] as const;

function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toPositiveInteger(value: number | null | undefined): number | null {
  if (value == null || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export function mergeMachineIds(
  coreIds: readonly number[],
  extraIds: readonly number[],
): number[] {
  const seen = new Set<number>();
  const merged: number[] = [];

  for (const source of [coreIds, extraIds]) {
    for (const id of source) {
      const normalized = toPositiveInteger(id);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      merged.push(normalized);
    }
  }

  return merged;
}

export function parseManualMachineId(rawValue: string): number | null {
  const normalized = rawValue.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return toPositiveInteger(parsed);
}

export function collectUniqueOriginalLogs(rows: ReportRow[]): DeviceLogEntry[] {
  const seen = new Set<string>();

  return [...rows]
    .sort((left, right) => left.timestamp - right.timestamp)
    .flatMap((row) => {
      const originalLog = row.originalLog;
      if (!originalLog) {
        return [];
      }

      const dedupeKey = String(
        originalLog.log_id ??
          originalLog.id ??
          `${originalLog.log_time}|${originalLog.action}|${originalLog.wo_id}|${originalLog.device_id}`,
      );

      if (seen.has(dedupeKey)) {
        return [];
      }

      seen.add(dedupeKey);
      return [originalLog];
    });
}

interface BuildWoFetchConfigInput {
  woDetails: WoDetails | null;
  fallbackLogs: DeviceLogEntry[];
  fallbackDeviceId?: number | null;
  now?: Date;
}

export function buildWoFetchConfig({
  woDetails,
  fallbackLogs,
  fallbackDeviceId,
  now = new Date(),
}: BuildWoFetchConfigInput): ReportConfig | null {
  const sortedLogs = [...fallbackLogs].sort(
    (left, right) =>
      new Date(left.log_time).getTime() - new Date(right.log_time).getTime(),
  );
  const firstLog = sortedLogs[0];
  const lastLog = sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1] : null;

  const earliestLogDate = firstLog ? parseDateValue(firstLog.log_time) : null;
  const latestLogDate = lastLog ? parseDateValue(lastLog.log_time) : null;

  const deviceId =
    toPositiveInteger(woDetails?.device_id) ??
    toPositiveInteger(firstLog?.device_id) ??
    toPositiveInteger(fallbackDeviceId);

  const startDate = parseDateValue(woDetails?.start_time) ?? earliestLogDate;
  const resolvedEndDate =
    parseDateValue(woDetails?.end_time) ?? latestLogDate ?? now;

  if (!deviceId || !startDate || !resolvedEndDate) {
    return null;
  }

  const endDate =
    resolvedEndDate.getTime() >= startDate.getTime()
      ? resolvedEndDate
      : startDate;

  return {
    deviceId,
    startDate: formatDateForApi(startDate),
    endDate: formatDateForApi(endDate),
    toleranceSec: 10,
  };
}

export function buildWoFilename(
  woDisplayId: string,
  extension: "xlsx" | "pdf",
  options?: { grouped?: boolean },
): string {
  const normalized =
    woDisplayId
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown";

  const suffix = options?.grouped ? "_grouped" : "";
  return `wo_${normalized}${suffix}.${extension}`;
}
