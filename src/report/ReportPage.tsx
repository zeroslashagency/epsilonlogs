import React, { useRef, useState, useMemo } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import BoxLoadingPreloader from "../components/ui/BoxLoadingPreloader";
import DotMatrixEmptyState from "../components/ui/DotMatrixEmptyState";
import {
  ArrowLeft,
  FileText,
  Download,
  Play,
  Activity,
  Users,
  Package,
  Timer,
  Coffee,
  Loader2,
  BarChart3,
  Zap,
  Clock,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Monitor,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ReportTable } from "./ReportTable";
import {
  ReportConfig,
  ReportRow,
  ReportStats,
  WoDetails,
} from "./report-types";
import {
  fetchDeviceLogs,
  fetchAllWoDetails,
  fetchDeviceNameMap,
} from "./api-client";
import { buildReport } from "./report-builder";
import { extractWoIds } from "./log-normalizer";
import { formatDuration } from "./format-utils";
import { DateRangePicker } from "../components/ui/DateRangePicker";
import { matchRow } from "./search-utils";
import {
  ReportFilterBar,
  ReportFilters,
  EMPTY_FILTERS,
  extractFilterOptions,
  applyFilters,
} from "./ReportFilterBar";
import { VMC_MACHINES, CNC_MACHINES, getMachineLabel, getMachineType } from "./machine-config";

const TOKEN = import.meta.env.VITE_API_TOKEN;

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Parse "DD-MM-YYYY HH:MM" → Date (or null) */
function parseDateString(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
  );
}

/** Format "DD-MM-YYYY HH:MM" → "09 Feb 2026, 11:00" */
function formatDisplayDate(s: string): string {
  const d = parseDateString(s);
  if (!d) return s;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── Checklist item sub-component ─────────────────────────────────────────────
function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${done ? "text-emerald-600" : "text-slate-400"
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

export default function ReportPage() {
  const [config, setConfig] = useState<ReportConfig>({
    deviceId: 15,
    startDate: "",
    endDate: "",
    toleranceSec: 10,
  });

  const [loading, setLoading] = useState(false);
  const [showPreloader, setShowPreloader] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [woDetailsMap, setWoDetailsMap] = useState<Map<number, WoDetails>>(
    new Map(),
  );
  const [deviceNameMap, setDeviceNameMap] = useState<Map<number, string>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [exportingGroupedExcel, setExportingGroupedExcel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reportFilters, setReportFilters] =
    useState<ReportFilters>(EMPTY_FILTERS);
  const reportExportRef = useRef<HTMLDivElement | null>(null);

  // ── Selection summary (live, derived from config dates) ───────────────────
  const selectionSummary = useMemo(() => {
    if (!config.startDate || !config.endDate) return null;
    const start = parseDateString(config.startDate);
    const end = parseDateString(config.endDate);
    if (!start || !end) return null;

    const diffMs = end.getTime() - start.getTime();
    const isInvalid = diffMs <= 0;
    const absDiffMs = Math.abs(diffMs);
    const totalMinutes = Math.floor(absDiffMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const diffDays = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
    const spanLabel =
      diffDays === 0
        ? "Same day"
        : `${diffDays + 1} day${diffDays + 1 > 1 ? "s" : ""}`;
    const heavyQuery = diffMs > 3 * 24 * 60 * 60 * 1000;

    return { hours, minutes, spanLabel, isInvalid, heavyQuery };
  }, [config.startDate, config.endDate]);

  const allReady =
    config.deviceId > 0 &&
    !!config.startDate &&
    !!config.endDate &&
    selectionSummary !== null &&
    !selectionSummary.isInvalid;

  const dashboardRows = useMemo(
    () => rows.filter((row) => !row.excludeFromDashboard),
    [rows],
  );

  const exportRows = useMemo(
    () => rows.filter((row) => !row.excludeFromExport),
    [rows],
  );

  // Derive available filter options from dashboard rows
  const filterOptions = useMemo(
    () => extractFilterOptions(dashboardRows),
    [dashboardRows],
  );

  // Filter rows based on search query + active filters
  const filteredRows = useMemo(() => {
    let result = dashboardRows;
    if (searchQuery.trim())
      result = result.filter((row) => matchRow(row, searchQuery));
    result = applyFilters(result, reportFilters);
    return result;
  }, [dashboardRows, searchQuery, reportFilters]);

  const filteredExportRows = useMemo(() => {
    let result = exportRows;
    if (searchQuery.trim())
      result = result.filter((row) => matchRow(row, searchQuery));
    result = applyFilters(result, reportFilters);
    return result;
  }, [exportRows, searchQuery, reportFilters]);

  // Reset filters when new data is loaded
  const handleFilterChange = (f: ReportFilters) => setReportFilters(f);

  const handleGenerate = async () => {
    if (!config.startDate || !config.endDate) {
      setError("Please select both a start date and an end date.");
      return;
    }

    setLoading(true);
    setShowPreloader(true);
    setError(null);
    setRows([]);
    setStats(null);
    setWoDetailsMap(new Map());
    setDeviceNameMap(new Map());
    setReportFilters(EMPTY_FILTERS);
    setSearchQuery("");

    try {
      const logs = await fetchDeviceLogs(config, TOKEN);

      if (logs.length === 0) {
        setError("No logs found for this period.");
        setLoading(false);
        return;
      }

      const woIds = extractWoIds(logs);
      const [detailsMap, fetchedDeviceNameMap] = await Promise.all([
        fetchAllWoDetails(woIds, TOKEN),
        fetchDeviceNameMap(TOKEN),
      ]);
      const { rows: reportRows, stats: reportStats } = buildReport(
        logs,
        detailsMap,
        config,
      );

      setRows(reportRows);
      setStats(reportStats);
      setWoDetailsMap(detailsMap);
      setDeviceNameMap(fetchedDeviceNameMap);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-premium-page p-6 space-y-5 dark:text-slate-100">
      {/* ── Page Header ── */}
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
            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100">
              <FileText className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                Machine Report
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Job Block analysis from raw device logs
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
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium border border-indigo-200">
            <FileText className="h-3.5 w-3.5" />
            Machine Report
          </span>
          <Link
            to="/report/personnel"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200 hover:bg-violet-100 transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            Personnel Report
          </Link>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              getMachineType(config.deviceId) === 'VMC'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : getMachineType(config.deviceId) === 'CNC'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            {getMachineLabel(config.deviceId)}
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Controls Panel ── */}
      <div
        className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden dark:bg-slate-800 dark:border-slate-700"
        style={{
          boxShadow: "0 2px 12px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 dark:border-slate-700">
          <div className="p-1.5 rounded-lg bg-indigo-50">
            <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          <span className="text-sm font-semibold text-slate-700">
            Query Settings
          </span>
        </div>
        <div className="p-5 space-y-4">
          {/* Row 1 — Device ID + Date Range */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-48 shrink-0">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Machine
              </label>
              <select
                value={config.deviceId}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    deviceId: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 outline-none text-sm text-slate-800 font-semibold bg-slate-50/60 transition-all cursor-pointer"
              >
                <optgroup label="─── VMC ───">
                  {VMC_MACHINES.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
                <optgroup label="─── CNC ───">
                  {CNC_MACHINES.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="flex-1 min-w-0">
              <DateRangePicker
                startDate={config.startDate}
                endDate={config.endDate}
                onChangeStruct={(start, end) =>
                  setConfig({ ...config, startDate: start, endDate: end })
                }
              />
            </div>
          </div>

          {/* Row 2 — Selection Summary Bar (appears once both dates filled) */}
          {selectionSummary && (
            <div
              className={`rounded-lg border px-4 py-2.5 text-sm transition-all ${selectionSummary.isInvalid
                  ? "bg-red-50 border-red-200"
                  : selectionSummary.heavyQuery
                    ? "bg-amber-50 border-amber-200"
                    : "bg-indigo-50 border-indigo-100"
                }`}
            >
              {selectionSummary.isInvalid ? (
                <div className="flex items-center gap-2 text-red-600 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  End time is before start time — please fix the date range.
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {/* Duration pill */}
                  <span className="inline-flex items-center gap-1.5 font-bold text-indigo-700 text-base">
                    <Clock className="h-4 w-4" />
                    {selectionSummary.hours}h&nbsp;
                    {String(selectionSummary.minutes).padStart(2, "0")}min
                  </span>

                  <span className="text-slate-300 select-none">|</span>

                  {/* Date range */}
                  <span className="text-slate-600 font-mono text-xs">
                    {formatDisplayDate(config.startDate)}
                    <span className="mx-1.5 text-slate-400">→</span>
                    {formatDisplayDate(config.endDate)}
                  </span>

                  <span className="text-slate-300 select-none">|</span>

                  {/* Span */}
                  <span className="text-slate-500 text-xs">
                    {selectionSummary.spanLabel}
                  </span>

                  <span className="text-slate-300 select-none">|</span>

                  {/* Device */}
                  <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                    <Monitor className="h-3.5 w-3.5" />
                    {getMachineLabel(config.deviceId)}
                  </span>

                  {/* Heavy query warning */}
                  {selectionSummary.heavyQuery && (
                    <span className="ml-auto inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Large range — query may be slow
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Row 3 — Checklist + Generate */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Checklist */}
            <div className="flex items-center gap-4">
              <CheckItem done={config.deviceId > 0} label="Device set" />
              <CheckItem done={!!config.startDate} label="Start date" />
              <CheckItem done={!!config.endDate} label="End date" />
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Generate button with ready-pulse ring */}
            <div className="relative">
              {allReady && !loading && (
                <span className="absolute inset-0 rounded-xl ring-2 ring-indigo-400 ring-offset-1 animate-pulse pointer-events-none" />
              )}
              <button
                onClick={handleGenerate}
                disabled={
                  loading ||
                  !config.startDate ||
                  !config.endDate ||
                  selectionSummary?.isInvalid === true
                }
                className="relative flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-all font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: "0 2px 8px rgba(99,102,241,0.35)" }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {loading ? "Generating…" : "Generate Report"}
              </button>
            </div>
          </div>
        </div>

        {/* Error bar */}
        {error && (
          <div className="px-5 py-3 bg-red-50 border-t border-red-200 text-red-600 text-sm flex items-start gap-2 animate-fade-in-down">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
            <span className="font-medium">{error}</span>
          </div>
        )}
      </div>

      {/* ── Results section — loader overlays this area while empty ── */}
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
        {/* ── Skiper-15 Box Loader — contained inside results area ── */}
        {showPreloader && (
          <BoxLoadingPreloader
            contained
            loading={loading}
            onDone={() => setShowPreloader(false)}
            deviceId={config.deviceId}
          />
        )}

        {stats && (
          <div className="space-y-5 animate-fade-in-up">
            {/* Section Header + Export Buttons */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50">
                  <BarChart3 className="h-4 w-4 text-indigo-600" />
                </div>
                Results Analysis
                <span className="ml-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold">
                  {filteredRows.length.toLocaleString()} rows
                </span>
              </h2>
              <div className="flex items-center gap-2" data-pdf-exclude="true">
                <button
                  onClick={async () => {
                    try {
                      const { exportToExcel } = await import("./export-utils");
                      if (!stats) return;
                      await exportToExcel({
                        rows: filteredExportRows,
                        stats,
                        woDetailsMap,
                        deviceNameMap,
                        reportConfig: config,
                      });
                    } catch (err: unknown) {
                      const message =
                        err instanceof Error
                          ? err.message
                          : "Excel export failed.";
                      setError(message);
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
                      const { exportToGroupedExcel } =
                        await import("./export-utils");
                      if (!stats) return;
                      await exportToGroupedExcel({
                        rows: exportRows,
                        stats,
                        woDetailsMap,
                        deviceNameMap,
                        reportConfig: config,
                      });
                    } catch (err: unknown) {
                      const message =
                        err instanceof Error
                          ? err.message
                          : "Grouped Excel export failed.";
                      setError(message);
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
                      });
                    } catch (err: unknown) {
                      const message =
                        err instanceof Error
                          ? err.message
                          : "PDF export failed.";
                      setError(message);
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

            {/* Panel A: KPI Cards */}
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

            {/* Panel B: Production Quality */}
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
                  className={`text-center p-3 rounded-xl border ${stats.totalRejectQty > 0 ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"}`}
                >
                  <div
                    className={`text-[10px] font-bold uppercase tracking-widest ${stats.totalRejectQty > 0 ? "text-rose-500" : "text-slate-400"}`}
                  >
                    Rejects
                  </div>
                  <div
                    className={`text-2xl font-bold mt-1 tabular-nums ${stats.totalRejectQty > 0 ? "text-rose-700" : "text-slate-500"}`}
                  >
                    {stats.totalRejectQty}
                  </div>
                </div>
              </div>
            </div>

            {/* Panel C: WO Breakdown Table */}
            {stats.woBreakdowns.length > 0 && (
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
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap text-left"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.woBreakdowns.map((wo, i) => (
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
            )}

            {/* Panel D: Operator Summary */}
            {stats.operatorSummaries.length > 0 && (
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
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap text-left"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.operatorSummaries.map((op) => (
                        <tr
                          key={op.name}
                          className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/20 transition-colors"
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold flex-shrink-0">
                                {op.name
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((w) => w[0]?.toUpperCase() ?? "")
                                  .join("")}
                              </span>
                              <span className="font-semibold text-violet-700 text-[11px]">
                                {op.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-700 text-[11px] tabular-nums">
                            {op.woCount}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-700 text-[11px] tabular-nums">
                            {op.totalJobs}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-700 text-[11px] tabular-nums">
                            {op.totalCycles}
                          </td>
                          <td className="px-3 py-2 font-mono text-blue-600 text-[11px] tabular-nums">
                            {formatDuration(op.totalCuttingSec)}
                          </td>
                          <td className="px-3 py-2 font-mono text-amber-600 text-[11px] tabular-nums">
                            {formatDuration(op.totalPauseSec)}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500 text-[11px] tabular-nums">
                            {formatDuration(op.avgCycleSec)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Empty state: dot-matrix display (no data yet, not loading) ── */}
        {dashboardRows.length === 0 && !loading && !showPreloader && (
          <DotMatrixEmptyState />
        )}

        {/* Filter Bar + Report Table — only rendered when there is data */}
        {dashboardRows.length > 0 && (
          <>
            <ReportFilterBar
              filters={reportFilters}
              onChange={handleFilterChange}
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
              loading={loading}
              isFiltered={
                !!searchQuery ||
                reportFilters.actions.length > 0 ||
                reportFilters.jobTypes.length > 0 ||
                reportFilters.operators.length > 0 ||
                reportFilters.labels.length > 0 ||
                reportFilters.machines.length > 0
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

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
  const c = colorMap[color];
  return (
    <div className={`${c.bg} border ${c.border} p-3 rounded-xl`}>
      <div
        className={`flex items-center gap-1.5 text-xs font-medium ${c.label}`}
      >
        <span className={c.icon}>{icon}</span>
        {label}
      </div>
      <div className={`text-xl font-bold ${c.text} mt-1`}>{value}</div>
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
