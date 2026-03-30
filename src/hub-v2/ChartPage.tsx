import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchAllWoDetails,
  fetchWoDetails,
  fetchWoSummaries,
  formatDateForApi,
} from "../report/api-client";
import { getMachineLabel } from "../report/machine-config";
import {
  mapRawJobTypeToLabel,
  type WoDetails,
  type WoSummaryEntry,
} from "../report/report-types";
import { DEFAULT_DASHBOARD_MACHINE_IDS } from "./wo-report-utils";

const TOKEN = import.meta.env.VITE_API_TOKEN;
const MACHINE_COLUMN_WIDTH = 220;
const HOUR_CELL_WIDTH = 40;
const BAR_HEIGHT = 18;
const BAR_GAP = 8;
const HOURS_PER_DAY = 24;
const HOUR_STEP = 1;
const HOUR_COLUMNS = (7 * HOURS_PER_DAY) / HOUR_STEP;
const DAY_COLUMN_SPAN = HOURS_PER_DAY / HOUR_STEP;
const TIMELINE_MIN_WIDTH =
  MACHINE_COLUMN_WIDTH + HOUR_COLUMNS * HOUR_CELL_WIDTH;
const CHART_CACHE_TTL_MS = 5 * 60 * 1000;
const CHART_WEEK_CACHE_PREFIX = "weekly-wo-timeline:";
const CHART_WO_DETAILS_CACHE_KEY = "weekly-wo-details";
const weeklyWoRequestCache = new Map<string, Promise<WoSummaryEntry[]>>();
const weeklyTimelineCache = new Map<string, CachedTimelineWeek>();
const JOB_TYPE_LEGEND = [
  { label: "Production", swatch: "bg-emerald-500" },
  { label: "Setting", swatch: "bg-sky-500" },
  { label: "Calibration", swatch: "bg-amber-500" },
  { label: "Maintenance", swatch: "bg-rose-500" },
  { label: "Man", swatch: "bg-violet-500" },
  { label: "Training", swatch: "bg-cyan-500" },
  { label: "RD", swatch: "bg-indigo-500" },
  { label: "Man Production", swatch: "bg-teal-500" },
  { label: "Man Setting", swatch: "bg-orange-500" },
] as const;

interface TimelineWindow {
  machineId: number;
  machineLabel: string;
  woId: number;
  woLabel: string;
  status: string;
  partNo: string;
  setting: string;
  allotedQty: number;
  okQty: number;
  rejectQty: number;
  startComment: string;
  stopComment: string;
  durationSeconds: number | null;
  idleTimeSeconds: number | null;
  start: Date;
  end: Date;
}

interface TimelineBar extends TimelineWindow {
  laneIndex: number;
  leftPercent: number;
  widthPercent: number;
}

interface TimelineRow {
  machineId: number;
  machineLabel: string;
  bars: TimelineBar[];
  laneCount: number;
  latestWindow: TimelineWindow | null;
}

interface CachedTimelineWeek {
  fetchedAt: number;
  workOrders: WoSummaryEntry[];
  woDetailsById: Record<number, WoDetails | null>;
}

let woDetailsCacheHydrated = false;

function canUseSessionStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
}

function hydrateWoDetailsCache() {
  if (woDetailsCacheHydrated || !canUseSessionStorage()) {
    return;
  }

  woDetailsCacheHydrated = true;

  try {
    const raw = window.sessionStorage.getItem(CHART_WO_DETAILS_CACHE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Record<string, WoDetails | null>;
    Object.entries(parsed).forEach(([woId, details]) => {
      const numericId = Number(woId);
      if (Number.isFinite(numericId)) {
        woDetailsMemoryCache.set(numericId, details);
      }
    });
  } catch {
    window.sessionStorage.removeItem(CHART_WO_DETAILS_CACHE_KEY);
  }
}

const woDetailsMemoryCache = new Map<number, WoDetails | null>();

function readCachedWoDetails(woIds: number[]) {
  hydrateWoDetailsCache();

  const details: Record<number, WoDetails | null> = {};
  woIds.forEach((woId) => {
    if (woDetailsMemoryCache.has(woId)) {
      details[woId] = woDetailsMemoryCache.get(woId) ?? null;
    }
  });
  return details;
}

function writeCachedWoDetails(details: Record<number, WoDetails | null>) {
  hydrateWoDetailsCache();

  Object.entries(details).forEach(([woId, value]) => {
    woDetailsMemoryCache.set(Number(woId), value);
  });

  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      CHART_WO_DETAILS_CACHE_KEY,
      JSON.stringify(Object.fromEntries(woDetailsMemoryCache)),
    );
  } catch {
    // Ignore storage quota errors and keep the in-memory cache.
  }
}

function readWeekCache(cacheKey: string) {
  const memoryCached = weeklyTimelineCache.get(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }

  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(
      `${CHART_WEEK_CACHE_PREFIX}${cacheKey}`,
    );
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedTimelineWeek;
    weeklyTimelineCache.set(cacheKey, parsed);
    writeCachedWoDetails(parsed.woDetailsById);
    return parsed;
  } catch {
    window.sessionStorage.removeItem(`${CHART_WEEK_CACHE_PREFIX}${cacheKey}`);
    return null;
  }
}

function writeWeekCache(cacheKey: string, entry: CachedTimelineWeek) {
  weeklyTimelineCache.set(cacheKey, entry);
  writeCachedWoDetails(entry.woDetailsById);

  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${CHART_WEEK_CACHE_PREFIX}${cacheKey}`,
      JSON.stringify(entry),
    );
  } catch {
    // Ignore storage quota errors and keep the in-memory cache.
  }
}

function isWeekCacheFresh(entry: CachedTimelineWeek) {
  return Date.now() - entry.fetchedAt < CHART_CACHE_TTL_MS;
}

function buildWeekRange(weekShift = 0) {
  const end = new Date();
  end.setDate(end.getDate() - weekShift * 7);
  end.setHours(23, 59, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRangeLabel(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${formatter.format(start)} to ${formatter.format(end)}`;
}

function formatDayLabel(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatWindowLabel(start: Date, end: Date) {
  return `${formatDateTime(start)} to ${formatDateTime(end)}`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return "-";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function getWindowEnd(workOrder: WoSummaryEntry, fallbackEnd: Date) {
  const start = parseDate(workOrder.start_time);
  if (!start) {
    return null;
  }

  const explicitEnd = parseDate(workOrder.end_time);
  if (explicitEnd) {
    return explicitEnd;
  }

  if (typeof workOrder.duration === "number" && workOrder.duration > 0) {
    return new Date(start.getTime() + workOrder.duration * 1000);
  }

  return fallbackEnd;
}

function toTimelineWindow(
  workOrder: WoSummaryEntry,
  rangeStart: Date,
  rangeEnd: Date,
): TimelineWindow | null {
  const start = parseDate(workOrder.start_time);
  if (!start) {
    return null;
  }

  const end = getWindowEnd(workOrder, rangeEnd);
  if (!end) {
    return null;
  }

  const clampedStart =
    start.getTime() < rangeStart.getTime() ? rangeStart : start;
  const clampedEnd = end.getTime() > rangeEnd.getTime() ? rangeEnd : end;

  if (clampedEnd.getTime() <= clampedStart.getTime()) {
    return null;
  }

  return {
    machineId: workOrder.device_id,
    machineLabel: getMachineLabel(workOrder.device_id),
    woId: workOrder.id,
    woLabel: `WO-${workOrder.wo_id || workOrder.id}`,
    status: workOrder.status || "Unknown",
    partNo: workOrder.part_no || "-",
    setting: workOrder.setting || "-",
    allotedQty: workOrder.alloted_qty || 0,
    okQty: workOrder.ok_qty || 0,
    rejectQty: workOrder.reject_qty || 0,
    startComment: workOrder.start_comment || "",
    stopComment: workOrder.stop_comment || "",
    durationSeconds: workOrder.duration ?? null,
    idleTimeSeconds: workOrder.idle_time ?? null,
    start: clampedStart,
    end: clampedEnd,
  };
}

function getStatusTone(status: string) {
  const normalized = status.toUpperCase();

  if (normalized.includes("COMPLETE")) {
    return {
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      bar: "border-emerald-300 bg-emerald-500 text-white shadow-emerald-200/70",
    };
  }

  if (normalized.includes("PAUSE")) {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      bar: "border-amber-300 bg-amber-500 text-white shadow-amber-200/70",
    };
  }

  if (normalized.includes("PROGRESS") || normalized.includes("RUN")) {
    return {
      badge: "border-sky-200 bg-sky-50 text-sky-700",
      bar: "border-sky-300 bg-sky-500 text-white shadow-sky-200/70",
    };
  }

  return {
    badge: "border-slate-200 bg-slate-100 text-slate-600",
    bar: "border-violet-300 bg-violet-500 text-white shadow-violet-200/70",
  };
}

function getJobTypeLabel(details: WoDetails | null | undefined) {
  if (typeof details?.job_type !== "number") {
    return "Unknown";
  }

  return mapRawJobTypeToLabel(details.job_type);
}

function getJobTypeTone(jobTypeLabel: string, status: string) {
  switch (jobTypeLabel) {
    case "Production":
      return "border-emerald-300 bg-emerald-500 text-white shadow-emerald-200/70";
    case "Setting":
      return "border-sky-300 bg-sky-500 text-white shadow-sky-200/70";
    case "Calibration":
      return "border-amber-300 bg-amber-500 text-white shadow-amber-200/70";
    case "Maintenance":
      return "border-rose-300 bg-rose-500 text-white shadow-rose-200/70";
    case "Man":
      return "border-violet-300 bg-violet-500 text-white shadow-violet-200/70";
    case "Training":
      return "border-cyan-300 bg-cyan-500 text-white shadow-cyan-200/70";
    case "RD":
      return "border-indigo-300 bg-indigo-500 text-white shadow-indigo-200/70";
    case "Man Production":
      return "border-teal-300 bg-teal-500 text-white shadow-teal-200/70";
    case "Man Setting":
      return "border-orange-300 bg-orange-500 text-white shadow-orange-200/70";
    default:
      return getStatusTone(status).bar;
  }
}

function buildDayTicks(start: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start);
    value.setDate(value.getDate() + index);
    return value;
  });
}

function buildHourTicks(dayTicks: Date[]) {
  return dayTicks.flatMap((day) =>
    Array.from({ length: HOURS_PER_DAY / HOUR_STEP }, (_, index) => {
      const value = new Date(day);
      value.setHours(index * HOUR_STEP, 0, 0, 0);
      return value;
    }),
  );
}

function formatHourLabel(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    hour12: false,
  }).format(value);
}

function formatNowLabel(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getPercentOffset(value: Date, start: Date, end: Date) {
  const total = end.getTime() - start.getTime();
  if (total <= 0) {
    return 0;
  }

  return ((value.getTime() - start.getTime()) / total) * 100;
}

function assignLanes(
  windows: TimelineWindow[],
  rangeStart: Date,
  rangeEnd: Date,
): TimelineBar[] {
  const laneEnds: number[] = [];

  return windows
    .slice()
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .map((window) => {
      const startTime = window.start.getTime();
      const laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= startTime);
      const nextLaneIndex = laneIndex >= 0 ? laneIndex : laneEnds.length;

      laneEnds[nextLaneIndex] = window.end.getTime();

      const leftPercent = getPercentOffset(window.start, rangeStart, rangeEnd);
      const rightPercent = getPercentOffset(window.end, rangeStart, rangeEnd);

      return {
        ...window,
        laneIndex: nextLaneIndex,
        leftPercent,
        widthPercent: Math.max(2, rightPercent - leftPercent),
      };
    });
}

function buildTimelineRows(
  windows: TimelineWindow[],
  machineIds: readonly number[],
  searchQuery: string,
  rangeStart: Date,
  rangeEnd: Date,
): TimelineRow[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return machineIds.map((machineId) => {
    const machineLabel = getMachineLabel(machineId);
    const visibleWindows = windows.filter((window) => {
      if (window.machineId !== machineId) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        window.machineLabel,
        window.woLabel,
        window.status,
        window.partNo,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    const bars = assignLanes(visibleWindows, rangeStart, rangeEnd);
    const latestWindow =
      visibleWindows
        .slice()
        .sort((left, right) => right.end.getTime() - left.end.getTime())[0] ??
      null;

    return {
      machineId,
      machineLabel,
      bars,
      laneCount: Math.max(1, ...bars.map((bar) => bar.laneIndex + 1), 1),
      latestWindow,
    };
  });
}

function TimelineBarCard({
  bar,
  details,
  onInspect,
}: {
  bar: TimelineBar;
  details: WoDetails | null | undefined;
  onInspect: (woId: number) => void;
}) {
  const statusTone = getStatusTone(bar.status);
  const jobTypeLabel = getJobTypeLabel(details);
  const operatorName =
    details?.start_name?.trim() ||
    (typeof details?.start_uid === "number"
      ? `UID ${details.start_uid}`
      : "Loading...");

  return (
    <div
      className={cn(
        "group absolute flex min-h-[18px] items-center rounded-md border px-2 text-[11px] font-semibold shadow-sm outline-none",
        getJobTypeTone(jobTypeLabel, bar.status),
      )}
      tabIndex={0}
      onMouseEnter={() => onInspect(bar.woId)}
      onFocus={() => onInspect(bar.woId)}
      style={{
        left: `${bar.leftPercent}%`,
        width: `${bar.widthPercent}%`,
        top: `${12 + bar.laneIndex * (BAR_HEIGHT + BAR_GAP)}px`,
        height: `${BAR_HEIGHT}px`,
      }}
      aria-label={`${bar.woLabel}, ${bar.status}, ${formatWindowLabel(bar.start, bar.end)}`}
    >
      <span className="truncate">{bar.woLabel}</span>
      <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-40 hidden w-72 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xl shadow-slate-300/30 group-hover:block group-focus-visible:block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {bar.machineLabel}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {bar.woLabel}
            </p>
            <p className="mt-1 text-xs text-slate-600">{operatorName}</p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px]",
              statusTone.badge,
            )}
          >
            {bar.status}
          </Badge>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              Job Type
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {jobTypeLabel}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              Part No
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {bar.partNo}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              Setting
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">
              {bar.setting}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              Start
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {formatDateTime(bar.start)}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              End
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {formatDateTime(bar.end)}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              Duration
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {formatDuration(bar.durationSeconds)}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              Idle Time
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {formatDuration(bar.idleTimeSeconds)}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              Alloted Qty
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {bar.allotedQty}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-[0.14em] text-slate-500">
              OK / Reject
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {bar.okQty} / {bar.rejectQty}
            </p>
          </div>
        </div>

        {bar.startComment ? (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium text-slate-700">Start Comment:</span>{" "}
            {bar.startComment}
          </div>
        ) : null}

        {bar.stopComment ? (
          <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium text-slate-700">Stop Comment:</span>{" "}
            {bar.stopComment}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ChartPage() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [workOrders, setWorkOrders] = useState<WoSummaryEntry[]>([]);
  const [woDetailsById, setWoDetailsById] = useState<
    Record<number, WoDetails | null>
  >({});
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [weekShift, setWeekShift] = useState(0);
  const detailRequestsRef = useRef<Set<number>>(new Set());
  const visibleWeekKeyRef = useRef<string | null>(null);

  const weekRange = useMemo(() => buildWeekRange(weekShift), [weekShift]);
  const weekCacheKey = useMemo(
    () =>
      [
        formatDateForApi(weekRange.start),
        formatDateForApi(weekRange.end),
        DEFAULT_DASHBOARD_MACHINE_IDS.join(","),
      ].join("|"),
    [weekRange.end, weekRange.start],
  );

  useEffect(() => {
    if (!TOKEN) {
      setError("Missing VITE_API_TOKEN. Set token to enable chart data.");
      return;
    }

    let isActive = true;
    const cachedWeek = refreshTick === 0 ? readWeekCache(weekCacheKey) : null;

    if (cachedWeek) {
      setError(null);
      setWorkOrders(cachedWeek.workOrders);
      setWoDetailsById(cachedWeek.woDetailsById);
      setLastRefreshed(new Date(cachedWeek.fetchedAt));
      detailRequestsRef.current.clear();
      visibleWeekKeyRef.current = weekCacheKey;
    } else if (
      refreshTick === 0 &&
      visibleWeekKeyRef.current &&
      visibleWeekKeyRef.current !== weekCacheKey
    ) {
      setWorkOrders([]);
      setWoDetailsById({});
      setLastRefreshed(null);
    }

    async function loadWorkOrders() {
      if (!cachedWeek) {
        setLoading(true);
      }
      setRefreshing(Boolean(cachedWeek));
      setError(null);

      try {
        const startDate = formatDateForApi(weekRange.start);
        const endDate = formatDateForApi(weekRange.end);
        const result = await Promise.all(
          DEFAULT_DASHBOARD_MACHINE_IDS.map((deviceId) =>
            (() => {
              const cacheKey = [
                startDate,
                endDate,
                deviceId,
                refreshTick,
              ].join("|");
              const cached = weeklyWoRequestCache.get(cacheKey);

              if (cached) {
                return cached;
              }

              const request = fetchWoSummaries(
                {
                  startDate,
                  endDate,
                  deviceId,
                },
                TOKEN,
              );

              weeklyWoRequestCache.set(cacheKey, request);
              return request;
            })(),
          ),
        );

        if (!isActive) {
          return;
        }

        const filtered = result.flat().filter((workOrder) =>
          DEFAULT_DASHBOARD_MACHINE_IDS.includes(
            workOrder.device_id as (typeof DEFAULT_DASHBOARD_MACHINE_IDS)[number],
          ),
        );

        const woIds = [...new Set(filtered.map((workOrder) => workOrder.id))];
        const cachedDetails = readCachedWoDetails(woIds);

        setWorkOrders(filtered);
        setWoDetailsById(cachedDetails);

        const missingWoIds = woIds.filter(
          (woId) => cachedDetails[woId] === undefined,
        );
        const fetchedDetails =
          missingWoIds.length > 0
            ? await fetchAllWoDetails(missingWoIds, TOKEN)
            : new Map<number, WoDetails>();

        if (!isActive) {
          return;
        }

        const detailsRecord = { ...cachedDetails };
        missingWoIds.forEach((woId) => {
          detailsRecord[woId] = fetchedDetails.get(woId) ?? null;
        });
        writeWeekCache(weekCacheKey, {
          fetchedAt: Date.now(),
          workOrders: filtered,
          woDetailsById: detailsRecord,
        });

        setWorkOrders(filtered);
        setWoDetailsById(detailsRecord);
        detailRequestsRef.current.clear();
        setLastRefreshed(new Date());
        visibleWeekKeyRef.current = weekCacheKey;
      } catch (fetchError) {
        if (!isActive) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load the weekly machine timeline.",
        );
      } finally {
        if (isActive) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    if (cachedWeek && isWeekCacheFresh(cachedWeek)) {
      setLoading(false);
      setRefreshing(false);
      return () => {
        isActive = false;
      };
    }

    void loadWorkOrders();

    return () => {
      isActive = false;
    };
  }, [refreshTick, weekCacheKey, weekRange.end, weekRange.start]);

  const timelineWindows = useMemo(
    () =>
      workOrders
        .map((workOrder) =>
          toTimelineWindow(workOrder, weekRange.start, weekRange.end),
        )
        .filter((window): window is TimelineWindow => Boolean(window)),
    [workOrders, weekRange.end, weekRange.start],
  );

  const timelineRows = useMemo(
    () =>
      buildTimelineRows(
        timelineWindows,
        DEFAULT_DASHBOARD_MACHINE_IDS,
        searchQuery,
        weekRange.start,
        weekRange.end,
      ),
    [timelineWindows, searchQuery, weekRange.end, weekRange.start],
  );

  const dayTicks = useMemo(() => buildDayTicks(weekRange.start), [weekRange.start]);
  const hourTicks = useMemo(() => buildHourTicks(dayTicks), [dayTicks]);
  const now = new Date();
  const isCurrentWeek =
    now.getTime() >= weekRange.start.getTime() &&
    now.getTime() <= weekRange.end.getTime();
  const nowPercent = isCurrentWeek
    ? getPercentOffset(now, weekRange.start, weekRange.end)
    : null;

  async function ensureWoDetails(woId: number) {
    if (
      !TOKEN ||
      woDetailsById[woId] !== undefined ||
      detailRequestsRef.current.has(woId)
    ) {
      return;
    }

    const cachedDetails = readCachedWoDetails([woId])[woId];
    if (cachedDetails !== undefined) {
      setWoDetailsById((current) => ({
        ...current,
        [woId]: cachedDetails,
      }));
      return;
    }

    detailRequestsRef.current.add(woId);

    try {
      const details = await fetchWoDetails(woId, TOKEN);
      writeCachedWoDetails({ [woId]: details });
      setWoDetailsById((current) => ({
        ...current,
        [woId]: details,
      }));
    } finally {
      detailRequestsRef.current.delete(woId);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <main className="mx-auto max-w-[1680px] px-3 py-4 sm:px-4 sm:py-6">
        <header className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3 sm:text-sm">
            <Link
              to="/dashboard"
              className="inline-flex h-9 items-center rounded-md px-3 text-slate-600 hover:bg-slate-100"
            >
              Dashboard
            </Link>
            <span className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 font-medium text-white">
              Chart
            </span>
            <Link
              to="/report"
              className="inline-flex h-9 items-center rounded-md px-3 text-slate-600 hover:bg-slate-100"
            >
              Machine Report
            </Link>
            <Link
              to="/report/personnel"
              className="inline-flex h-9 items-center rounded-md px-3 text-slate-600 hover:bg-slate-100"
            >
              Personnel Report
            </Link>

            <div className="ml-auto flex min-w-[240px] flex-wrap items-center justify-end gap-2">
              <div className="relative w-full max-w-[260px] sm:w-[260px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search machine, WO, part..."
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setRefreshTick((value) => value + 1)}
                disabled={loading || refreshing}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:text-sm"
              >
                {loading || refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
                Refresh
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        <section className="mt-5 space-y-4">
          <Card className="rounded-[28px] border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Timeline
                  </CardDescription>
                  <CardTitle className="mt-2 text-3xl text-slate-900">
                    Weekly WO Timeline
                  </CardTitle>
                  <CardDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                    All 8 machines are loaded from the WO API and each bar is calculated from `start_time` and `end_time`.
                    </span>
                    {refreshing ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Syncing latest week data...
                      </span>
                    ) : null}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setWeekShift((value) => value + 1)}
                    disabled={loading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekShift(0)}
                    disabled={loading || weekShift === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekShift((value) => value - 1)}
                    disabled={loading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Next Week
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                    <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                    {formatRangeLabel(weekRange.start, weekRange.end)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Job Type Key
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {JOB_TYPE_LEGEND.map((item) => (
                    <div
                      key={item.label}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      <span
                        className={cn("h-2.5 w-2.5 rounded-full", item.swatch)}
                      />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200 shadow-sm">
            <CardContent className="p-0">
              {loading && timelineWindows.length === 0 ? (
                <div className="flex h-[760px] items-center justify-center text-sm text-slate-500">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading weekly work-order timeline…
                  </div>
                </div>
              ) : timelineRows.every((row) => row.bars.length === 0) ? (
                <div className="flex h-[760px] items-center justify-center px-6 text-center text-sm text-slate-500">
                  No work orders matched this week range for the 8 machines.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: `${TIMELINE_MIN_WIDTH}px` }}>
                    <div
                      className="grid border-b border-slate-200"
                      style={{
                        gridTemplateColumns: `${MACHINE_COLUMN_WIDTH}px repeat(${HOUR_COLUMNS}, minmax(0, 1fr))`,
                      }}
                    >
                      <div className="row-span-2 border-r border-slate-200 px-6 py-5">
                        <p className="text-sm font-semibold text-slate-900">
                          Machines
                        </p>
                      </div>
                      {dayTicks.map((tick, index) => (
                        <div
                          key={tick.toISOString()}
                          className={cn(
                            "border-l border-slate-200 px-3 py-4 text-center first:border-l-0",
                            index % 2 === 1 && "bg-slate-50/70",
                            isCurrentWeek &&
                              now >= tick &&
                              now < new Date(tick.getTime() + 24 * 60 * 60 * 1000) &&
                              "bg-rose-50/80",
                          )}
                          style={{
                            gridColumn: `span ${DAY_COLUMN_SPAN} / span ${DAY_COLUMN_SPAN}`,
                          }}
                        >
                          <p className="text-sm font-semibold text-slate-900">
                            {formatDayLabel(tick)}
                          </p>
                        </div>
                      ))}
                      {hourTicks.map((tick, index) => (
                        <div
                          key={tick.toISOString()}
                          className={cn(
                            "border-l border-t border-slate-200 px-1 py-2 text-center text-[10px] font-medium text-slate-500",
                            index % DAY_COLUMN_SPAN === 0 &&
                              "border-l-slate-300 bg-slate-50/60",
                            isCurrentWeek &&
                              now >= tick &&
                              now < new Date(tick.getTime() + 60 * 60 * 1000) &&
                              "bg-rose-50",
                          )}
                        >
                          {formatHourLabel(tick)}
                        </div>
                      ))}
                      {nowPercent != null ? (
                        <div
                          className="pointer-events-none relative row-span-2"
                          style={{
                            gridColumnStart: 2,
                            gridColumnEnd: -1,
                            gridRow: "1 / span 2",
                          }}
                        >
                          <div
                            className="absolute bottom-0 top-0 z-20 w-px bg-rose-500/80"
                            style={{ left: `${nowPercent}%` }}
                          />
                          <div
                            className="absolute top-2 z-30 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-1 text-[10px] font-semibold text-white shadow-sm"
                            style={{ left: `${nowPercent}%` }}
                          >
                            {formatNowLabel(now)}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {timelineRows.map((row, rowIndex) => {
                      const rowHeight = 24 + row.laneCount * (BAR_HEIGHT + BAR_GAP);

                      return (
                        <div
                          key={row.machineId}
                          className={cn("grid border-b border-slate-200 last:border-b-0")}
                          style={{
                            gridTemplateColumns: `${MACHINE_COLUMN_WIDTH}px repeat(${HOUR_COLUMNS}, minmax(0, 1fr))`,
                          }}
                        >
                          <div
                            className={cn(
                              "border-r border-slate-200 px-6 py-4",
                              rowIndex % 2 === 1 && "bg-slate-50/40",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {row.machineLabel}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {row.bars.length > 0
                                    ? `${row.bars.length} WO bars`
                                    : "No WO in this range"}
                                </p>
                              </div>
                              {row.latestWindow ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "rounded-full px-2.5 py-1 text-[11px]",
                                    getStatusTone(row.latestWindow.status).badge,
                                  )}
                                >
                                  {row.latestWindow.status}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <div
                            className={cn(
                              "relative",
                              rowIndex % 2 === 1 && "bg-slate-50/30",
                            )}
                            style={{
                              height: `${rowHeight}px`,
                              gridColumn: `span ${HOUR_COLUMNS} / span ${HOUR_COLUMNS}`,
                            }}
                          >
                            <div className="absolute inset-0 grid grid-cols-7">
                              {dayTicks.map((tick, index) => (
                                <div
                                  key={`${row.machineId}-${tick.toISOString()}`}
                                  className={cn(
                                    "border-l border-slate-200 first:border-l-0",
                                    index % 2 === 1 && "bg-slate-50/70",
                                    isCurrentWeek &&
                                      now >= tick &&
                                      now <
                                        new Date(
                                          tick.getTime() + 24 * 60 * 60 * 1000,
                                        ) &&
                                      "bg-rose-50/50",
                                  )}
                                />
                              ))}
                            </div>
                            <div
                              className="absolute inset-0 grid"
                              style={{
                                gridTemplateColumns: `repeat(${HOUR_COLUMNS}, minmax(0, 1fr))`,
                              }}
                            >
                              {hourTicks.map((tick, index) => (
                                <div
                                  key={`${row.machineId}-${tick.toISOString()}`}
                                  className={cn(
                                    "border-l border-slate-200/80",
                                    index % DAY_COLUMN_SPAN === 0 && "border-l-slate-300",
                                  )}
                                />
                              ))}
                            </div>
                            {nowPercent != null ? (
                              <div
                                className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-rose-500/80"
                                style={{ left: `${nowPercent}%` }}
                              />
                            ) : null}
                            <div
                              className="absolute inset-0 opacity-70"
                              style={{
                                backgroundImage:
                                  "linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)",
                                backgroundSize: `100% ${BAR_HEIGHT + BAR_GAP}px`,
                              }}
                            />
                            {row.bars.map((bar) => (
                              <TimelineBarCard
                                key={`${bar.machineId}-${bar.woId}-${bar.start.toISOString()}`}
                                bar={bar}
                                details={woDetailsById[bar.woId]}
                                onInspect={ensureWoDetails}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
