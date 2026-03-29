import type { IMarker, ITask } from "@svar-ui/react-gantt";
import { getMachineLabel } from "../report/machine-config";
import type { WoDetails } from "../report/report-types";

export interface ResolvedMachineWoWindow {
  machineId: number;
  machineLabel: string;
  woId: number;
  woDisplayId: string;
  operatorName: string;
  status: string;
  partNo: string;
  setting: string;
  start: Date;
  end: Date;
  extensionCount: number;
  progress: number;
}

export interface MachineWeekWoChartModel {
  tasks: ITask[];
  markers: IMarker[];
  totalWorkOrders: number;
  activeMachines: number;
  extensionCount: number;
}

export interface MachineWeekSummary {
  machineId: number;
  machineLabel: string;
  workOrderCount: number;
  latestWoDisplayId: string | null;
  latestStatus: string | null;
  latestOperator: string | null;
  latestWindowLabel: string | null;
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

function getLatestDate(values: Array<Date | null>): Date | null {
  const filtered = values.filter((value): value is Date => value instanceof Date);
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
}

function clampToWindow(start: Date, end: Date, windowStart: Date, windowEnd: Date) {
  const clampedStart =
    start.getTime() < windowStart.getTime() ? windowStart : start;
  const clampedEnd = end.getTime() > windowEnd.getTime() ? windowEnd : end;

  return clampedEnd.getTime() >= clampedStart.getTime()
    ? { start: clampedStart, end: clampedEnd }
    : null;
}

function uniqueNumbers(values: readonly number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function formatWindowLabel(start: Date, end: Date) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatRange(start, end);
}

export function resolveMachineWoWindows(input: {
  machineIds: readonly number[];
  machineWoIdsMap: Map<number, number[]>;
  woDetailsMap: Map<number, WoDetails>;
  windowStart: Date;
  windowEnd: Date;
}): ResolvedMachineWoWindow[] {
  const { machineIds, machineWoIdsMap, woDetailsMap, windowStart, windowEnd } = input;
  const windows: ResolvedMachineWoWindow[] = [];

  for (const machineId of machineIds) {
    const machineLabel = getMachineLabel(machineId);
    const woIds = uniqueNumbers(machineWoIdsMap.get(machineId) ?? []);

    for (const woId of woIds) {
      const details = woDetailsMap.get(woId);
      if (!details) {
        continue;
      }

      const start = parseDate(details.start_time);
      if (!start) {
        continue;
      }

      const latestExtension = getLatestDate(
        (details.extensions ?? []).map((extension) => parseDate(extension.extension_time)),
      );
      const end =
        getLatestDate([parseDate(details.end_time), latestExtension]) ?? windowEnd;
      const clamped = clampToWindow(start, end, windowStart, windowEnd);

      if (!clamped) {
        continue;
      }

      const allottedQty = details.alloted_qty ?? 0;
      const okQty = details.ok_qty ?? 0;
      const progress =
        allottedQty > 0
          ? Math.max(0, Math.min(100, Math.round((okQty / allottedQty) * 100)))
          : 0;

      windows.push({
        machineId,
        machineLabel,
        woId,
        woDisplayId: details.wo_id_str || String(woId),
        operatorName: details.start_name || "Unknown",
        status: details.status || "Unknown",
        partNo: details.part_no || "",
        setting: details.setting || "",
        start: clamped.start,
        end: clamped.end,
        extensionCount: details.extensions?.length ?? 0,
        progress,
      });
    }
  }

  return windows.sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function buildMachineWoWeekChartModel(input: {
  machineIds: readonly number[];
  windows: ResolvedMachineWoWindow[];
  searchQuery: string;
  windowStart: Date;
  windowEnd: Date;
}): MachineWeekWoChartModel {
  const { machineIds, windows, searchQuery, windowStart, windowEnd } = input;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const tasks: ITask[] = [];
  let totalWorkOrders = 0;
  let activeMachines = 0;
  let extensionCount = 0;

  for (const machineId of machineIds) {
    const machineLabel = getMachineLabel(machineId);
    const parentId = `machine-${machineId}`;
    const machineWindows = windows.filter((window) => window.machineId === machineId);
    const visibleWindows = machineWindows.filter((window) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        window.machineLabel,
        window.woDisplayId,
        window.operatorName,
        window.status,
        window.partNo,
        window.setting,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    if (visibleWindows.length === 0) {
      continue;
    }

    tasks.push({
      id: parentId,
      text: machineLabel,
      type: "summary",
      open: true,
      start: windowStart,
      end: windowEnd,
      details: `${visibleWindows.length} work order${visibleWindows.length === 1 ? "" : "s"}`,
    });

    activeMachines += 1;
    totalWorkOrders += visibleWindows.length;

    for (const window of visibleWindows) {
      extensionCount += window.extensionCount;
      tasks.push({
        id: `machine-${window.machineId}-wo-${window.woId}`,
        parent: parentId,
        text: `WO-${window.woDisplayId}`,
        type: "task",
        start: window.start,
        end: window.end,
        progress: window.progress,
        details: `${window.status} • ${window.operatorName}`,
      });
    }
  }

  return {
    tasks,
    markers: [
      { start: windowStart, text: "Week Start" },
      { start: windowEnd, text: "Now" },
    ],
    totalWorkOrders,
    activeMachines,
    extensionCount,
  };
}

export function buildMachineWeekSummaries(input: {
  machineIds: readonly number[];
  windows: ResolvedMachineWoWindow[];
}): MachineWeekSummary[] {
  const { machineIds, windows } = input;

  return machineIds.map((machineId) => {
    const machineLabel = getMachineLabel(machineId);
    const machineWindows = windows
      .filter((window) => window.machineId === machineId)
      .sort((left, right) => right.end.getTime() - left.end.getTime());
    const latest = machineWindows[0] ?? null;

    return {
      machineId,
      machineLabel,
      workOrderCount: machineWindows.length,
      latestWoDisplayId: latest?.woDisplayId ?? null,
      latestStatus: latest?.status ?? null,
      latestOperator: latest?.operatorName ?? null,
      latestWindowLabel: latest
        ? formatWindowLabel(latest.start, latest.end)
        : null,
    };
  });
}
