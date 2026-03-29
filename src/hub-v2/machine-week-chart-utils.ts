import type { IMarker, ITask } from "@svar-ui/react-gantt";
import { getMachineLabel } from "../report/machine-config";
import { normalizeLogs } from "../report/log-normalizer";
import type { DeviceLogEntry, WoDetails } from "../report/report-types";

export interface MachineWeekChartModel {
  tasks: ITask[];
  markers: IMarker[];
  totalLogs: number;
  totalWorkOrders: number;
  activeMachines: number;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getWoDisplayId(logs: DeviceLogEntry[], details?: WoDetails): string {
  const firstNamedLog = logs.find((log) => typeof log.wo_name === "string" && log.wo_name.trim());
  return firstNamedLog?.wo_name?.trim() || details?.wo_id_str || String(logs[0]?.wo_id ?? "");
}

function getOperatorName(logs: DeviceLogEntry[], details?: WoDetails): string {
  const firstNamedLog = logs.find(
    (log) => typeof log.start_name === "string" && log.start_name.trim(),
  );
  return firstNamedLog?.start_name?.trim() || details?.start_name || "Unknown";
}

function clampToWindow(start: Date, end: Date, windowStart: Date, windowEnd: Date) {
  const clampedStart =
    start.getTime() < windowStart.getTime() ? windowStart : start;
  const clampedEnd = end.getTime() > windowEnd.getTime() ? windowEnd : end;

  return clampedEnd.getTime() >= clampedStart.getTime()
    ? { start: clampedStart, end: clampedEnd }
    : null;
}

function maxDate(dates: Array<Date | null>): Date | null {
  const filtered = dates.filter((value): value is Date => value instanceof Date);
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
}

function minDate(dates: Array<Date | null>): Date | null {
  const filtered = dates.filter((value): value is Date => value instanceof Date);
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((earliest, current) =>
    current.getTime() < earliest.getTime() ? current : earliest,
  );
}

export function buildMachineWeekChartModel(input: {
  logs: DeviceLogEntry[];
  woDetailsMap: Map<number, WoDetails>;
  machineIds: readonly number[];
  searchQuery: string;
  windowStart: Date;
  windowEnd: Date;
}): MachineWeekChartModel {
  const { logs, woDetailsMap, machineIds, searchQuery, windowStart, windowEnd } = input;
  const normalizedLogs = normalizeLogs(logs);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const groupedByMachine = new Map<number, Map<number, DeviceLogEntry[]>>();

  for (const log of normalizedLogs) {
    const machineId = log.device_id;
    const woId = log.wo_id;

    if (!machineIds.includes(machineId) || woId <= 0) {
      continue;
    }

    let machineMap = groupedByMachine.get(machineId);
    if (!machineMap) {
      machineMap = new Map<number, DeviceLogEntry[]>();
      groupedByMachine.set(machineId, machineMap);
    }

    const bucket = machineMap.get(woId) ?? [];
    bucket.push(log);
    machineMap.set(woId, bucket);
  }

  const tasks: ITask[] = [];
  let totalWorkOrders = 0;
  let activeMachines = 0;

  for (const machineId of machineIds) {
    const machineLabel = getMachineLabel(machineId);
    const machineTaskId = `machine-${machineId}`;
    const machineGroups = groupedByMachine.get(machineId) ?? new Map<number, DeviceLogEntry[]>();
    const childTasks: ITask[] = [];

    for (const [woId, machineLogs] of machineGroups.entries()) {
      const details = woDetailsMap.get(woId);
      const start = minDate([
        parseDate(details?.start_time),
        parseDate(machineLogs[0]?.log_time),
      ]);
      const extensionDates = (details?.extensions ?? [])
        .map((extension) => parseDate(extension.extension_time))
        .filter((value): value is Date => Boolean(value));
      const end = maxDate([
        parseDate(details?.end_time),
        parseDate(machineLogs[machineLogs.length - 1]?.log_time),
        extensionDates[extensionDates.length - 1] ?? null,
      ]);

      if (!start || !end) {
        continue;
      }

      const clamped = clampToWindow(start, end, windowStart, windowEnd);
      if (!clamped) {
        continue;
      }

      const woDisplayId = getWoDisplayId(machineLogs, details);
      const operatorName = getOperatorName(machineLogs, details);
      const searchText = [
        machineLabel,
        woDisplayId,
        operatorName,
        details?.part_no ?? "",
        details?.status ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (normalizedQuery && !searchText.includes(normalizedQuery)) {
        continue;
      }

      const allottedQty = details?.alloted_qty ?? 0;
      const okQty = details?.ok_qty ?? 0;
      const progress =
        allottedQty > 0
          ? Math.max(0, Math.min(100, Math.round((okQty / allottedQty) * 100)))
          : 0;

      childTasks.push({
        id: `machine-${machineId}-wo-${woId}`,
        parent: machineTaskId,
        text: `WO-${woDisplayId}`,
        start: clamped.start,
        end: clamped.end,
        type: "task",
        progress,
        details: `${machineLabel} • ${operatorName} • ${details?.status ?? "Unknown"}`,
      });
    }

    if (childTasks.length > 0) {
      activeMachines += 1;
      totalWorkOrders += childTasks.length;
    }

    tasks.push({
      id: machineTaskId,
      text: machineLabel,
      type: "summary",
      open: true,
      unscheduled: true,
      details: childTasks.length > 0 ? `${childTasks.length} work orders` : "No work orders in range",
    });
    tasks.push(...childTasks.sort((left, right) => {
      const leftStart = left.start?.getTime() ?? 0;
      const rightStart = right.start?.getTime() ?? 0;
      return leftStart - rightStart;
    }));
  }

  return {
    tasks,
    markers: [
      { start: windowStart, text: "Week Start" },
      { start: windowEnd, text: "Now" },
    ],
    totalLogs: normalizedLogs.length,
    totalWorkOrders,
    activeMachines,
  };
}
