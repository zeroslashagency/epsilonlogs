import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import BoxLoadingPreloader from "../components/ui/BoxLoadingPreloader";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Clock,
  Coffee,
  Download,
  FileText,
  Loader2,
  Monitor,
  Package,
  Play,
  SlidersHorizontal,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DateRangePicker } from "../components/ui/DateRangePicker";
import { ReportCompareMatrix, ReportTable } from "./ReportTable";
import {
  EMPTY_FILTERS,
  ReportFilterBar,
  type ReportFilters,
  applyFilters,
  extractFilterOptions,
} from "./ReportFilterBar";
import { matchRow } from "./search-utils";
import { fetchAllWoDetails, fetchDeviceNameMap } from "./api-client";
import { extractWoIds } from "./log-normalizer";
import { buildReport } from "./report-builder";
import { formatDuration } from "./format-utils";
import type {
  ReportConfig,
  ReportRow,
  ReportStats,
  WoDetails,
} from "./report-types";
import {
  buildPersonnelOverlapCompareWindows,
  detectPersonnelMachineOverlaps,
  derivePersonnelOptions,
  fetchRecentLogsForDevices,
  fetchLogsForDevices,
  filterLogsByPersonnel,
  filterWoDetailsMapByPersonnel,
  formatMachineScopeLabel,
  groupPersonnelMergedRows,
  resolvePersonnelReportDeviceIds,
  sanitizeFilenamePart,
  summarizePersonnelActivity,
  type DeviceLogsBatchProgress,
  type PersonnelMachineOverlap,
  type PersonnelOption,
} from "./personnel-report-utils";
import type { DeviceLogEntry } from "./report-types";
import { ALL_MACHINES, getMachineLabel } from "./machine-config";
import { clampProgress, getStageProgress } from "./loading-progress";

const TOKEN = import.meta.env.VITE_API_TOKEN;
const DEFAULT_PERSONNEL_DEVICE_IDS = ALL_MACHINES.map((device) => device.id);
const PERSONNEL_DISCOVERY_PAGES_BACK = 2;

interface PersonnelReportSourceBundle {
  logs: DeviceLogEntry[];
  woDetailsMap: Map<number, WoDetails>;
}

interface ReportLoaderState {
  progress: number;
  stageLabel: string;
  detailLabel: string;
}

function waitForNextPaint(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function parseDateString(s: string): Date | null {
  if (!s) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  return new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
  );
}

function formatDisplayDate(s: string): string {
  const date = parseDateString(s);
  if (!date) return s;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatIsoDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatIsoTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDurationSummary(hours: number, minutes: number): string {
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function formatRelativeAge(value: string | null | undefined, now: Date): string {
  if (!value) {
    return "No logs yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatClockDate(date: Date): string {
  const weekday = date
    .toLocaleDateString("en-GB", { weekday: "short" })
    .toUpperCase();
  const day = date.toLocaleDateString("en-GB", { day: "2-digit" });
  const month = date
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();
  const year = date.toLocaleDateString("en-GB", { year: "numeric" });
  return `${weekday} · ${day} ${month} ${year}`;
}

function PersonnelClockPanel({
  now,
  loading,
  headline,
  description,
  detailChips,
}: {
  now: Date;
  loading: boolean;
  headline: string;
  description: string;
  detailChips: string[];
}) {
  const hour = now.getHours() % 12;
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const hourAngle = hour * 30 + minute * 0.5;
  const minuteAngle = minute * 6 + second * 0.1;
  const secondAngle = second * 6;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,247,255,0.96)_100%)] px-6 py-7 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
      <style>{`
        @keyframes personnel-wave-drift {
          0%, 100% { transform: translateX(-8%) translateY(4%) scaleX(1.02); }
          50% { transform: translateX(8%) translateY(-4%) scaleX(0.98); }
        }
        @keyframes personnel-water-rise {
          0%, 100% { height: 34%; opacity: 0.42; }
          50% { height: 46%; opacity: 0.64; }
        }
        @keyframes personnel-ripple {
          0%, 100% { transform: scale(0.94); opacity: 0.18; }
          50% { transform: scale(1.08); opacity: 0.34; }
        }
        @keyframes personnel-glow {
          0%, 100% { box-shadow: 0 0 26px rgba(186,230,253,0.22); }
          50% { box-shadow: 0 0 52px rgba(186,230,253,0.38); }
        }
      `}</style>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,150px)_1fr_minmax(0,220px)] lg:items-center">
        <div className="text-center lg:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
            Local Time
          </p>
          <div className="mt-4 font-mono text-4xl font-semibold tracking-[0.08em] text-slate-800 sm:text-5xl">
            {formatClockTime(now)}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">
            My Current Local Time
          </p>
          <div className="relative mt-5 h-64 w-64 sm:h-72 sm:w-72">
            <div className="absolute inset-0 rounded-full bg-white/70 blur-md" />
            <div
              className="absolute inset-0 rounded-full border border-slate-200/90 bg-white/80"
              style={{
                animation: loading ? "personnel-glow 3s ease-in-out infinite" : undefined,
              }}
            />
            <div className="absolute inset-[10%] overflow-hidden rounded-full border border-slate-100 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(243,246,255,0.8))]">
              <div
                className="absolute inset-x-[-6%] bottom-[-2%] rounded-t-[42%] bg-gradient-to-t from-sky-300/45 via-cyan-200/28 to-transparent"
                style={{
                  height: loading ? "46%" : "34%",
                  animation: loading
                    ? "personnel-wave-drift 2.8s ease-in-out infinite, personnel-water-rise 4.2s ease-in-out infinite"
                    : "personnel-wave-drift 6.5s ease-in-out infinite",
                }}
              />
              <div
                className="absolute inset-x-[18%] bottom-[16%] h-10 rounded-full bg-cyan-200/35 blur-xl"
                style={{
                  animation: "personnel-ripple 3.4s ease-in-out infinite",
                }}
              />
            </div>

            {Array.from({ length: 12 }, (_, index) => (
              <div
                key={`tick-${index}`}
                className="absolute left-1/2 top-1/2 h-3 w-px rounded-full bg-slate-300"
                style={{
                  transform: `translate(-50%, -50%) rotate(${index * 30}deg) translateY(-122px)`,
                }}
              />
            ))}

            <div
              className="absolute left-1/2 top-1/2 h-[24%] w-1 -translate-x-1/2 -translate-y-full rounded-full bg-slate-800"
              style={{
                transform: `translate(-50%, -100%) rotate(${hourAngle}deg)`,
                transformOrigin: "50% 100%",
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 h-[34%] w-0.5 -translate-x-1/2 -translate-y-full rounded-full bg-slate-700"
              style={{
                transform: `translate(-50%, -100%) rotate(${minuteAngle}deg)`,
                transformOrigin: "50% 100%",
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 h-[38%] w-px -translate-x-1/2 -translate-y-full rounded-full bg-orange-500"
              style={{
                transform: `translate(-50%, -100%) rotate(${secondAngle}deg)`,
                transformOrigin: "50% 100%",
              }}
            />
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-500 bg-white" />
          </div>
        </div>

        <div className="text-center lg:text-right">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">
            {formatClockDate(now)}
          </p>
          <p className="mt-4 text-base font-semibold text-slate-700">
            {headline}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>

      {detailChips.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {detailChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "emerald" | "indigo" | "blue" | "amber" | "slate" | "violet";
}) {
  const colorMap = {
    emerald: {
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      text: "text-emerald-700",
      label: "text-emerald-600",
      icon: "text-emerald-500",
    },
    indigo: {
      bg: "bg-indigo-50",
      border: "border-indigo-100",
      text: "text-indigo-700",
      label: "text-indigo-600",
      icon: "text-indigo-500",
    },
    blue: {
      bg: "bg-blue-50",
      border: "border-blue-100",
      text: "text-blue-700",
      label: "text-blue-600",
      icon: "text-blue-500",
    },
    amber: {
      bg: "bg-amber-50",
      border: "border-amber-100",
      text: "text-amber-700",
      label: "text-amber-600",
      icon: "text-amber-500",
    },
    slate: {
      bg: "bg-slate-50",
      border: "border-slate-200",
      text: "text-slate-700",
      label: "text-slate-600",
      icon: "text-slate-500",
    },
    violet: {
      bg: "bg-violet-50",
      border: "border-violet-100",
      text: "text-violet-700",
      label: "text-violet-600",
      icon: "text-violet-500",
    },
  };
  const current = colorMap[color];

  return (
    <div className={`${current.bg} border ${current.border} p-3 rounded-xl`}>
      <div
        className={`flex items-center gap-1.5 text-xs font-medium ${current.label}`}
      >
        <span className={current.icon}>{icon}</span>
        {label}
      </div>
      <div className={`text-xl font-bold ${current.text} mt-1`}>{value}</div>
    </div>
  );
}

function UtilizationCard({ utilization }: { utilization: number }) {
  const barColor =
    utilization >= 70
      ? "bg-emerald-500"
      : utilization >= 40
        ? "bg-amber-500"
        : "bg-red-500";
  const textColor =
    utilization >= 70
      ? "text-emerald-700"
      : utilization >= 40
        ? "text-amber-700"
        : "text-red-700";
  const bgColor =
    utilization >= 70
      ? "bg-emerald-50 border-emerald-100"
      : utilization >= 40
        ? "bg-amber-50 border-amber-100"
        : "bg-red-50 border-red-100";
  const labelColor =
    utilization >= 70
      ? "text-emerald-600"
      : utilization >= 40
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div className={`${bgColor} border p-3 rounded-xl`}>
      <div
        className={`flex items-center gap-1.5 text-xs font-medium ${labelColor}`}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Utilization
      </div>
      <div className={`text-xl font-bold ${textColor} mt-1`}>
        {utilization}%
      </div>
      <div className="w-full bg-white/60 rounded-full h-1.5 mt-1.5">
        <div
          className={`${barColor} h-1.5 rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
    </div>
  );
}

function buildExportScopeConfig(
  startDate: string,
  endDate: string,
  selectedDeviceIds: number[],
  scopeLabel: string,
) {
  const reportConfig: {
    startDate: string;
    endDate: string;
    deviceId?: number;
    deviceIds: number[];
    scopeLabel: string;
  } = {
    startDate,
    endDate,
    deviceIds: selectedDeviceIds,
    scopeLabel,
  };

  if (selectedDeviceIds[0] !== undefined) {
    reportConfig.deviceId = selectedDeviceIds[0];
  }

  return reportConfig;
}

function sortDeviceIdsByDashboardOrder(deviceIds: number[]): number[] {
  const orderMap = new Map(
    DEFAULT_PERSONNEL_DEVICE_IDS.map((deviceId, index) => [deviceId, index]),
  );

  return [...deviceIds].sort((left, right) => {
    const leftOrder = orderMap.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderMap.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

function buildPersonnelReportSourceCacheKey(
  deviceIds: number[],
  queryConfig: Pick<ReportConfig, "startDate" | "endDate" | "toleranceSec">,
): string {
  return [
    queryConfig.startDate,
    queryConfig.endDate,
    String(queryConfig.toleranceSec),
    sortDeviceIdsByDashboardOrder(deviceIds).join(","),
  ].join("|");
}

export default function PersonnelReportPage() {
  const [queryConfig, setQueryConfig] = useState<
    Pick<ReportConfig, "startDate" | "endDate" | "toleranceSec">
  >({
    startDate: "",
    endDate: "",
    toleranceSec: 10,
  });
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>(
    DEFAULT_PERSONNEL_DEVICE_IDS,
  );
  const [machineEditorOpen, setMachineEditorOpen] = useState(false);
  const [deviceNameMap, setDeviceNameMap] = useState<Map<number, string>>(
    new Map(),
  );
  const [personnelOptions, setPersonnelOptions] = useState<PersonnelOption[]>(
    [],
  );
  const [selectedPersonnelKey, setSelectedPersonnelKey] = useState("");
  const [sourceLogs, setSourceLogs] = useState<DeviceLogEntry[]>([]);
  const [sourceWoDetailsMap, setSourceWoDetailsMap] = useState<
    Map<number, WoDetails>
  >(new Map());
  const [personnelOverlaps, setPersonnelOverlaps] = useState<
    PersonnelMachineOverlap[]
  >([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [woDetailsMap, setWoDetailsMap] = useState<Map<number, WoDetails>>(
    new Map(),
  );
  const [loadingStep, setLoadingStep] = useState<"personnel" | "report" | null>(
    null,
  );
  const [showPreloader, setShowPreloader] = useState(false);
  const [reportLoaderState, setReportLoaderState] =
    useState<ReportLoaderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportingGroupedExcel, setExportingGroupedExcel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reportFilters, setReportFilters] =
    useState<ReportFilters>(EMPTY_FILTERS);
  const [reportViewMode, setReportViewMode] = useState<"table" | "compare">(
    "table",
  );
  const [now, setNow] = useState(() => new Date());
  const reportExportRef = useRef<HTMLDivElement | null>(null);
  const reportSourceCacheRef = useRef<Map<string, PersonnelReportSourceBundle>>(
    new Map(),
  );

  const selectedPersonnel = useMemo(
    () =>
      personnelOptions.find((option) => option.key === selectedPersonnelKey) ??
      null,
    [personnelOptions, selectedPersonnelKey],
  );

  const availableDevices = useMemo(
    () => ALL_MACHINES,
    [],
  );

  const resolvedDeviceNameMap = useMemo(() => {
    const nextMap = new Map(deviceNameMap);
    ALL_MACHINES.forEach((device) => {
      nextMap.set(device.id, device.label);
    });
    return nextMap;
  }, [deviceNameMap]);

  const machineScopeLabel = useMemo(
    () => formatMachineScopeLabel(selectedDeviceIds, resolvedDeviceNameMap),
    [selectedDeviceIds, resolvedDeviceNameMap],
  );

  const selectedMachineSummary = useMemo(() => {
    if (selectedDeviceIds.length === 0) {
      return "No machines selected";
    }

    return availableDevices
      .filter((device) => selectedDeviceIds.includes(device.id))
      .map((device) => device.label)
      .join(" · ");
  }, [availableDevices, selectedDeviceIds]);

  const selectedMachineCountLabel = useMemo(() => {
    if (selectedDeviceIds.length === availableDevices.length) {
      return `All ${availableDevices.length} selected`;
    }

    return `${selectedDeviceIds.length} selected`;
  }, [availableDevices.length, selectedDeviceIds.length]);

  const selectionSummary = useMemo(() => {
    if (!queryConfig.startDate || !queryConfig.endDate) return null;
    const start = parseDateString(queryConfig.startDate);
    const end = parseDateString(queryConfig.endDate);
    if (!start || !end) return null;

    const diffMs = end.getTime() - start.getTime();
    const isInvalid = diffMs <= 0;
    const totalMinutes = Math.floor(Math.abs(diffMs) / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

    return {
      hours,
      minutes,
      spanLabel:
        diffDays === 0
          ? "Same day"
          : `${diffDays + 1} day${diffDays + 1 > 1 ? "s" : ""}`,
      isInvalid,
      heavyQuery: diffMs > 3 * 24 * 60 * 60 * 1000,
    };
  }, [queryConfig.endDate, queryConfig.startDate]);

  const dashboardRows = useMemo(
    () => rows.filter((row) => !row.excludeFromDashboard),
    [rows],
  );

  const exportRows = useMemo(
    () => rows.filter((row) => !row.excludeFromExport),
    [rows],
  );

  const filterOptions = useMemo(
    () => extractFilterOptions(dashboardRows),
    [dashboardRows],
  );

  const filteredRows = useMemo(() => {
    let nextRows = dashboardRows;
    if (searchQuery.trim()) {
      nextRows = nextRows.filter((row) => matchRow(row, searchQuery));
    }
    return applyFilters(nextRows, reportFilters);
  }, [dashboardRows, reportFilters, searchQuery]);

  const filteredExportRows = useMemo(() => {
    let nextRows = exportRows;
    if (searchQuery.trim()) {
      nextRows = nextRows.filter((row) => matchRow(row, searchQuery));
    }
    return applyFilters(nextRows, reportFilters);
  }, [exportRows, reportFilters, searchQuery]);
  const deferredFilteredRows = useDeferredValue(filteredRows);

  const canLoadPersonnel =
    selectedDeviceIds.length > 0 &&
    !!queryConfig.startDate &&
    !!queryConfig.endDate &&
    selectionSummary !== null &&
    !selectionSummary.isInvalid;

  const canGenerateReport =
    canLoadPersonnel &&
    personnelOptions.length > 0 &&
    !!selectedPersonnel;

  const personnelActivityMap = useMemo(
    () => summarizePersonnelActivity(sourceLogs, sourceWoDetailsMap),
    [sourceLogs, sourceWoDetailsMap],
  );

  const selectionSummaryDetailChips = useMemo(() => {
    if (!selectionSummary || selectionSummary.isInvalid) {
      return [];
    }

    return [
      formatDurationSummary(selectionSummary.hours, selectionSummary.minutes),
      `${selectionSummary.spanLabel}`,
      `${selectedDeviceIds.length} machine${selectedDeviceIds.length > 1 ? "s" : ""}`,
    ];
  }, [selectedDeviceIds.length, selectionSummary]);

  const personnelCards = useMemo(
    () =>
      personnelOptions.map((option) => {
        const activity = personnelActivityMap.get(option.key);

        const machineLabels = option.deviceIds
          .map((deviceId) => resolvedDeviceNameMap.get(deviceId) ?? `ID ${deviceId}`)
          .join(", ");

        return {
          option,
          logCount: activity?.logCount ?? 0,
          machineLabels,
          latestLogTime: activity?.latestLogTime ?? null,
        };
      }),
    [personnelActivityMap, personnelOptions, resolvedDeviceNameMap],
  );

  const selectedPersonnelCard = useMemo(
    () =>
      personnelCards.find((card) => card.option.key === selectedPersonnelKey) ??
      null,
    [personnelCards, selectedPersonnelKey],
  );

  const selectedPersonnelScopeLabel = useMemo(() => {
    if (!selectedPersonnel) {
      return "—";
    }

    return selectedPersonnel.deviceIds
      .map((deviceId) => resolvedDeviceNameMap.get(deviceId) ?? `ID ${deviceId}`)
      .join(", ");
  }, [resolvedDeviceNameMap, selectedPersonnel]);

  const reportBaseFilename = useMemo(() => {
    const personnelPart = sanitizeFilenamePart(selectedPersonnel?.name || "user");
    return `personnel_report_${personnelPart}`;
  }, [selectedPersonnel]);

  const overlapCompareWindows = useMemo(
    () =>
      reportViewMode === "compare"
        ? buildPersonnelOverlapCompareWindows(
            deferredFilteredRows,
            personnelOverlaps,
            woDetailsMap,
          )
        : [],
    [deferredFilteredRows, personnelOverlaps, reportViewMode, woDetailsMap],
  );

  const mergedLogGroups = useMemo(
    () => groupPersonnelMergedRows(deferredFilteredRows, woDetailsMap),
    [deferredFilteredRows, woDetailsMap],
  );

  function updateReportLoaderState(nextState: ReportLoaderState): void {
    setReportLoaderState((current) => {
      const nextProgress = current
        ? Math.max(current.progress, clampProgress(nextState.progress))
        : clampProgress(nextState.progress);

      if (
        current &&
        current.progress === nextProgress &&
        current.stageLabel === nextState.stageLabel &&
        current.detailLabel === nextState.detailLabel
      ) {
        return current;
      }

      return {
        ...nextState,
        progress: nextProgress,
      };
    });
  }

  function setReportLoaderStage(
    stage: Parameters<typeof getStageProgress>[0],
    stageLabel: string,
    detailLabel: string,
    ratio = 1,
  ): void {
    updateReportLoaderState({
      progress: getStageProgress(stage, ratio),
      stageLabel,
      detailLabel,
    });
  }

  function buildLogsProgressDetail(progress: DeviceLogsBatchProgress): string {
    const machineLabel =
      resolvedDeviceNameMap.get(progress.currentDeviceId) ??
      getMachineLabel(progress.currentDeviceId);
    return `${machineLabel} · page ${progress.currentDeviceCompletedPages}/${progress.currentDeviceTotalPages} · ${progress.completedDevices}/${progress.totalDevices} machines`;
  }

  function clearGeneratedReport(): void {
    setPersonnelOverlaps([]);
    setRows([]);
    setStats(null);
    setWoDetailsMap(new Map());
    setReportFilters(EMPTY_FILTERS);
    setSearchQuery("");
    setReportViewMode("table");
  }

  function clearLoadedPersonnel(): void {
    setPersonnelOptions([]);
    setSelectedPersonnelKey("");
    setSourceLogs([]);
    setSourceWoDetailsMap(new Map());
    reportSourceCacheRef.current.clear();
    clearGeneratedReport();
  }

  function handleDateChange(startDate: string, endDate: string): void {
    setQueryConfig((current) => ({
      ...current,
      startDate,
      endDate,
    }));
    setError(null);
    clearLoadedPersonnel();
  }

  function toggleDevice(deviceId: number): void {
    setSelectedDeviceIds((current) => {
      const next = current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : sortDeviceIdsByDashboardOrder([...current, deviceId]);
      return next;
    });
    setError(null);
    clearLoadedPersonnel();
  }

  async function loadDevices(): Promise<void> {
    if (!TOKEN) {
      setError("Missing API token for device lookup.");
      return;
    }

    try {
      const nextDeviceNameMap = await fetchDeviceNameMap(TOKEN);
      setDeviceNameMap(nextDeviceNameMap);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    void loadDevices();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  async function handleLoadPersonnel(): Promise<void> {
    if (!TOKEN) {
      setError("Missing API token for personnel report.");
      return;
    }

    if (!canLoadPersonnel) {
      setError("Select machines and a valid date range first.");
      return;
    }

    setLoadingStep("personnel");
    setError(null);
    clearLoadedPersonnel();

    try {
      const logs = await fetchRecentLogsForDevices(
        selectedDeviceIds,
        queryConfig,
        TOKEN,
        undefined,
        PERSONNEL_DISCOVERY_PAGES_BACK,
      );

      if (logs.length === 0) {
        throw new Error("No logs found for the selected machines and date range.");
      }

      const woIds = extractWoIds(logs);
      const detailsMap = await fetchAllWoDetails(woIds, TOKEN);

      const nextPersonnelOptions = derivePersonnelOptions(detailsMap, logs);
      if (nextPersonnelOptions.length === 0) {
        throw new Error("No personnel found for the selected machines and date range.");
      }

      setSourceLogs(logs);
      setSourceWoDetailsMap(detailsMap);
      setPersonnelOptions(nextPersonnelOptions);
      setSelectedPersonnelKey((current) => {
        if (current && nextPersonnelOptions.some((option) => option.key === current)) {
          return current;
        }
        return nextPersonnelOptions[0]?.key ?? "";
      });
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load personnel options.",
      );
    } finally {
      setLoadingStep(null);
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!selectedPersonnel) {
      setError("Select a person before generating the report.");
      return;
    }

    setLoadingStep("report");
    setShowPreloader(true);
    setReportLoaderState({
      progress: getStageProgress("logs", 0),
      stageLabel: "Preparing request",
      detailLabel: "Checking cached source data",
    });
    setError(null);
    clearGeneratedReport();

    try {
      const targetDeviceIds = sortDeviceIdsByDashboardOrder(
        resolvePersonnelReportDeviceIds(
          selectedDeviceIds,
          selectedPersonnel.deviceIds,
        ),
      );
      const cacheKey = buildPersonnelReportSourceCacheKey(
        targetDeviceIds,
        queryConfig,
      );
      let sourceBundle = reportSourceCacheRef.current.get(cacheKey);

      if (!sourceBundle) {
        setReportLoaderStage(
          "logs",
          "Fetching machine logs",
          `${targetDeviceIds.length} machines selected`,
          0,
        );
        const fullLogs = await fetchLogsForDevices(
          targetDeviceIds,
          queryConfig,
          TOKEN,
          undefined,
          (progress) => {
            setReportLoaderStage(
              "logs",
              "Fetching machine logs",
              buildLogsProgressDetail(progress),
              progress.completedRatio,
            );
          },
        );
        const fullWoIds = extractWoIds(fullLogs);
        setReportLoaderStage(
          "details",
          "Fetching work orders",
          `${fullWoIds.length} work orders queued`,
          0,
        );
        const fullWoDetailsMap = await fetchAllWoDetails(
          fullWoIds,
          TOKEN,
          (progress) => {
            setReportLoaderStage(
              "details",
              "Fetching work orders",
              `WO ${progress.completed}/${progress.total} · last #${progress.woId}`,
              progress.total <= 0 ? 1 : progress.completed / progress.total,
            );
          },
        );
        sourceBundle = {
          logs: fullLogs,
          woDetailsMap: fullWoDetailsMap,
        };
        reportSourceCacheRef.current.set(cacheKey, sourceBundle);
      } else {
        setReportLoaderStage(
          "details",
          "Using cached source data",
          `${sourceBundle.logs.length.toLocaleString()} logs already loaded`,
          1,
        );
      }

      setReportLoaderStage(
        "filter",
        "Filtering personnel",
        selectedPersonnel.name,
        0,
      );
      await waitForNextPaint();
      const filteredDetailMap = filterWoDetailsMapByPersonnel(
        sourceBundle.woDetailsMap,
        selectedPersonnel,
      );
      const filteredLogs = filterLogsByPersonnel(
        sourceBundle.logs,
        sourceBundle.woDetailsMap,
        selectedPersonnel,
      );
      setReportLoaderStage(
        "filter",
        "Filtering personnel",
        `${filteredLogs.length.toLocaleString()} matching logs`,
        1,
      );

      if (filteredLogs.length === 0) {
        throw new Error("No work orders found for the selected person.");
      }

      const reportConfig: ReportConfig = {
        deviceId: selectedDeviceIds[0] ?? 0,
        startDate: queryConfig.startDate,
        endDate: queryConfig.endDate,
        toleranceSec: queryConfig.toleranceSec,
      };

      setReportLoaderStage(
        "build",
        "Building report",
        `${filteredLogs.length.toLocaleString()} logs in scope`,
        0,
      );
      await waitForNextPaint();
      const { rows: nextRows, stats: nextStats } = buildReport(
        filteredLogs,
        filteredDetailMap,
        reportConfig,
      );
      setReportLoaderStage(
        "build",
        "Building report",
        `${nextRows.length.toLocaleString()} report rows prepared`,
        1,
      );

      setReportLoaderStage(
        "overlaps",
        "Analyzing overlaps",
        selectedPersonnel.name,
        0,
      );
      await waitForNextPaint();
      const nextOverlaps = detectPersonnelMachineOverlaps(
        filteredLogs,
        filteredDetailMap,
      );
      setReportLoaderStage(
        "overlaps",
        "Analyzing overlaps",
        `${nextOverlaps.length.toLocaleString()} overlaps detected`,
        1,
      );

      setReportLoaderStage(
        "finalize",
        "Finalizing results",
        `Rendering ${selectedPersonnel.name}`,
        1,
      );
      await waitForNextPaint();

      startTransition(() => {
        setPersonnelOverlaps(nextOverlaps);
        setRows(nextRows);
        setStats(nextStats);
        setWoDetailsMap(filteredDetailMap);
        setReportViewMode("table");
      });
    } catch (err: unknown) {
      console.error(err);
      setShowPreloader(false);
      setReportLoaderState(null);
      setError(
        err instanceof Error ? err.message : "Failed to generate personnel report.",
      );
    } finally {
      setLoadingStep(null);
    }
  }

  const clockHeadline =
    loadingStep === "personnel"
      ? `Loading personnel from ${selectedDeviceIds.length} machine${selectedDeviceIds.length > 1 ? "s" : ""}`
      : canLoadPersonnel
        ? "Load personnel to generate the people cards below."
        : "Choose machines and a valid date range first.";

  const clockDescription =
    loadingStep === "personnel" && selectionSummary
      ? `${formatDisplayDate(queryConfig.startDate)} → ${formatDisplayDate(queryConfig.endDate)}`
      : selectionSummary && !selectionSummary.isInvalid
        ? `Ready for ${formatDurationSummary(selectionSummary.hours, selectionSummary.minutes)} across the selected window.`
        : "Pick the exact start and end time on the left, then load personnel.";

  return (
    <div className="min-h-screen bg-premium-page p-6 space-y-5 dark:text-slate-100">
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-white rounded-2xl border border-slate-200/80 dark:bg-slate-800 dark:border-slate-700"
        style={{
          boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-50 border border-violet-100">
              <Users className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                Personnel Work Order Report
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Same report table, scoped to one selected person.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <Link
            to="/report"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200 hover:bg-slate-200 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Machine Report
          </Link>
          <Link
            to="/chart"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 text-xs font-medium border border-sky-200 hover:bg-sky-100 transition-colors"
          >
            <Activity className="h-3.5 w-3.5" />
            Chart
          </Link>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium border border-violet-200">
            <Users className="h-3.5 w-3.5" />
            Personnel Report
          </span>
          <ThemeToggle />
        </div>
      </header>

      <div
        className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/95 dark:border-slate-700 dark:bg-slate-800"
        style={{
          boxShadow: "0 18px 42px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.12),transparent_48%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_42%)]" />

        <div className="relative flex items-center gap-3 border-b border-slate-100/90 px-6 py-5 dark:border-slate-700">
          <div className="rounded-2xl border border-violet-100 bg-white p-2.5 shadow-[0_6px_20px_rgba(139,92,246,0.12)]">
            <SlidersHorizontal className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <span className="text-lg font-semibold text-slate-800">
              Query Settings
            </span>
            <p className="mt-0.5 text-sm text-slate-500">
              Set the machine scope and time window before loading personnel.
            </p>
          </div>
        </div>

        <div className="relative p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.72fr)_320px]">
            <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(248,250,252,0.96)_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-slate-500">
                    Machines, Date Range
                  </p>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                    Choose the exact machine scope and time window for the personnel lookup.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMachineEditorOpen((current) => !current)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
                >
                  {machineEditorOpen ? "Hide" : "Edit Machines"}
                  <span className="text-[10px]">
                    {machineEditorOpen ? "▴" : "▾"}
                  </span>
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                        {selectedMachineCountLabel}
                      </span>
                      <p className="min-w-0 flex-1 text-base font-medium text-slate-600">
                        {selectedMachineSummary}
                      </p>
                    </div>
                  </div>
                </div>

                {machineEditorOpen ? (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        Toggle machines for the personnel report.
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDeviceIds(
                              availableDevices.map((device) => device.id),
                            );
                            setError(null);
                            clearLoadedPersonnel();
                          }}
                          className="text-xs font-semibold text-violet-600 hover:text-violet-700"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDeviceIds([]);
                            setError(null);
                            clearLoadedPersonnel();
                          }}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {availableDevices.map((device) => {
                        const selected = selectedDeviceIds.includes(device.id);
                        return (
                          <button
                            key={device.id}
                            type="button"
                            onClick={() => toggleDevice(device.id)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all ${
                              selected
                                ? "border-violet-300 bg-violet-50 text-violet-700"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <span>{device.label}</span>
                            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              {`ID ${device.id}`}
                            </span>
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                device.type === "VMC"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {device.type}
                            </span>
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold ${
                                selected
                                  ? "border-violet-300 bg-violet-100"
                                  : "border-slate-200 bg-slate-50 text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[24px] border border-slate-200 bg-white/75 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                  <DateRangePicker
                    startDate={queryConfig.startDate}
                    endDate={queryConfig.endDate}
                    onChangeStruct={handleDateChange}
                  />
                </div>

                {selectionSummary ? (
                  <div
                    className={`rounded-[24px] border px-5 py-4 text-sm transition-all ${
                      selectionSummary.isInvalid
                        ? "border-red-200 bg-red-50"
                        : selectionSummary.heavyQuery
                          ? "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,rgba(255,248,220,0.92)_100%)]"
                          : "border-violet-200 bg-[linear-gradient(180deg,rgba(245,243,255,0.98)_0%,rgba(237,233,254,0.7)_100%)]"
                    }`}
                  >
                    {selectionSummary.isInvalid ? (
                      <div className="flex items-center gap-2 text-red-600 font-medium">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        End time is before start time. Fix the date range first.
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                        <div className="inline-flex items-center gap-2 text-violet-700">
                          <span className="rounded-full bg-white/80 p-2 shadow-sm">
                            <Clock className="h-4 w-4" />
                          </span>
                          <span className="text-2xl font-semibold tracking-tight">
                            {formatDurationSummary(
                              selectionSummary.hours,
                              selectionSummary.minutes,
                            )}
                          </span>
                        </div>
                        <div className="hidden h-10 w-px bg-white/70 md:block" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-mono text-sm text-slate-700">
                            {formatDisplayDate(queryConfig.startDate)}
                            <span className="mx-2 text-slate-400">→</span>
                            {formatDisplayDate(queryConfig.endDate)}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                            <span>{selectionSummary.spanLabel}</span>
                            <span className="text-slate-300">|</span>
                            <span className="inline-flex items-center gap-1">
                              <Monitor className="h-3.5 w-3.5" />
                              {selectedDeviceIds.length} machine
                              {selectedDeviceIds.length > 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-4 text-sm text-slate-400">
                    Choose a start and end time to see the duration summary here.
                  </div>
                )}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[28px] border border-violet-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,243,255,0.96)_100%)] p-6 shadow-[0_14px_30px_rgba(139,92,246,0.08)]">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />
              <div className="flex h-full flex-col justify-between gap-8">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-600">
                    <Users className="h-3.5 w-3.5" />
                    Ready Step
                  </span>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-slate-500">
                    Load Personnel
                  </p>
                  <p className="mt-3 text-base leading-8 text-slate-600">
                    Generate the people cards for this exact machine scope and date window.
                  </p>
                </div>

                <div className="grid gap-3 text-xs text-slate-500">
                  <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                    <span className="uppercase tracking-[0.24em] text-slate-400">
                      Scope
                    </span>
                    <span className="font-semibold text-slate-700">
                      {selectedDeviceIds.length} machine{selectedDeviceIds.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                    <span className="uppercase tracking-[0.24em] text-slate-400">
                      Window
                    </span>
                    <span className="font-semibold text-slate-700">
                      {selectionSummary && !selectionSummary.isInvalid
                        ? formatDurationSummary(
                            selectionSummary.hours,
                            selectionSummary.minutes,
                          )
                        : "Pick time"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleLoadPersonnel()}
                  disabled={loadingStep !== null || !canLoadPersonnel}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(135deg,#7c3aed_0%,#8b5cf6_45%,#6d28d9_100%)] px-4 py-3.5 text-sm font-semibold text-white transition-all hover:translate-y-[-1px] hover:shadow-[0_18px_28px_rgba(124,58,237,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingStep === "personnel" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  {loadingStep === "personnel" ? "Loading..." : "Load Personnel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
        style={{
          boxShadow: "0 2px 12px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div className="px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Choose Person</h2>
            <p className="mt-1 text-sm text-slate-500">
              Load personnel first, then pick a person from the generated cards.
            </p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {personnelOptions.length === 0 ? (
            <PersonnelClockPanel
              now={now}
              loading={loadingStep === "personnel"}
              headline={clockHeadline}
              description={clockDescription}
              detailChips={selectionSummaryDetailChips}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-violet-500">
                    Selected Person
                  </p>
                  <p className="mt-1 text-base font-semibold text-violet-700">
                    {selectedPersonnel?.name ?? "Choose a person"}
                  </p>
                </div>

                {selectedPersonnelCard ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-violet-600">
                    <span>{selectedPersonnelCard.option.woIds.length} WO</span>
                    <span className="text-violet-300">|</span>
                    <span>{selectedPersonnelCard.logCount} logs</span>
                    <span className="text-violet-300">|</span>
                    <span>
                      Last seen {formatRelativeAge(selectedPersonnelCard.latestLogTime, now)}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {personnelCards.map((card) => {
                  const isSelected = card.option.key === selectedPersonnelKey;
                  return (
                    <button
                      key={card.option.key}
                      type="button"
                      disabled={loadingStep !== null}
                      onClick={() => {
                        setSelectedPersonnelKey(card.option.key);
                        setError(null);
                        clearGeneratedReport();
                      }}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        isSelected
                          ? "border-violet-300 bg-violet-50 shadow-[0_8px_24px_rgba(139,92,246,0.12)]"
                          : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40"
                      } disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`truncate text-base font-semibold ${
                              isSelected ? "text-violet-700" : "text-slate-800"
                            }`}
                          >
                            {card.option.name}
                          </p>
                          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                            {card.option.deviceIds.length} machine
                            {card.option.deviceIds.length > 1 ? "s" : ""}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                            isSelected
                              ? "bg-violet-100 text-violet-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {isSelected ? "Selected" : "Choose"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                            WO
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">
                            {card.option.woIds.length}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                            Logs
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">
                            {card.logCount}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                            Seen
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">
                            {formatRelativeAge(card.latestLogTime, now)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                          Machines
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {card.machineLabels || "No machine data"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {personnelOptions.length > 0 ? (
          <div className="flex justify-center border-t border-slate-100 px-5 pb-5 pt-4">
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={loadingStep !== null || !canGenerateReport}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingStep === "report" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {loadingStep === "report"
                ? "Generating..."
                : "Generate Personnel Report"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-red-600 text-sm flex items-start gap-2 animate-fade-in-down">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <span className="font-medium">{error}</span>
        </div>
      ) : null}

      <div
        ref={reportExportRef}
        className="space-y-5"
        style={{
          position: "relative",
          minHeight: showPreloader ? "calc(100vh - 320px)" : undefined,
          borderRadius: showPreloader ? "16px" : undefined,
          overflow: showPreloader ? "hidden" : undefined,
        }}
      >
        {showPreloader ? (
          <BoxLoadingPreloader
            contained
            loading={loadingStep === "report"}
            onDone={() => {
              setShowPreloader(false);
              setReportLoaderState(null);
            }}
            deviceId={selectedDeviceIds[0] ?? 0}
            label="PERSONNEL REPORT"
            {...(reportLoaderState
              ? {
                  progress: reportLoaderState.progress,
                  statusLabel: reportLoaderState.stageLabel,
                  detailLabel: reportLoaderState.detailLabel,
                }
              : {})}
          />
        ) : null}

        {stats && selectedPersonnel ? (
          <div className="space-y-5 animate-fade-in-up">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-violet-50">
                    <BarChart3 className="h-4 w-4 text-violet-600" />
                  </div>
                  Personnel Results Analysis
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 text-xs font-semibold">
                    {filteredRows.length.toLocaleString()} report rows
                  </span>
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedPersonnel.name} • Query scope: {machineScopeLabel}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Personnel scope: {selectedPersonnelScopeLabel}
                </p>
              </div>

              <div className="flex items-center gap-2" data-pdf-exclude="true">
                <button
                  onClick={async () => {
                    try {
                      if (!stats) return;
                      const { exportToExcel } = await import("./export-utils");
                      await exportToExcel({
                        rows: filteredExportRows,
                        stats,
                        woDetailsMap,
                        deviceNameMap: resolvedDeviceNameMap,
                        filename: `${reportBaseFilename}.xlsx`,
                        reportConfig: buildExportScopeConfig(
                          queryConfig.startDate,
                          queryConfig.endDate,
                          selectedDeviceIds,
                          machineScopeLabel,
                        ),
                        analysisTitle: "Personnel Logs Analysis",
                      });
                    } catch (err: unknown) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Excel export failed.",
                      );
                    }
                  }}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 active:bg-emerald-800 transition-all text-sm font-semibold"
                  style={{ boxShadow: "0 1px 4px rgba(5,150,105,0.3)" }}
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </button>

                <button
                  onClick={async () => {
                    try {
                      setExportingGroupedExcel(true);
                      if (!stats) return;
                      const { exportToGroupedExcel } =
                        await import("./export-utils");
                      await exportToGroupedExcel({
                        rows: exportRows,
                        stats,
                        woDetailsMap,
                        deviceNameMap: resolvedDeviceNameMap,
                        filename: `${reportBaseFilename}_grouped.xlsx`,
                        reportConfig: buildExportScopeConfig(
                          queryConfig.startDate,
                          queryConfig.endDate,
                          selectedDeviceIds,
                          machineScopeLabel,
                        ),
                        analysisTitle: "Personnel Logs Analysis",
                      });
                    } catch (err: unknown) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Grouped Excel export failed.",
                      );
                    } finally {
                      setExportingGroupedExcel(false);
                    }
                  }}
                  disabled={exportingGroupedExcel}
                  className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-xl hover:bg-cyan-700 active:bg-cyan-800 transition-all text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ boxShadow: "0 1px 4px rgba(8,145,178,0.3)" }}
                >
                  {exportingGroupedExcel ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {exportingGroupedExcel
                    ? "Exporting Grouped..."
                    : "Export Excel Grouped"}
                </button>

                <button
                  onClick={async () => {
                    try {
                      if (!reportExportRef.current) {
                        throw new Error("Report is not ready for PDF export.");
                      }
                      const { exportToPDF } = await import("./export-utils");
                      await exportToPDF({
                        sourceElement: reportExportRef.current,
                        filename: `${reportBaseFilename}.pdf`,
                      });
                    } catch (err: unknown) {
                      setError(
                        err instanceof Error ? err.message : "PDF export failed.",
                      );
                    }
                  }}
                  className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-xl hover:bg-rose-700 active:bg-rose-800 transition-all text-sm font-semibold"
                  style={{ boxShadow: "0 1px 4px rgba(225,29,72,0.3)" }}
                >
                  <Download className="h-4 w-4" />
                  Export PDF
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
                    Personnel
                  </p>
                  <p className="mt-1 text-sm font-semibold text-violet-700">
                    {selectedPersonnel.name}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
                    Query Scope
                  </p>
                  <p className="mt-1 text-sm font-semibold text-violet-700">
                    {machineScopeLabel}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
                    Personnel Scope
                  </p>
                  <p className="mt-1 text-sm font-semibold text-violet-700">
                    {selectedPersonnelScopeLabel}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
                    Work Orders
                  </p>
                  <p className="mt-1 text-sm font-semibold text-violet-700">
                    {stats.woBreakdowns.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
              <KpiCard
                icon={<FileText className="h-4 w-4" />}
                label="Total Logs"
                value={String(stats.totalLogs)}
                color="slate"
              />
              <KpiCard
                icon={<Activity className="h-4 w-4" />}
                label="Total Jobs"
                value={String(stats.totalJobs)}
                color="emerald"
              />
              <KpiCard
                icon={<Zap className="h-4 w-4" />}
                label="Total Cycles"
                value={String(stats.totalCycles)}
                color="indigo"
              />
              <KpiCard
                icon={<Timer className="h-4 w-4" />}
                label="Cutting Time"
                value={formatDuration(stats.totalCuttingSec)}
                color="blue"
              />
              <KpiCard
                icon={<Coffee className="h-4 w-4" />}
                label="Pause / Break"
                value={formatDuration(stats.totalPauseSec)}
                color="amber"
              />
              <KpiCard
                icon={<Loader2 className="h-4 w-4" />}
                label="Loading Time"
                value={formatDuration(stats.totalLoadingUnloadingSec)}
                color="slate"
              />
              <UtilizationCard utilization={stats.machineUtilization} />
            </div>

            <div
              className="bg-white rounded-2xl border border-slate-200/80 p-4"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
            >
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-slate-400" />
                Production Quality
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">
                    Allotted
                  </div>
                  <div className="text-2xl font-bold text-blue-700 mt-1 tabular-nums">
                    {stats.totalAllotedQty}
                  </div>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                    OK Qty
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
                    {stats.totalOkQty}
                  </div>
                </div>
                <div
                  className={`text-center p-3 rounded-xl border ${
                    stats.totalRejectQty > 0
                      ? "bg-rose-50 border-rose-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      stats.totalRejectQty > 0
                        ? "text-rose-500"
                        : "text-slate-400"
                    }`}
                  >
                    Rejects
                  </div>
                  <div
                    className={`text-2xl font-bold mt-1 tabular-nums ${
                      stats.totalRejectQty > 0
                        ? "text-rose-700"
                        : "text-slate-500"
                    }`}
                  >
                    {stats.totalRejectQty}
                  </div>
                </div>
              </div>
            </div>

            {stats.woBreakdowns.length > 0 ? (
              <div
                className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
              >
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-indigo-400" />
                    Work Order Breakdown
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr
                        style={{
                          background:
                            "linear-gradient(180deg,#1e293b 0%,#0f172a 100%)",
                        }}
                      >
                        {[
                          "WO ID",
                          "Machine",
                          "Part No",
                          "Operator",
                          "Job Type",
                          "Jobs",
                          "Cycles",
                          "Cutting",
                          "Pause",
                          "Loading",
                          "PCL",
                          "Avg Cycle",
                          "Allot",
                          "OK",
                          "Reject",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap text-left"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.woBreakdowns.map((wo) => (
                        <tr
                          key={wo.woId}
                          className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/20 transition-colors"
                        >
                          <td className="px-3 py-2 font-bold text-indigo-600 font-mono text-[11px]">
                            #{wo.woId}
                          </td>
                          <td className="px-3 py-2 text-[11px]">
                            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-700">
                              {getMachineLabel(wo.deviceId)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-[11px] font-medium">
                            {wo.partNo || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-600 text-[11px]">
                            {wo.operator}
                          </td>
                          <td className="px-3 py-2 text-[11px]">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              {wo.jobType || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-800 text-[11px] tabular-nums">
                            {wo.jobs}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-800 text-[11px] tabular-nums">
                            {wo.cycles}
                          </td>
                          <td className="px-3 py-2 text-left font-mono text-blue-600 text-[11px] tabular-nums">
                            {formatDuration(wo.cuttingSec)}
                          </td>
                          <td className="px-3 py-2 text-left font-mono text-amber-600 text-[11px] tabular-nums">
                            {formatDuration(wo.pauseSec)}
                          </td>
                          <td className="px-3 py-2 text-left font-mono text-slate-500 text-[11px] tabular-nums">
                            {formatDuration(wo.loadingSec)}
                          </td>
                          <td className="px-3 py-2 text-left text-slate-500 text-[11px] tabular-nums">
                            {wo.pcl ? formatDuration(wo.pcl) : "—"}
                          </td>
                          <td className="px-3 py-2 text-left font-mono text-slate-500 text-[11px] tabular-nums">
                            {formatDuration(wo.avgCycleSec)}
                          </td>
                          <td className="px-3 py-2 text-center text-blue-600 font-bold text-[11px] tabular-nums">
                            {wo.allotedQty}
                          </td>
                          <td className="px-3 py-2 text-center text-emerald-600 font-bold text-[11px] tabular-nums">
                            {wo.okQty}
                          </td>
                          <td className="px-3 py-2 text-center text-[11px] tabular-nums">
                            <span
                              className={
                                wo.rejectQty > 0
                                  ? "font-bold text-rose-600"
                                  : "text-slate-400"
                              }
                            >
                              {wo.rejectQty}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {stats.operatorSummaries.length > 0 ? (
              <div
                className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
              >
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-violet-400" />
                    Operator Summary
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr
                        style={{
                          background:
                            "linear-gradient(180deg,#1e293b 0%,#0f172a 100%)",
                        }}
                      >
                        {[
                          "Operator",
                          "WOs",
                          "Jobs",
                          "Cycles",
                          "Cutting Time",
                          "Pause Time",
                          "Avg Cycle",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap text-left"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.operatorSummaries.map((operator) => (
                        <tr
                          key={operator.name}
                          className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/20 transition-colors"
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold flex-shrink-0">
                                {operator.name
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((word) => word[0]?.toUpperCase() ?? "")
                                  .join("")}
                              </span>
                              <span className="font-semibold text-violet-700 text-[11px]">
                                {operator.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-700 text-[11px] tabular-nums">
                            {operator.woCount}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-700 text-[11px] tabular-nums">
                            {operator.totalJobs}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-700 text-[11px] tabular-nums">
                            {operator.totalCycles}
                          </td>
                          <td className="px-3 py-2 font-mono text-blue-600 text-[11px] tabular-nums">
                            {formatDuration(operator.totalCuttingSec)}
                          </td>
                          <td className="px-3 py-2 font-mono text-amber-600 text-[11px] tabular-nums">
                            {formatDuration(operator.totalPauseSec)}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500 text-[11px] tabular-nums">
                            {formatDuration(operator.avgCycleSec)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : personnelOptions.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Personnel loaded. Generate the report to view results.
          </div>
        ) : null}

        {dashboardRows.length > 0 ? (
          <>
            <ReportFilterBar
              filters={reportFilters}
              onChange={setReportFilters}
              availableActions={filterOptions.actions}
              availableJobTypes={filterOptions.jobTypes}
              availableOperators={filterOptions.operators}
              availableLabels={filterOptions.labels}
              availableMachines={filterOptions.machines}
              totalRows={dashboardRows.length}
              filteredRows={filteredRows.length}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
            {personnelOverlaps.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Log View
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Use merged logs for faster browsing. Open compare only when you need overlap analysis.
                  </p>
                </div>
                <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setReportViewMode("table")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      reportViewMode === "table"
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Merged Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportViewMode("compare")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      reportViewMode === "compare"
                        ? "bg-violet-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Compare Overlap
                  </button>
                </div>
              </div>
            ) : null}
            {reportViewMode === "compare" ? (
              overlapCompareWindows.length > 0 ? (
                <ReportCompareMatrix
                  windows={overlapCompareWindows}
                  woDetailsMap={woDetailsMap}
                />
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-8 text-center text-sm text-slate-500">
                  No overlap rows match the current search and filters.
                </div>
              )
            ) : (
              mergedLogGroups.length > 0 ? (
                <div className="space-y-5">
                  {mergedLogGroups.map((group) => (
                    <section
                      key={group.key}
                      className="space-y-3 rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700">
                          {group.machineLabel}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
                          WO #{group.woIdLabel}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                          {group.jobType}
                        </span>
                        <span className="ml-auto text-xs font-medium text-slate-400">
                          {group.rows.filter((row) => !row.isWoHeader && !row.isWoSummary).length} log row
                          {group.rows.filter((row) => !row.isWoHeader && !row.isWoSummary).length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <ReportTable
                        rows={group.rows}
                        loading={loadingStep === "report"}
                        isFiltered={
                          !!searchQuery ||
                          reportFilters.actions.length > 0 ||
                          reportFilters.jobTypes.length > 0 ||
                          reportFilters.operators.length > 0 ||
                          reportFilters.labels.length > 0 ||
                          reportFilters.machines.length > 0
                        }
                        woDetailsMap={woDetailsMap}
                      />
                    </section>
                  ))}
                </div>
              ) : (
                <ReportTable
                  rows={filteredRows}
                  loading={loadingStep === "report"}
                  isFiltered={
                    !!searchQuery ||
                    reportFilters.actions.length > 0 ||
                    reportFilters.jobTypes.length > 0 ||
                    reportFilters.operators.length > 0 ||
                    reportFilters.labels.length > 0 ||
                    reportFilters.machines.length > 0
                  }
                  woDetailsMap={woDetailsMap}
                />
              )
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
