import type { IMarker, ITask } from "@svar-ui/react-gantt";
import type { DeviceLogEntry, ReportRow, WoDetails } from "../report/report-types";
import { collectUniqueOriginalLogs } from "./wo-report-utils";

const ACTIVE_START_ACTIONS = new Set(["WO_START", "WO_RESUME"]);
const ACTIVE_END_ACTIONS = new Set(["WO_PAUSE", "WO_STOP"]);
const PAUSE_START_ACTION = "WO_PAUSE";
const PAUSE_END_ACTIONS = new Set(["WO_RESUME", "WO_STOP"]);
const PAUSE_REASON_TOLERANCE_MS = 5 * 60 * 1000;

export interface WoTimelineModel {
  tasks: ITask[];
  markers: IMarker[];
  windowStart: Date;
  windowEnd: Date;
  activeSpanCount: number;
  pauseCount: number;
  extensionCount: number;
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

function clampEnd(start: Date, end: Date): Date {
  return end.getTime() >= start.getTime() ? end : start;
}

function compactText(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function formatTaskDetails(parts: Array<string | null | undefined>): string | undefined {
  const items = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0));

  return items.length > 0 ? items.join(" • ") : undefined;
}

function getLatestDate(dates: Array<Date | null>): Date | null {
  const filtered = dates.filter((value): value is Date => value instanceof Date);
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
}

function resolvePauseReason(
  pauseStart: Date,
  woDetails: WoDetails | null,
): string | null {
  if (!woDetails?.extensions.length) {
    return null;
  }

  let bestMatch: { comment: string; diff: number } | null = null;

  for (const extension of woDetails.extensions) {
    if (!extension.extension_time || !extension.extension_comment) {
      continue;
    }

    const extensionDate = parseDate(extension.extension_time);
    if (!extensionDate) {
      continue;
    }

    const diff = Math.abs(extensionDate.getTime() - pauseStart.getTime());
    if (
      diff < PAUSE_REASON_TOLERANCE_MS &&
      (!bestMatch || diff < bestMatch.diff)
    ) {
      bestMatch = {
        comment: extension.extension_comment,
        diff,
      };
    }
  }

  return bestMatch?.comment ?? null;
}

function buildRootTask(
  woDisplayId: string,
  woDetails: WoDetails | null,
  start: Date,
  end: Date,
): ITask {
  const allottedQty = woDetails?.alloted_qty ?? 0;
  const okQty = woDetails?.ok_qty ?? 0;
  const progress =
    allottedQty > 0 ? Math.max(0, Math.min(100, Math.round((okQty / allottedQty) * 100))) : 0;

  const details = formatTaskDetails([
    compactText(woDetails?.part_no, ""),
    compactText(woDetails?.setting, ""),
    compactText(woDetails?.status, ""),
  ]);

  return {
    id: `wo-${woDisplayId}`,
    text: `WO-${woDisplayId}`,
    type: "summary",
    start,
    end,
    open: true,
    progress,
    ...(details ? { details } : {}),
  };
}

function buildExtensionTask(
  extensionId: number,
  parentId: string,
  extensionTime: Date,
  comment: string,
  extensionDuration: number,
): ITask {
  const safeDuration = Number.isFinite(extensionDuration) ? extensionDuration : 0;

  if (safeDuration > 0) {
    return {
      id: `extension-${extensionId}`,
      parent: parentId,
      text: comment,
      type: "task",
      start: extensionTime,
      end: new Date(extensionTime.getTime() + safeDuration * 1000),
      details: "Extension Window",
    };
  }

  return {
    id: `extension-${extensionId}`,
    parent: parentId,
    text: comment,
    type: "milestone",
    start: extensionTime,
    end: extensionTime,
    details: "Extension Marker",
  };
}

export function buildWoTimelineModel(
  woDisplayId: string,
  woDetails: WoDetails | null,
  rows: ReportRow[],
): WoTimelineModel | null {
  const originalLogs = collectUniqueOriginalLogs(rows).sort(
    (left, right) =>
      new Date(left.log_time).getTime() - new Date(right.log_time).getTime(),
  );

  const extensionDates = (woDetails?.extensions ?? [])
    .map((extension) => parseDate(extension.extension_time))
    .filter((value): value is Date => Boolean(value));

  const firstLogDate = originalLogs[0] ? parseDate(originalLogs[0].log_time) : null;
  const lastLogDate = originalLogs.length > 0
    ? parseDate(originalLogs[originalLogs.length - 1]?.log_time)
    : null;
  const latestExtensionDate =
    extensionDates.length > 0 ? extensionDates[extensionDates.length - 1]! : null;
  const start = parseDate(woDetails?.start_time) ?? firstLogDate;
  const latestKnownDate = getLatestDate([
    parseDate(woDetails?.end_time),
    lastLogDate,
    latestExtensionDate,
  ]);
  const end = start && latestKnownDate ? clampEnd(start, latestKnownDate) : start;

  if (!start || !end) {
    return null;
  }

  const rootTaskId = `wo-${woDisplayId}`;
  const tasks: ITask[] = [buildRootTask(woDisplayId, woDetails, start, end)];
  const markers: IMarker[] = [
    {
      start,
      text: "WO Start",
    },
  ];

  if (parseDate(woDetails?.end_time)) {
    markers.push({
      start: end,
      text: "WO Stop",
    });
  } else {
    markers.push({
      start: end,
      text: "Latest Event",
    });
  }

  let activeSpanCount = 0;
  let pauseCount = 0;
  let openActiveStart: Date | null = null;
  let openPauseStart: Date | null = null;

  for (const log of originalLogs) {
    const logDate = parseDate(log.log_time);
    if (!logDate) {
      continue;
    }

    if (ACTIVE_START_ACTIONS.has(log.action)) {
      openActiveStart = logDate;
    }

    if (openActiveStart && ACTIVE_END_ACTIONS.has(log.action)) {
      activeSpanCount += 1;
      const details = formatTaskDetails([
        compactText(log.start_name, woDetails?.start_name ?? "Operator"),
        log.action === "WO_PAUSE" ? "Paused" : log.action === "WO_STOP" ? "Stopped" : undefined,
      ]);
      tasks.push({
        id: `active-${activeSpanCount}-${log.log_id}`,
        parent: rootTaskId,
        text: activeSpanCount === 1 ? "Machine Running" : `Machine Running ${activeSpanCount}`,
        type: "task",
        start: openActiveStart,
        end: clampEnd(openActiveStart, logDate),
        ...(details ? { details } : {}),
      });
      openActiveStart = null;
    }

    if (log.action === PAUSE_START_ACTION) {
      openPauseStart = logDate;
    }

    if (openPauseStart && PAUSE_END_ACTIONS.has(log.action)) {
      pauseCount += 1;
      const details = formatTaskDetails([
        "Machine Paused",
        log.action === "WO_STOP" ? "Closed At WO Stop" : "Resumed",
      ]);
      tasks.push({
        id: `pause-${pauseCount}-${log.log_id}`,
        parent: rootTaskId,
        text: compactText(
          resolvePauseReason(openPauseStart, woDetails),
          pauseCount === 1 ? "Pause Window" : `Pause Window ${pauseCount}`,
        ),
        type: "task",
        start: openPauseStart,
        end: clampEnd(openPauseStart, logDate),
        ...(details ? { details } : {}),
      });
      openPauseStart = null;
    }
  }

  if (openActiveStart) {
    activeSpanCount += 1;
    const details = formatTaskDetails([
      compactText(woDetails?.start_name, "Operator"),
      "Open Segment",
    ]);
    tasks.push({
      id: `active-${activeSpanCount}-open`,
      parent: rootTaskId,
      text: activeSpanCount === 1 ? "Machine Running" : `Machine Running ${activeSpanCount}`,
      type: "task",
      start: openActiveStart,
      end: clampEnd(openActiveStart, end),
      ...(details ? { details } : {}),
    });
  }

  if (openPauseStart || woDetails?.status === "PAUSED") {
    const pauseStart = openPauseStart ?? lastLogDate ?? start;
    pauseCount += 1;
    tasks.push({
      id: `pause-${pauseCount}-open`,
      parent: rootTaskId,
      text: compactText(
        resolvePauseReason(pauseStart, woDetails),
        pauseCount === 1 ? "Pause Window" : `Pause Window ${pauseCount}`,
      ),
      type: "task",
      start: pauseStart,
      end: clampEnd(pauseStart, end),
      details: "Machine Paused",
    });
  }

  for (const extension of woDetails?.extensions ?? []) {
    const extensionTime = parseDate(extension.extension_time);
    if (!extensionTime || !extension.extension_comment) {
      continue;
    }

    tasks.push(
      buildExtensionTask(
        extension.id,
        rootTaskId,
        extensionTime,
        extension.extension_comment,
        extension.extension_duration,
      ),
    );
  }

  return {
    tasks,
    markers,
    windowStart: start,
    windowEnd: end,
    activeSpanCount,
    pauseCount,
    extensionCount: woDetails?.extensions.length ?? 0,
  };
}
