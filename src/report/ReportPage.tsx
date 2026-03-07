import React, { useRef, useState, useMemo } from "react";
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
  Search,
  X,
  Clock,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Monitor,
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

  // Filter rows based on search query
  const filteredRows = React.useMemo(() => {
    if (!searchQuery.trim()) return rows;
    return rows.filter((row) => matchRow(row, searchQuery));
  }, [rows, searchQuery]);

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
    <div className="min-h-screen bg-slate-50/50 p-6 space-y-6">
      <header className="flex items-center justify-between pb-4 border-b bg-white p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-6 w-6 text-indigo-600" />
              Device Logs Report
            </h1>
            <p className="text-sm text-slate-500">
              Generate Job Block analysis from raw device logs
            </p>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-5 space-y-4">
          {/* Row 1 — Device ID + Date Range */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-36 shrink-0">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Device ID
              </label>
              <input
                type="number"
                value={config.deviceId}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    deviceId: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none text-sm text-slate-800 font-medium"
              />
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
              className={`rounded-lg border px-4 py-2.5 text-sm transition-all ${
                selectionSummary.isInvalid
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
                    Machine&nbsp;#{config.deviceId}
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

          {/* Row 3 — Checklist + Search + Generate */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Checklist */}
            <div className="flex items-center gap-4">
              <CheckItem done={config.deviceId > 0} label="Device set" />
              <CheckItem done={!!config.startDate} label="Start date" />
              <CheckItem done={!!config.endDate} label="End date" />
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Search */}
            <div className="relative w-52">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search results…"
                className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Generate button with ready-pulse ring */}
            <div className="relative">
              {allReady && !loading && (
                <span className="absolute inset-0 rounded-lg ring-2 ring-indigo-400 ring-offset-1 animate-pulse pointer-events-none" />
              )}
              <button
                onClick={handleGenerate}
                disabled={
                  loading ||
                  !config.startDate ||
                  !config.endDate ||
                  selectionSummary?.isInvalid === true
                }
                className="relative flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="h-4 w-4" />
                Generate Report
              </button>
            </div>
          </div>
        </div>

        {/* Error bar */}
        {error && (
          <div className="px-5 py-3 bg-red-50 border-t border-red-100 text-red-600 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
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
          <div className="space-y-5">
            {/* Section Header + Export Buttons */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                Results Analysis
              </h2>
              <div className="flex items-center gap-3" data-pdf-exclude="true">
                <button
                  onClick={async () => {
                    try {
                      const { exportToExcel } = await import("./export-utils");
                      if (!stats) return;
                      await exportToExcel({
                        rows: filteredRows,
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
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
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
                        rows: filteredRows,
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
                  className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
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
                  className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium"
                >
                  <Download className="h-4 w-4" />
                  Export PDF
                </button>
              </div>
            </div>

            {/* Panel A: KPI Cards — Row 1 */}
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
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-slate-500" />
                Production Quality
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-xs text-blue-500 font-medium uppercase tracking-wide">
                    Allotted Qty
                  </div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">
                    {stats.totalAllotedQty}
                  </div>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="text-xs text-emerald-500 font-medium uppercase tracking-wide">
                    OK Qty
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">
                    {stats.totalOkQty}
                  </div>
                </div>
                <div
                  className={`text-center p-3 rounded-lg border ${stats.totalRejectQty > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}
                >
                  <div
                    className={`text-xs font-medium uppercase tracking-wide ${stats.totalRejectQty > 0 ? "text-red-500" : "text-slate-500"}`}
                  >
                    Reject Qty
                  </div>
                  <div
                    className={`text-2xl font-bold mt-1 ${stats.totalRejectQty > 0 ? "text-red-700" : "text-slate-700"}`}
                  >
                    {stats.totalRejectQty}
                  </div>
                </div>
              </div>
            </div>

            {/* Panel C: WO Breakdown Table */}
            {stats.woBreakdowns.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-500" />
                    Work Order Breakdown
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600">
                        <th className="px-3 py-2 text-left font-semibold">
                          WO ID
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          Part No
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          Operator
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          Job Type
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          Jobs
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          Cycles
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Cutting
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Pause
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Loading
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          PCL
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Avg Cycle
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          Allot
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          OK
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          Reject
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.woBreakdowns.map((wo, i) => (
                        <tr
                          key={wo.woId}
                          className={
                            i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                          }
                        >
                          <td className="px-3 py-2 font-semibold text-indigo-700">
                            {wo.woId}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {wo.partNo || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {wo.operator}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {wo.jobType || "—"}
                          </td>
                          <td className="px-3 py-2 text-center font-medium text-slate-800">
                            {wo.jobs}
                          </td>
                          <td className="px-3 py-2 text-center font-medium text-slate-800">
                            {wo.cycles}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-blue-700">
                            {formatDuration(wo.cuttingSec)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-amber-700">
                            {formatDuration(wo.pauseSec)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600">
                            {formatDuration(wo.loadingSec)}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-600">
                            {wo.pcl ? formatDuration(wo.pcl) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600">
                            {formatDuration(wo.avgCycleSec)}
                          </td>
                          <td className="px-3 py-2 text-center text-blue-700 font-medium">
                            {wo.allotedQty}
                          </td>
                          <td className="px-3 py-2 text-center text-emerald-700 font-medium">
                            {wo.okQty}
                          </td>
                          <td
                            className={`px-3 py-2 text-center font-medium ${wo.rejectQty > 0 ? "text-red-600 font-bold" : "text-slate-400"}`}
                          >
                            {wo.rejectQty}
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
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Users className="h-4 w-4 text-violet-500" />
                    Operator Summary
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600">
                        <th className="px-3 py-2 text-left font-semibold">
                          Operator
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          WOs Handled
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          Jobs
                        </th>
                        <th className="px-3 py-2 text-center font-semibold">
                          Cycles
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Cutting Time
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Pause Time
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Avg Cycle
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.operatorSummaries.map((op, i) => (
                        <tr
                          key={op.name}
                          className={
                            i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                          }
                        >
                          <td className="px-3 py-2 font-semibold text-violet-700">
                            {op.name}
                          </td>
                          <td className="px-3 py-2 text-center font-medium text-slate-800">
                            {op.woCount}
                          </td>
                          <td className="px-3 py-2 text-center font-medium text-slate-800">
                            {op.totalJobs}
                          </td>
                          <td className="px-3 py-2 text-center font-medium text-slate-800">
                            {op.totalCycles}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-blue-700">
                            {formatDuration(op.totalCuttingSec)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-amber-700">
                            {formatDuration(op.totalPauseSec)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600">
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
        {rows.length === 0 && !loading && !showPreloader && (
          <DotMatrixEmptyState />
        )}

        {/* Report Table — only rendered when there is data */}
        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-end mb-2 text-xs text-slate-500">
              {searchQuery && (
                <span>
                  Showing {filteredRows.length} of {rows.length} rows
                </span>
              )}
            </div>
            <ReportTable
              rows={filteredRows}
              loading={loading}
              isFiltered={!!searchQuery}
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
