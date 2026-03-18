import { formatDateForApi } from "../report/api-client";
import type {
  DeviceLogEntry,
  ReportConfig,
  ReportRow,
  WoDetails,
} from "../report/report-types";

// VMC 1(11), VMC 2(12), VMC 3(13), VMC 4(14), VMC 5(15), VMC 6(16), VMC 7(19), CNC 1(18)
// All 8 machines are now loaded by default on the Hub dashboard.
export const DEFAULT_DASHBOARD_MACHINE_IDS = [11, 12, 13, 14, 15, 16, 19, 18] as const;

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

function resolveDashboardMachineRank(
  machineId: number | null | undefined,
  orderedMachineIds: readonly number[],
): number {
  if (!machineId) {
    return Number.MAX_SAFE_INTEGER;
  }

  const orderedIndex = orderedMachineIds.indexOf(machineId);
  if (orderedIndex >= 0) {
    return orderedIndex;
  }

  return orderedMachineIds.length + machineId;
}

export function compareDashboardMachineOrder(
  leftMachineId: number | null | undefined,
  rightMachineId: number | null | undefined,
  orderedMachineIds: readonly number[],
): number {
  const leftRank = resolveDashboardMachineRank(leftMachineId, orderedMachineIds);
  const rightRank = resolveDashboardMachineRank(
    rightMachineId,
    orderedMachineIds,
  );

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (leftMachineId == null && rightMachineId == null) {
    return 0;
  }

  if (leftMachineId == null) {
    return 1;
  }

  if (rightMachineId == null) {
    return -1;
  }

  return leftMachineId - rightMachineId;
}

export function selectPreferredCardsPerMachine<
  T extends {
    executionStatus: string;
    latestTimestamp: number;
    machineId: number | null;
    woId: string;
  },
>(
  cards: readonly T[],
  statusPriority: Readonly<Record<string, number>>,
): T[] {
  const selectedByMachine = new Map<string, T>();

  for (const card of cards) {
    const key =
      card.machineId == null ? `wo:${card.woId}` : `machine:${card.machineId}`;
    const existing = selectedByMachine.get(key);

    if (!existing) {
      selectedByMachine.set(key, card);
      continue;
    }

    const nextRank = statusPriority[card.executionStatus] ?? Number.MAX_SAFE_INTEGER;
    const existingRank =
      statusPriority[existing.executionStatus] ?? Number.MAX_SAFE_INTEGER;

    if (nextRank < existingRank) {
      selectedByMachine.set(key, card);
      continue;
    }

    if (
      nextRank === existingRank &&
      card.latestTimestamp > existing.latestTimestamp
    ) {
      selectedByMachine.set(key, card);
    }
  }

  return [...selectedByMachine.values()];
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
