import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Download,
  Loader2,
} from "lucide-react";
import { fetchDeviceLogs } from "../report/api-client";
import { formatDuration } from "../report/format-utils";
import {
  EMPTY_FILTERS,
  ReportFilterBar,
  applyFilters,
  extractFilterOptions,
  isFiltersEmpty,
  type ReportFilters,
} from "../report/ReportFilterBar";
import { buildReport } from "../report/report-builder";
import { buildWebLogRows } from "../report/raw-log-rows";
import { ReportTable } from "../report/ReportTable";
import { matchRow } from "../report/search-utils";
import type {
  ReportConfig,
  ReportRow,
  ReportStats,
  WoDetails,
} from "../report/report-types";
import {
  buildWoFetchConfig,
  buildWoFilename,
  collectUniqueOriginalLogs,
} from "./wo-report-utils";
import { WoTimelineChart } from "./WoTimelineChart";

interface WoReportPanelProps {
  token?: string;
  woId: string;
  woDisplayId: string;
  machineId: number | null;
  operatorName: string;
  jobType: ReportRow["jobType"];
  executionStatus: string;
  executionStatusClassName: string;
  jobTypeClassName: string;
  fallbackRows: ReportRow[];
  woDetails: WoDetails | null;
  deviceNameMap: Map<number, string>;
  onBack: () => void;
}

function MetricCard({
  label,
  value,
  accentClassName,
}: {
  label: string;
  value: string;
  accentClassName: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold ${accentClassName}`}>{value}</p>
    </div>
  );
}

export function WoReportPanel({
  token,
  woId,
  woDisplayId,
  machineId,
  operatorName,
  jobType,
  executionStatus,
  executionStatusClassName,
  jobTypeClassName,
  fallbackRows,
  woDetails,
  deviceNameMap,
  onBack,
}: WoReportPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [groupedRows, setGroupedRows] = useState<ReportRow[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [reportConfig, setReportConfig] = useState<ReportConfig | null>(null);
  const [activeExport, setActiveExport] = useState<
    "excel" | "grouped" | "pdf" | null
  >(null);
  const reportExportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearchQuery("");
    setFilters(EMPTY_FILTERS);
  }, [woId]);

  useEffect(() => {
    const abortController = new AbortController();
    const scopedFallbackLogs = collectUniqueOriginalLogs(fallbackRows).filter(
      (log) => String(log.wo_id) === woId,
    );

    async function loadWoReport() {
      setLoading(true);
      setError(null);
      setReportRows([]);
      setGroupedRows([]);
      setStats(null);

      const fetchConfig = buildWoFetchConfig({
        woDetails,
        fallbackLogs: scopedFallbackLogs,
        fallbackDeviceId: machineId,
      });

      let scopedLogs = scopedFallbackLogs;
      let nextError: string | null = null;

      if (token && fetchConfig) {
        try {
          const fetchedLogs = await fetchDeviceLogs(
            fetchConfig,
            token,
            abortController.signal,
          );
          const fetchedWoLogs = fetchedLogs.filter(
            (log) => String(log.wo_id) === woId,
          );

          if (fetchedWoLogs.length > 0) {
            scopedLogs = fetchedWoLogs;
          } else if (scopedFallbackLogs.length > 0) {
            nextError =
              "WO refresh returned no scoped logs. Using dashboard snapshot.";
          }
        } catch (err: unknown) {
          if (abortController.signal.aborted) {
            return;
          }

          if (scopedFallbackLogs.length === 0) {
            throw err;
          }

          nextError =
            err instanceof Error
              ? `WO refresh failed. Using dashboard snapshot. ${err.message}`
              : "WO refresh failed. Using dashboard snapshot.";
        }
      }

      if (scopedLogs.length === 0) {
        setError("No logs available for this work order.");
        setLoading(false);
        return;
      }

      const effectiveConfig =
        fetchConfig ??
        buildWoFetchConfig({
          woDetails,
          fallbackLogs: scopedLogs,
          fallbackDeviceId: machineId,
        });

      if (!effectiveConfig) {
        setError("Unable to resolve a valid time window for this work order.");
        setLoading(false);
        return;
      }

      const woDetailsMap = new Map<number, WoDetails>();
      const woIdNumber = Number(woId);
      if (Number.isFinite(woIdNumber) && woDetails) {
        woDetailsMap.set(woIdNumber, woDetails);
      }

      const report = buildReport(scopedLogs, woDetailsMap, effectiveConfig);
      if (abortController.signal.aborted) {
        return;
      }

      setReportConfig(effectiveConfig);
      setReportRows(buildWebLogRows(scopedLogs, report.rows, woDetailsMap));
      setGroupedRows(report.rows);
      setStats(report.stats);
      setError(nextError);
      setLoading(false);
    }

    loadWoReport().catch((err: unknown) => {
      if (abortController.signal.aborted) {
        return;
      }

      setLoading(false);
      setError(
        err instanceof Error ? err.message : "Failed to load work order report.",
      );
    });

    return () => abortController.abort();
  }, [fallbackRows, machineId, token, woDetails, woId]);

  const woDetailsMap = useMemo(() => {
    const next = new Map<number, WoDetails>();
    const woIdNumber = Number(woId);
    if (Number.isFinite(woIdNumber) && woDetails) {
      next.set(woIdNumber, woDetails);
    }
    return next;
  }, [woDetails, woId]);

  const dashboardRows = useMemo(
    () => reportRows.filter((row) => !row.excludeFromDashboard),
    [reportRows],
  );

  const exportRows = useMemo(
    () => reportRows.filter((row) => !row.excludeFromExport),
    [reportRows],
  );

  const groupedExportRows = useMemo(
    () => groupedRows.filter((row) => !row.excludeFromExport),
    [groupedRows],
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
    return applyFilters(nextRows, filters);
  }, [dashboardRows, filters, searchQuery]);

  const filteredExportRows = useMemo(() => {
    let nextRows = exportRows;
    if (searchQuery.trim()) {
      nextRows = nextRows.filter((row) => matchRow(row, searchQuery));
    }
    return applyFilters(nextRows, filters);
  }, [exportRows, filters, searchQuery]);

  const isFiltered = !isFiltersEmpty(filters) || searchQuery.trim().length > 0;
  const machineLabel =
    machineId != null
      ? deviceNameMap.get(machineId) || `Machine ${machineId}`
      : "Machine -";
  const exportDisabled = loading || !stats || groupedRows.length === 0;

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4">
      <div
        ref={reportExportRef}
        className="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-800">
                WO Report Workspace
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                Stage 3
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Full order view with the same export engine used in the report page.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 font-semibold ring-1 ${jobTypeClassName}`}
            >
              {jobType}
            </span>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 font-semibold ring-1 ${executionStatusClassName}`}
            >
              {executionStatus}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-slate-800">{`WO-${woDisplayId}`}</p>
              <p className="mt-1 text-sm text-slate-600">{`${machineLabel} · ${operatorName}`}</p>
            </div>
            <div className="text-xs text-slate-500">
              <p>Scope window</p>
              <p className="mt-1 font-medium text-slate-700">
                {reportConfig
                  ? `${reportConfig.startDate} - ${reportConfig.endDate}`
                  : "Resolving window..."}
              </p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[260px] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing selected WO report...
            </div>
          </div>
        ) : stats ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Total Logs"
                value={String(stats.totalLogs)}
                accentClassName="text-slate-800"
              />
              <MetricCard
                label="Total Cycles"
                value={String(stats.totalCycles)}
                accentClassName="text-indigo-700"
              />
              <MetricCard
                label="Cutting Time"
                value={formatDuration(stats.totalCuttingSec)}
                accentClassName="text-sky-700"
              />
              <MetricCard
                label="Pause Time"
                value={formatDuration(stats.totalPauseSec)}
                accentClassName="text-amber-700"
              />
              <MetricCard
                label="Output"
                value={`${stats.totalOkQty}/${stats.totalAllotedQty}`}
                accentClassName="text-emerald-700"
              />
            </div>

            <WoTimelineChart
              woDisplayId={woDisplayId}
              woDetails={woDetails}
              rows={reportRows}
            />

            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              data-pdf-exclude="true"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Export This Work Order
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Download this selected order without leaving the dashboard.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={exportDisabled || activeExport !== null}
                  onClick={async () => {
                    if (!stats) {
                      return;
                    }

                    try {
                      setActiveExport("excel");
                      const { exportToExcel } = await import(
                        "../report/export-utils"
                      );
                      await exportToExcel({
                        rows: filteredExportRows,
                        stats,
                        woDetailsMap,
                        deviceNameMap,
                        filename: buildWoFilename(woDisplayId, "xlsx"),
                        analysisTitle: `WO ${woDisplayId} Analysis`,
                        ...(reportConfig
                          ? { reportConfig }
                          : {}),
                      });
                    } catch (err: unknown) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Excel export failed.",
                      );
                    } finally {
                      setActiveExport(null);
                    }
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {activeExport === "excel" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export Excel
                </button>

                <button
                  type="button"
                  disabled={exportDisabled || activeExport !== null}
                  onClick={async () => {
                    if (!stats) {
                      return;
                    }

                    try {
                      setActiveExport("grouped");
                      const { exportToGroupedExcel } = await import(
                        "../report/export-utils"
                      );
                      await exportToGroupedExcel({
                        rows: groupedExportRows,
                        stats,
                        woDetailsMap,
                        deviceNameMap,
                        filename: buildWoFilename(woDisplayId, "xlsx", {
                          grouped: true,
                        }),
                        analysisTitle: `WO ${woDisplayId} Analysis`,
                        ...(reportConfig
                          ? { reportConfig }
                          : {}),
                      });
                    } catch (err: unknown) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Grouped Excel export failed.",
                      );
                    } finally {
                      setActiveExport(null);
                    }
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {activeExport === "grouped" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export Excel Grouped
                </button>

                <button
                  type="button"
                  disabled={exportDisabled || activeExport !== null}
                  onClick={async () => {
                    if (!reportExportRef.current) {
                      setError("Work order report is not ready for PDF export.");
                      return;
                    }

                    try {
                      setActiveExport("pdf");
                      const { exportToPDF } = await import(
                        "../report/export-utils"
                      );
                      await exportToPDF({
                        sourceElement: reportExportRef.current,
                        filename: buildWoFilename(woDisplayId, "pdf"),
                      });
                    } catch (err: unknown) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "PDF export failed.",
                      );
                    } finally {
                      setActiveExport(null);
                    }
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {activeExport === "pdf" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export PDF
                </button>
              </div>
            </div>

            <ReportFilterBar
              filters={filters}
              onChange={setFilters}
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

            <div className="min-h-0 flex-1">
              {filteredRows.length === 0 && !isFiltered ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 text-sm text-slate-500">
                  This work order does not have dashboard-visible rows yet.
                </div>
              ) : (
                <ReportTable
                  rows={filteredRows}
                  loading={loading}
                  isFiltered={isFiltered}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-[260px] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 text-sm text-slate-500">
            Unable to build a report for this work order.
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" data-pdf-exclude="true">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back To Overview
        </button>

        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          <BarChart3 className="h-3.5 w-3.5" />
          {`Showing ${filteredRows.length} visible logs for WO-${woDisplayId}`}
        </div>
      </div>
    </div>
  );
}
