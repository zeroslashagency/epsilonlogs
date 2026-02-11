import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowLeft, RefreshCcw, Filter, AlertTriangle, Activity, Zap, CheckCircle2, Clock } from "lucide-react";
import { DateRangePicker } from "../components/ui/DateRangePicker";
import { fetchAllWoDetails, fetchDeviceLogs } from "../report/api-client";
import { extractWoIds } from "../report/log-normalizer";
import { formatDuration } from "../report/format-utils";
import {
    applyReportV2Filters,
    buildReportV2,
    DEFAULT_REPORT_V2_FILTER_STATE,
    ReportV2FilterState,
} from "../report/report-builder-v2";
import { ReportConfig, ReportRow, ReportStats } from "../report/report-types";
import { ReportTableV2 } from "./ReportTableV2";
import { usePersistedFilters } from "./usePersistedFilters";

const TOKEN = import.meta.env.VITE_API_TOKEN;

const formatForApi = (value: Date): string => {
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const yyyy = value.getFullYear();
    const hh = String(value.getHours()).padStart(2, "0");
    const min = String(value.getMinutes()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
};

const buildInitialConfig = (): ReportConfig => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    return {
        deviceId: 15,
        startDate: formatForApi(start),
        endDate: formatForApi(now),
        toleranceSec: 10,
    };
};

const getModeLabel = (mode: ReportV2FilterState["mode"]): string => {
    if (mode === "GOOD_ONLY") return "Good Only";
    if (mode === "GOOD_WARNING") return "Good + Warning";
    return "All";
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
            {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
        </div>
    );
}

export default function ReportPageV2() {
    const [config, setConfig] = useState<ReportConfig>(buildInitialConfig);
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filterState, setFilterState] = usePersistedFilters();

    const [summary, setSummary] = useState({
        totalCycles: 0,
        goodCycles: 0,
        warningCycles: 0,
        badCycles: 0,
        unknownCycles: 0,
        goodRatePct: 0,
        unknownRatioPct: 0,
    });

    const filteredRows = useMemo(() => applyReportV2Filters(rows, filterState), [rows, filterState]);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);

        if (!TOKEN) {
            setRows([]);
            setStats(null);
            setSummary({
                totalCycles: 0,
                goodCycles: 0,
                warningCycles: 0,
                badCycles: 0,
                unknownCycles: 0,
                goodRatePct: 0,
                unknownRatioPct: 0,
            });
            setError("Missing VITE_API_TOKEN. Add token to run report queries.");
            setLoading(false);
            return;
        }

        try {
            const logs = await fetchDeviceLogs(config, TOKEN);
            if (logs.length === 0) {
                setRows([]);
                setStats(null);
                setSummary({
                    totalCycles: 0,
                    goodCycles: 0,
                    warningCycles: 0,
                    badCycles: 0,
                    unknownCycles: 0,
                    goodRatePct: 0,
                    unknownRatioPct: 0,
                });
                setError("No logs found for selected range.");
                return;
            }

            const woIds = extractWoIds(logs);
            const woDetailsMap = await fetchAllWoDetails(woIds, TOKEN);
            const report = buildReportV2(logs, woDetailsMap, config);

            setRows(report.filterableRows);
            setStats(report.stats);
            setSummary({
                totalCycles: report.hubSummary.totalCycles,
                goodCycles: report.hubSummary.goodCycles,
                warningCycles: report.hubSummary.warningCycles,
                badCycles: report.hubSummary.badCycles,
                unknownCycles: report.hubSummary.unknownCycles,
                goodRatePct: report.hubSummary.goodRatePct,
                unknownRatioPct: report.hubSummary.unknownRatioPct,
            });

            console.debug("[telemetry:v2:report]", {
                ...report.telemetry,
                filterMode: filterState.mode,
                includeUnknown: filterState.includeUnknown,
                includeBreakExtensions: filterState.includeBreakExtensions,
                filteredRows: applyReportV2Filters(report.filterableRows, filterState).length,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to generate V2 report.";
            setRows([]);
            setStats(null);
            setSummary({
                totalCycles: 0,
                goodCycles: 0,
                warningCycles: 0,
                badCycles: 0,
                unknownCycles: 0,
                goodRatePct: 0,
                unknownRatioPct: 0,
            });
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const setMode = (mode: ReportV2FilterState["mode"]) => {
        setFilterState((previous) => ({ ...previous, mode }));
    };

    const toggleUnknown = () => {
        setFilterState((previous) => ({
            ...previous,
            includeUnknown: !previous.includeUnknown,
        }));
    };

    const toggleBreaks = () => {
        setFilterState((previous) => ({
            ...previous,
            includeBreakExtensions: !previous.includeBreakExtensions,
        }));
    };

    const resetFilters = () => {
        setFilterState(DEFAULT_REPORT_V2_FILTER_STATE);
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1f2937_0%,#0f172a_45%,#020617_100%)] px-4 py-6 md:px-8 md:py-8 text-slate-100">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 md:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">V2 Report</p>
                            <h1 className="mt-1 text-2xl md:text-3xl font-semibold">Industrial Cycle Classification</h1>
                            <p className="mt-2 text-sm text-slate-300">
                                Correctness-first timeline with PRD-aligned filters and adaptive density.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link to="/report" className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800">
                                <ArrowLeft className="h-4 w-4" />
                                View V1 Report
                            </Link>
                            <Link to="/hub-v2" className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20">
                                <ArrowLeftRight className="h-4 w-4" />
                                Open Hub V2
                            </Link>
                        </div>
                    </div>
                </header>

                <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 md:p-5 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-[180px_1fr_180px] lg:items-end">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Device ID</label>
                            <input
                                type="number"
                                value={config.deviceId}
                                onChange={(event) =>
                                    setConfig((previous) => ({
                                        ...previous,
                                        deviceId: Number.parseInt(event.target.value, 10) || 0,
                                    }))
                                }
                                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
                            />
                        </div>

                        <DateRangePicker
                            startDate={config.startDate}
                            endDate={config.endDate}
                            variant="dark"
                            onChangeStruct={(start, end) =>
                                setConfig((previous) => ({ ...previous, startDate: start, endDate: end }))
                            }
                        />

                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-indigo-50 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            Generate
                        </button>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3 md:p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Filter className="h-4 w-4 text-slate-400" />
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
                                    {getModeLabel(mode)}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={filterState.includeUnknown}
                                    onChange={toggleUnknown}
                                    className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                                />
                                Include Unknown
                            </label>
                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={filterState.includeBreakExtensions}
                                    onChange={toggleBreaks}
                                    className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                                />
                                Include Break / Extensions
                            </label>
                            <button
                                onClick={resetFilters}
                                className="rounded-md border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
                            >
                                Reset Filters
                            </button>
                        </div>
                    </div>

                    {error ? (
                        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
                            <AlertTriangle className="mt-0.5 h-4 w-4" />
                            <span>{error}</span>
                        </div>
                    ) : null}
                </section>

                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Kpi label="Total Cycles" value={String(summary.totalCycles)} hint="Classifiable spindle-off rows" />
                    <Kpi label="Good" value={String(summary.goodCycles)} hint={`${summary.goodRatePct}% good rate`} />
                    <Kpi label="Warning" value={String(summary.warningCycles)} />
                    <Kpi label="Bad" value={String(summary.badCycles)} />
                    <Kpi label="Unknown" value={String(summary.unknownCycles)} hint={`${summary.unknownRatioPct}% unknown`} />
                </section>

                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Kpi label="Jobs" value={String(stats?.totalJobs || 0)} />
                    <Kpi label="Cutting Time" value={formatDuration(stats?.totalCuttingSec || 0)} />
                    <Kpi label="Pause Time" value={formatDuration(stats?.totalPauseSec || 0)} />
                    <Kpi label="Loading Time" value={formatDuration(stats?.totalLoadingUnloadingSec || 0)} />
                </section>

                <ReportTableV2 rows={filteredRows} loading={loading} />

                <footer className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-400">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                            <Activity className="h-3.5 w-3.5" />
                            Filtered rows: {filteredRows.length}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5" />
                            Filter mode: {getModeLabel(filterState.mode)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Unknown: {filterState.includeUnknown ? "ON" : "OFF"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Breaks: {filterState.includeBreakExtensions ? "ON" : "OFF"}
                        </span>
                    </div>
                </footer>
            </div>
        </div>
    );
}
