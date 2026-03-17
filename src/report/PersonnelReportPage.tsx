import React, { useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import BoxLoadingPreloader from "../components/ui/BoxLoadingPreloader";
import DotMatrixEmptyState from "../components/ui/DotMatrixEmptyState";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Circle,
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
import { ReportTable } from "./ReportTable";
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
  derivePersonnelOptions,
  fetchLogsForDevices,
  filterLogsByPersonnel,
  filterWoDetailsMapByPersonnel,
  formatMachineScopeLabel,
  sanitizeFilenamePart,
  type PersonnelOption,
} from "./personnel-report-utils";
import type { DeviceLogEntry } from "./report-types";
import { getMachineLabel, getMachineType } from "./machine-config";

const TOKEN = import.meta.env.VITE_API_TOKEN;

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

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
        done ? "text-emerald-600" : "text-slate-400"
      }`}
    >
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0" />
      )}
      {label}
    </span>
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

export default function PersonnelReportPage() {
  const [queryConfig, setQueryConfig] = useState<
    Pick<ReportConfig, "startDate" | "endDate" | "toleranceSec">
  >({
    startDate: "",
    endDate: "",
    toleranceSec: 10,
  });
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([15]);
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
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [woDetailsMap, setWoDetailsMap] = useState<Map<number, WoDetails>>(
    new Map(),
  );
  const [loadingStep, setLoadingStep] = useState<"personnel" | "report" | null>(
    null,
  );
  const [showPreloader, setShowPreloader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingGroupedExcel, setExportingGroupedExcel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reportFilters, setReportFilters] =
    useState<ReportFilters>(EMPTY_FILTERS);
  const reportExportRef = useRef<HTMLDivElement | null>(null);

  const selectedPersonnel = useMemo(
    () =>
      personnelOptions.find((option) => option.key === selectedPersonnelKey) ??
      null,
    [personnelOptions, selectedPersonnelKey],
  );

  const availableDevices = useMemo(
    () =>
      Array.from(deviceNameMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.id - right.id),
    [deviceNameMap],
  );

  const machineScopeLabel = useMemo(
    () => formatMachineScopeLabel(selectedDeviceIds, deviceNameMap),
    [selectedDeviceIds, deviceNameMap],
  );

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

  const canLoadPersonnel =
    selectedDeviceIds.length > 0 &&
    !!queryConfig.startDate &&
    !!queryConfig.endDate &&
    selectionSummary !== null &&
    !selectionSummary.isInvalid;

  const canGenerateReport =
    canLoadPersonnel &&
    sourceLogs.length > 0 &&
    sourceWoDetailsMap.size > 0 &&
    !!selectedPersonnel;

  const reportBaseFilename = useMemo(() => {
    const personnelPart = sanitizeFilenamePart(selectedPersonnel?.name || "user");
    return `personnel_report_${personnelPart}`;
  }, [selectedPersonnel]);

  function clearGeneratedReport(): void {
    setRows([]);
    setStats(null);
    setWoDetailsMap(new Map());
    setReportFilters(EMPTY_FILTERS);
    setSearchQuery("");
  }

  function clearLoadedPersonnel(): void {
    setPersonnelOptions([]);
    setSelectedPersonnelKey("");
    setSourceLogs([]);
    setSourceWoDetailsMap(new Map());
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
        : [...current, deviceId].sort((left, right) => left - right);
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
      const logs = await fetchLogsForDevices(selectedDeviceIds, queryConfig, TOKEN);

      if (logs.length === 0) {
        throw new Error("No logs found for the selected machines and date range.");
      }

      const woIds = extractWoIds(logs);
      const [detailsMap, nextDeviceNameMap] = await Promise.all([
        fetchAllWoDetails(woIds, TOKEN),
        fetchDeviceNameMap(TOKEN),
      ]);

      if (nextDeviceNameMap.size > 0) {
        setDeviceNameMap(nextDeviceNameMap);
      }

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
    setError(null);
    clearGeneratedReport();

    try {
      const filteredDetailMap = filterWoDetailsMapByPersonnel(
        sourceWoDetailsMap,
        selectedPersonnel,
      );
      const filteredLogs = filterLogsByPersonnel(
        sourceLogs,
        sourceWoDetailsMap,
        selectedPersonnel,
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

      const { rows: nextRows, stats: nextStats } = buildReport(
        filteredLogs,
        filteredDetailMap,
        reportConfig,
      );

      setRows(nextRows);
      setStats(nextStats);
      setWoDetailsMap(filteredDetailMap);
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to generate personnel report.",
      );
    } finally {
      setLoadingStep(null);
    }
  }

  return (
    <div className="min-h-screen bg-premium-page p-6 space-y-5 dark:text-slate-100">
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-white rounded-2xl border border-slate-200/80 dark:bg-slate-800 dark:border-slate-700"
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
            to="/report"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200 hover:bg-slate-200 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Machine Report
          </Link>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium border border-violet-200">
            <Users className="h-3.5 w-3.5" />
            Personnel Report
          </span>
          <ThemeToggle />
        </div>
      </header>

      <div
        className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden dark:bg-slate-800 dark:border-slate-700"
        style={{
          boxShadow: "0 2px 12px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 dark:border-slate-700">
          <div className="p-1.5 rounded-lg bg-violet-50">
            <SlidersHorizontal className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <span className="text-sm font-semibold text-slate-700">
            Query Settings
          </span>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
              Machines
            </label>
            {availableDevices.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Loading machine list...
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">
                    Choose one or more machines before loading personnel.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDeviceIds(availableDevices.map((device) => device.id));
                      setError(null);
                      clearLoadedPersonnel();
                    }}
                    className="text-xs font-semibold text-violet-600 hover:text-violet-700"
                  >
                    Select All
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {availableDevices.map((device) => {
                    const selected = selectedDeviceIds.includes(device.id);
                    return (
                      <button
                        key={device.id}
                        type="button"
                        onClick={() => toggleDevice(device.id)}
                        className={`rounded-xl border px-3 py-3 text-left transition-all ${
                          selected
                            ? "border-violet-300 bg-violet-50 text-violet-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{device.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs opacity-60">{`ID ${device.id}`}</p>
                              {getMachineType(device.id) && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    getMachineType(device.id) === 'VMC'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-emerald-100 text-emerald-700'
                                  }`}
                                >
                                  {getMachineLabel(device.id)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold flex-shrink-0 ${
                              selected
                                ? "border-violet-300 bg-violet-100"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            {selected ? "✓" : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
              Date Range
            </label>
            <DateRangePicker
              startDate={queryConfig.startDate}
              endDate={queryConfig.endDate}
              onChangeStruct={handleDateChange}
            />
          </div>

          {selectionSummary && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm transition-all ${
                selectionSummary.isInvalid
                  ? "bg-red-50 border-red-200"
                  : selectionSummary.heavyQuery
                    ? "bg-amber-50 border-amber-200"
                    : "bg-violet-50 border-violet-100"
              }`}
            >
              {selectionSummary.isInvalid ? (
                <div className="flex items-center gap-2 text-red-600 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  End time is before start time. Fix the date range first.
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 font-bold text-violet-700 text-base">
                    <Clock className="h-4 w-4" />
                    {selectionSummary.hours}h&nbsp;
                    {String(selectionSummary.minutes).padStart(2, "0")}min
                  </span>
                  <span className="text-slate-300 select-none">|</span>
                  <span className="text-slate-600 font-mono text-xs">
                    {formatDisplayDate(queryConfig.startDate)}
                    <span className="mx-1.5 text-slate-400">→</span>
                    {formatDisplayDate(queryConfig.endDate)}
                  </span>
                  <span className="text-slate-300 select-none">|</span>
                  <span className="text-slate-500 text-xs">
                    {selectionSummary.spanLabel}
                  </span>
                  <span className="text-slate-300 select-none">|</span>
                  <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                    <Monitor className="h-3.5 w-3.5" />
                    {selectedDeviceIds.length} machine
                    {selectedDeviceIds.length > 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Step 1
                  </p>
                  <p className="text-sm font-semibold text-slate-700">
                    Load available personnel
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleLoadPersonnel()}
                  disabled={loadingStep !== null || !canLoadPersonnel}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingStep === "personnel" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  {loadingStep === "personnel" ? "Loading..." : "Load Personnel"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <CheckItem done={selectedDeviceIds.length > 0} label="Machine set" />
                <CheckItem done={!!queryConfig.startDate} label="Start date" />
                <CheckItem done={!!queryConfig.endDate} label="End date" />
                <CheckItem
                  done={personnelOptions.length > 0}
                  label="Personnel loaded"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Scope
                </p>
                <p className="text-sm font-medium text-slate-700">
                  {machineScopeLabel || "No machine selected"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Step 2
                </p>
                <p className="text-sm font-semibold text-slate-700">
                  Choose person and generate
                </p>
              </div>

              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                Personnel
              </label>
              <select
                value={selectedPersonnelKey}
                onChange={(event) => {
                  setSelectedPersonnelKey(event.target.value);
                  setError(null);
                  clearGeneratedReport();
                }}
                disabled={personnelOptions.length === 0 || loadingStep !== null}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {personnelOptions.length === 0 ? (
                  <option value="">Load personnel first</option>
                ) : null}
                {personnelOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {`${option.name} • ${option.woIds.length} WO`}
                  </option>
                ))}
              </select>

              {selectedPersonnel ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
                  <p className="font-semibold text-violet-700">
                    {selectedPersonnel.name}
                  </p>
                  <p className="text-violet-600 text-xs mt-1">
                    {selectedPersonnel.woIds.length} WO •{" "}
                    {selectedPersonnel.deviceIds.length} machine
                    {selectedPersonnel.deviceIds.length > 1 ? "s" : ""}
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={loadingStep !== null || !canGenerateReport}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
          </div>
        </div>

        {error ? (
          <div className="px-5 py-3 bg-red-50 border-t border-red-200 text-red-600 text-sm flex items-start gap-2 animate-fade-in-down">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
            <span className="font-medium">{error}</span>
          </div>
        ) : null}
      </div>

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
            onDone={() => setShowPreloader(false)}
            deviceId={selectedDeviceIds[0] ?? 0}
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
                    {filteredRows.length.toLocaleString()} rows
                  </span>
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedPersonnel.name} • {machineScopeLabel}
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
                        deviceNameMap,
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
                        deviceNameMap,
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
              <div className="grid gap-3 md:grid-cols-3">
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
                    Machines
                  </p>
                  <p className="mt-1 text-sm font-semibold text-violet-700">
                    {machineScopeLabel}
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
        ) : dashboardRows.length === 0 &&
          loadingStep === null &&
          !showPreloader ? (
          <DotMatrixEmptyState />
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
            <ReportTable
              rows={filteredRows}
              loading={loadingStep === "report"}
              isFiltered={
                !!searchQuery ||
                reportFilters.actions.length > 0 ||
                reportFilters.jobTypes.length > 0 ||
                reportFilters.operators.length > 0 ||
                reportFilters.labels.length > 0
              }
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
