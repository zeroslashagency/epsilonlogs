import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Clock, RefreshCcw, ShieldAlert, TrendingUp } from "lucide-react";
import { fetchAllWoDetails, fetchDeviceLogs } from "../report/api-client";
import { extractWoIds } from "../report/log-normalizer";
import {
    applyReportV2Filters,
    buildReportV2,
    DEFAULT_REPORT_V2_FILTER_STATE,
    ReportV2FilterState,
} from "../report/report-builder-v2";
import { ReportConfig, ReportRow } from "../report/report-types";
import { formatDuration } from "../report/format-utils";
import { usePersistedFilters } from "../report-v2/usePersistedFilters";

const TOKEN = import.meta.env.VITE_API_TOKEN;
const REFRESH_INTERVAL_MS = 30000;

const formatForApi = (value: Date): string => {
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const yyyy = value.getFullYear();
    const hh = String(value.getHours()).padStart(2, "0");
    const min = String(value.getMinutes()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
};

const modeLabel = (mode: ReportV2FilterState["mode"]): string => {
    if (mode === "GOOD_ONLY") return "Good Only";
    if (mode === "GOOD_WARNING") return "Good + Warning";
    return "All";
};

const makeTodayConfig = (deviceId: number): ReportConfig => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    return {
        deviceId,
        startDate: formatForApi(start),
        endDate: formatForApi(now),
        toleranceSec: 10,
    };
};

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
            {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
        </div>
    );
}

const badgeClass: Record<string, string> = {
    GOOD: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40",
    WARNING: "bg-amber-500/20 text-amber-200 ring-amber-500/40",
    BAD: "bg-rose-500/20 text-rose-200 ring-rose-500/40",
    UNKNOWN: "bg-slate-500/20 text-slate-200 ring-slate-500/40",
};

export default function ProductionHubV2() {
    const [deviceId, setDeviceId] = useState(15);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allRows, setAllRows] = useState<ReportRow[]>([]);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

    const [hubSummary, setHubSummary] = useState({
        totalLogs: 0,
        totalJobs: 0,
        totalCycles: 0,
        avgCycleSec: 0,
        goodCycles: 0,
        warningCycles: 0,
        badCycles: 0,
        unknownCycles: 0,
        goodRatePct: 0,
        unknownRatioPct: 0,
    });

    const [filterState, setFilterState] = usePersistedFilters();
    const filteredRows = useMemo(() => applyReportV2Filters(allRows, filterState), [allRows, filterState]);
    const latestCycles = useMemo(
        () => filteredRows.filter((row) => row.action === "SPINDLE_OFF").slice(0, 30),
        [filteredRows],
    );

    const fetchData = async () => {
        setLoading(true);
        setError(null);

        if (!TOKEN) {
            setError("Missing VITE_API_TOKEN. Set token to enable live hub data.");
            setAllRows([]);
            setLoading(false);
            return;
        }

        try {
            const config = makeTodayConfig(deviceId);
            const logs = await fetchDeviceLogs(config, TOKEN);
            if (logs.length === 0) {
                setAllRows([]);
                setHubSummary({
                    totalLogs: 0,
                    totalJobs: 0,
                    totalCycles: 0,
                    avgCycleSec: 0,
                    goodCycles: 0,
                    warningCycles: 0,
                    badCycles: 0,
                    unknownCycles: 0,
                    goodRatePct: 0,
                    unknownRatioPct: 0,
                });
                setLastRefreshed(new Date());
                return;
            }

            const woIds = extractWoIds(logs);
            const woDetailsMap = await fetchAllWoDetails(woIds, TOKEN);
            const report = buildReportV2(logs, woDetailsMap, config);

            setAllRows(report.filterableRows);
            setHubSummary({
                totalLogs: report.hubSummary.totalLogs,
                totalJobs: report.hubSummary.totalJobs,
                totalCycles: report.hubSummary.totalCycles,
                avgCycleSec: report.hubSummary.avgCycleSec,
                goodCycles: report.hubSummary.goodCycles,
                warningCycles: report.hubSummary.warningCycles,
                badCycles: report.hubSummary.badCycles,
                unknownCycles: report.hubSummary.unknownCycles,
                goodRatePct: report.hubSummary.goodRatePct,
                unknownRatioPct: report.hubSummary.unknownRatioPct,
            });
            setLastRefreshed(new Date());

            console.debug("[telemetry:v2:hub]", {
                ...report.telemetry,
                filterMode: filterState.mode,
                includeUnknown: filterState.includeUnknown,
                includeBreakExtensions: filterState.includeBreakExtensions,
                filteredRows: applyReportV2Filters(report.filterableRows, filterState).length,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to refresh Hub V2.";
            setError(message);
            setAllRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const id = window.setInterval(fetchData, REFRESH_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [deviceId]);

    const setMode = (mode: ReportV2FilterState["mode"]) => {
        setFilterState((previous) => ({ ...previous, mode }));
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#334155_0%,#0f172a_45%,#020617_100%)] px-4 py-6 md:px-8 md:py-8 text-slate-100">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 md:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Hub V2</p>
                            <h1 className="mt-1 text-2xl md:text-3xl font-semibold">Production Control Room</h1>
                            <p className="mt-2 text-sm text-slate-300">
                                Real-time classification KPIs using live cycle durations and PRD filters.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link to="/" className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800">
                                View Hub V1
                            </Link>
                            <Link to="/report-v2" className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20">
                                <ArrowLeftRight className="h-4 w-4" />
                                Open Report V2
                            </Link>
                            <button
                                onClick={fetchData}
                                disabled={loading}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-indigo-50 hover:bg-indigo-400 disabled:opacity-60"
                            >
                                <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                                Refresh
                            </button>
                        </div>
                    </div>
                </header>

                <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 space-y-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs uppercase tracking-wide text-slate-400">
                            Device ID
                            <input
                                type="number"
                                value={deviceId}
                                onChange={(event) => setDeviceId(Number.parseInt(event.target.value, 10) || 0)}
                                className="mt-1 block w-32 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
                            />
                        </label>

                        <div className="flex flex-wrap items-center gap-2">
                            {(["GOOD_ONLY", "GOOD_WARNING", "ALL"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setMode(mode)}
                                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                        filterState.mode === mode
                                            ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/50"
                                            : "bg-slate-800 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700"
                                    }`}
                                >
                                    {modeLabel(mode)}
                                </button>
                            ))}
                        </div>

                        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                            <input
                                type="checkbox"
                                checked={filterState.includeUnknown}
                                onChange={() =>
                                    setFilterState((previous) => ({
                                        ...previous,
                                        includeUnknown: !previous.includeUnknown,
                                    }))
                                }
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                            />
                            Include Unknown
                        </label>

                        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                            <input
                                type="checkbox"
                                checked={filterState.includeBreakExtensions}
                                onChange={() =>
                                    setFilterState((previous) => ({
                                        ...previous,
                                        includeBreakExtensions: !previous.includeBreakExtensions,
                                    }))
                                }
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                            />
                            Include Break / Extensions
                        </label>

                        <button
                            onClick={() => setFilterState(DEFAULT_REPORT_V2_FILTER_STATE)}
                            className="rounded-md border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
                        >
                            Reset Filters
                        </button>
                    </div>

                    {error ? (
                        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
                            <AlertTriangle className="mt-0.5 h-4 w-4" />
                            <span>{error}</span>
                        </div>
                    ) : null}

                    {lastRefreshed ? (
                        <p className="text-xs text-slate-400">Last refreshed: {lastRefreshed.toLocaleString("en-GB")}</p>
                    ) : null}
                </section>

                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <MetricCard label="Logs" value={String(hubSummary.totalLogs)} />
                    <MetricCard label="Jobs" value={String(hubSummary.totalJobs)} />
                    <MetricCard label="Cycles" value={String(hubSummary.totalCycles)} />
                    <MetricCard label="Good Rate" value={`${hubSummary.goodRatePct}%`} hint="good / total cycles" />
                    <MetricCard label="Unknown Ratio" value={`${hubSummary.unknownRatioPct}%`} hint="unknown / total cycles" />
                    <MetricCard label="Avg Cycle" value={formatDuration(hubSummary.avgCycleSec)} />
                </section>

                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard label="Good" value={String(hubSummary.goodCycles)} />
                    <MetricCard label="Warning" value={String(hubSummary.warningCycles)} />
                    <MetricCard label="Bad" value={String(hubSummary.badCycles)} />
                    <MetricCard label="Unknown" value={String(hubSummary.unknownCycles)} />
                </section>

                <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 md:p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Latest Cycles</h2>
                        <p className="text-xs text-slate-400">Filtered rows: {filteredRows.length}</p>
                    </div>

                    {latestCycles.length === 0 ? (
                        <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-6 text-center text-sm text-slate-400">
                            No cycle rows available for current filter.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[880px] text-xs text-slate-200">
                                <thead>
                                    <tr className="border-b border-slate-700 text-left text-slate-400 uppercase tracking-wide">
                                        <th className="px-3 py-2 font-semibold">Time</th>
                                        <th className="px-3 py-2 font-semibold">WO</th>
                                        <th className="px-3 py-2 font-semibold">Duration</th>
                                        <th className="px-3 py-2 font-semibold">Class</th>
                                        <th className="px-3 py-2 font-semibold">Reason</th>
                                        <th className="px-3 py-2 font-semibold">Operator</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {latestCycles.map((row) => {
                                        const classification = row.classification || "UNKNOWN";
                                        return (
                                            <tr key={row.rowId} className="border-b border-slate-800/80 hover:bg-slate-900/70">
                                                <td className="px-3 py-2 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                                                    {row.logTime.toLocaleString("en-GB")}
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    {row.woSpecs?.woId || row.originalLog?.wo_id || "-"}
                                                </td>
                                                <td className="px-3 py-2 font-mono whitespace-nowrap">{row.durationText || "-"}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${badgeClass[classification] || badgeClass.UNKNOWN}`}>
                                                        {classification}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-slate-300">{row.reasonText || "-"}</td>
                                                <td className="px-3 py-2 whitespace-nowrap text-slate-300">{row.operatorName || "-"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <footer className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-400">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mode: {modeLabel(filterState.mode)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Unknown toggle: {filterState.includeUnknown ? "ON" : "OFF"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Break toggle: {filterState.includeBreakExtensions ? "ON" : "OFF"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <TrendingUp className="h-3.5 w-3.5" />
                            Filtered cycle sec: {formatDuration(latestCycles.reduce((sum, row) => sum + (row.durationSec || 0), 0))}
                        </span>
                    </div>
                </footer>
            </div>
        </div>
    );
}
