import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    Activity,
    BarChart3,
    Bell,
    Calendar,
    Clock3,
    Cpu,
    Download,
    Factory,
    Gauge,
    LayoutDashboard,
    RefreshCcw,
    Search,
    Settings,
    ShieldAlert,
    Smartphone,
    User,
    Users,
    Wrench,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { fetchAllWoDetails, fetchDeviceLogs, fetchDeviceNameMap, formatDateForApi } from "../report/api-client";
import { extractWoIds } from "../report/log-normalizer";
import {
    applyReportV2Filters,
    buildReportV2,
    DEFAULT_REPORT_V2_FILTER_STATE,
    ReportV2FilterState,
} from "../report/report-builder-v2";
import { DeviceLogEntry, ReportConfig, ReportRow, ReportStats } from "../report/report-types";
import { formatDuration } from "../report/format-utils";
import { usePersistedFilters } from "../report-v2/usePersistedFilters";

const TOKEN = import.meta.env.VITE_API_TOKEN;
const REFRESH_INTERVAL_MS = 30000;
const MACHINE_IDS = [15, 16, 17, 18] as const;

type RangePreset = "TODAY" | "LAST_6H" | "LAST_24H";
type ShiftPreset = "ALL" | "A" | "B" | "C";
type MachineScope = "ALL" | number;

type MachineStatus = "Running" | "Stopped" | "Idle";

interface MachineSnapshot {
    deviceId: number;
    deviceName: string;
    status: MachineStatus;
    activeWo: string;
    latestEvent: string;
    latestEventTime: string;
}

interface KpiCard {
    id: string;
    label: string;
    value: string;
    hint?: string;
    tone: "blue" | "green" | "amber" | "violet" | "slate";
    icon: LucideIcon;
}

const toneClasses: Record<KpiCard["tone"], string> = {
    blue: "text-sky-300 border-sky-500/25",
    green: "text-emerald-300 border-emerald-500/25",
    amber: "text-amber-300 border-amber-500/25",
    violet: "text-violet-300 border-violet-500/25",
    slate: "text-slate-300 border-slate-500/25",
};

const classificationBadgeClass: Record<string, string> = {
    GOOD: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40",
    WARNING: "bg-amber-500/20 text-amber-200 ring-amber-500/40",
    BAD: "bg-rose-500/20 text-rose-200 ring-rose-500/40",
    UNKNOWN: "bg-slate-500/20 text-slate-200 ring-slate-500/40",
};

const statusToneClass: Record<MachineStatus, string> = {
    Running: "bg-emerald-500/20 text-emerald-200",
    Stopped: "bg-slate-500/20 text-slate-200",
    Idle: "bg-amber-500/20 text-amber-200",
};

function getWindowStart(rangePreset: RangePreset, now: Date): Date {
    const start = new Date(now);

    if (rangePreset === "TODAY") {
        start.setHours(0, 0, 0, 0);
        return start;
    }

    if (rangePreset === "LAST_6H") {
        start.setHours(start.getHours() - 6);
        return start;
    }

    start.setHours(start.getHours() - 24);
    return start;
}

function belongsToShift(dateValue: Date, shiftPreset: ShiftPreset): boolean {
    if (shiftPreset === "ALL") {
        return true;
    }

    const hour = dateValue.getHours();
    if (shiftPreset === "A") {
        return hour >= 6 && hour < 14;
    }

    if (shiftPreset === "B") {
        return hour >= 14 && hour < 22;
    }

    return hour >= 22 || hour < 6;
}

function resolveMachineStatus(action: string | null): MachineStatus {
    if (!action) return "Idle";

    if (action === "SPINDLE_ON" || action === "WO_START" || action === "WO_RESUME") {
        return "Running";
    }

    if (action === "SPINDLE_OFF" || action === "WO_STOP") {
        return "Stopped";
    }

    return "Idle";
}

function compactTime(value: Date | null): string {
    if (!value) return "--:--";
    return value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function modeLabel(mode: ReportV2FilterState["mode"]): string {
    if (mode === "GOOD_ONLY") return "Good Only";
    if (mode === "GOOD_WARNING") return "Good + Warning";
    return "All";
}

function buildMachineSnapshot(
    deviceId: number,
    logs: DeviceLogEntry[],
    deviceNameMap: Map<number, string>,
): MachineSnapshot {
    const sorted = [...logs].sort((left, right) => new Date(right.log_time).getTime() - new Date(left.log_time).getTime());
    const latest = sorted[0];
    const latestDate = latest ? new Date(latest.log_time) : null;

    return {
        deviceId,
        deviceName: deviceNameMap.get(deviceId) || `VMC ${MACHINE_IDS.indexOf(deviceId as (typeof MACHINE_IDS)[number]) + 1}`,
        status: resolveMachineStatus(latest?.action || null),
        activeWo: latest?.wo_id ? `WO-${latest.wo_id}` : "Idle",
        latestEvent: latest?.action || "NO_EVENT",
        latestEventTime: compactTime(latestDate),
    };
}

function RailNav() {
    const icons = [LayoutDashboard, Calendar, BarChart3, Clock3, Users, Bell, Smartphone, Activity, ShieldAlert, Settings];

    return (
        <aside className="hidden md:flex md:w-16 flex-col items-center border-r border-slate-800 bg-[#030611] py-5">
            <div className="mb-6 rounded-xl bg-blue-500/20 p-2 text-blue-300 ring-1 ring-blue-500/40">
                <Factory className="h-5 w-5" />
            </div>
            <nav className="flex flex-1 flex-col items-center gap-3">
                {icons.map((Icon, index) => (
                    <button
                        key={index}
                        className="rounded-lg p-2.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                        type="button"
                        aria-label={`nav-${index}`}
                    >
                        <Icon className="h-4 w-4" />
                    </button>
                ))}
            </nav>
            <button
                type="button"
                className="rounded-lg p-2.5 text-rose-300 transition hover:bg-rose-500/20"
                aria-label="logout"
            >
                <Activity className="h-4 w-4" />
            </button>
        </aside>
    );
}

function KpiCardItem({ card }: { card: KpiCard }) {
    const Icon = card.icon;
    return (
        <article className="rounded-xl border border-slate-700 bg-slate-900/75 p-4">
            <div className="mb-3 flex items-start justify-between">
                <div className={`rounded-lg border p-2 ${toneClasses[card.tone]}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs text-slate-400">Live</span>
            </div>
            <p className="text-3xl font-semibold text-slate-100">{card.value}</p>
            <p className="mt-1 text-sm text-slate-400">{card.label}</p>
            {card.hint ? <p className="mt-2 text-xs text-slate-500">{card.hint}</p> : null}
        </article>
    );
}

export default function ProductionHubV2() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

    const [rangePreset, setRangePreset] = useState<RangePreset>("TODAY");
    const [shiftPreset, setShiftPreset] = useState<ShiftPreset>("ALL");
    const [machineScope, setMachineScope] = useState<MachineScope>("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    const [allRows, setAllRows] = useState<ReportRow[]>([]);
    const [reportStats, setReportStats] = useState<ReportStats | null>(null);
    const [machineSnapshots, setMachineSnapshots] = useState<MachineSnapshot[]>([]);

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
    });

    const [filterState, setFilterState] = usePersistedFilters();

    const filteredRows = useMemo(() => {
        const reportFiltered = applyReportV2Filters(allRows, filterState);
        const query = searchQuery.trim().toLowerCase();

        if (!query) {
            return reportFiltered;
        }

        return reportFiltered.filter((row) => {
            const wo = String(row.woSpecs?.woId || row.originalLog?.wo_id || "").toLowerCase();
            const operator = (row.operatorName || "").toLowerCase();
            const action = (row.action || "").toLowerCase();
            const reason = (row.reasonText || "").toLowerCase();
            return wo.includes(query) || operator.includes(query) || action.includes(query) || reason.includes(query);
        });
    }, [allRows, filterState, searchQuery]);

    const latestCycles = useMemo(
        () => filteredRows.filter((row) => row.action === "SPINDLE_OFF").slice(0, 30),
        [filteredRows],
    );

    const kpiCards = useMemo<KpiCard[]>(() => {
        const uniqueOperators = new Set(
            allRows
                .map((row) => row.operatorName)
                .filter((name): name is string => Boolean(name && name.trim())),
        );

        const activeOrders = new Set(
            allRows
                .map((row) => row.woSpecs?.woId || row.originalLog?.wo_id)
                .filter((value): value is string | number => value !== undefined && value !== null),
        ).size;

        const machinesRunning = machineSnapshots.filter((machine) => machine.status === "Running").length;

        return [
            {
                id: "employees",
                label: "Total Employees",
                value: String(uniqueOperators.size),
                tone: "blue",
                icon: Users,
            },
            {
                id: "present",
                label: "Present Today",
                value: String(uniqueOperators.size),
                tone: "green",
                icon: User,
            },
            {
                id: "orders",
                label: "Active Orders",
                value: String(activeOrders),
                tone: "slate",
                icon: Calendar,
            },
            {
                id: "machines",
                label: "Machines Running",
                value: `${machinesRunning}/${MACHINE_IDS.length}`,
                tone: "amber",
                icon: Wrench,
            },
            {
                id: "efficiency",
                label: "Overall Efficiency",
                value: `${hubSummary.goodRatePct}%`,
                hint: "Classified cycle quality",
                tone: "amber",
                icon: Zap,
            },
            {
                id: "units",
                label: "Units Today",
                value: String(reportStats?.totalOkQty || 0),
                tone: "violet",
                icon: Gauge,
            },
        ];
    }, [allRows, hubSummary.goodRatePct, machineSnapshots, reportStats?.totalOkQty]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);

        if (!TOKEN) {
            setError("Missing VITE_API_TOKEN. Set token to enable live dashboard data.");
            setAllRows([]);
            setMachineSnapshots([]);
            setReportStats(null);
            setLoading(false);
            return;
        }

        try {
            const now = new Date();
            const startWindow = getWindowStart(rangePreset, now);

            const configForDevice = (deviceId: number): ReportConfig => ({
                deviceId,
                startDate: formatDateForApi(startWindow),
                endDate: formatDateForApi(now),
                toleranceSec: 10,
            });

            const deviceNameMap = await fetchDeviceNameMap(TOKEN);

            const deviceLogsPairs = await Promise.all(
                MACHINE_IDS.map(async (deviceId) => {
                    const logs = await fetchDeviceLogs(configForDevice(deviceId), TOKEN);
                    const shiftFiltered = logs.filter((log) => belongsToShift(new Date(log.log_time), shiftPreset));
                    return [deviceId, shiftFiltered] as const;
                }),
            );

            const logsByDevice = new Map<number, DeviceLogEntry[]>(deviceLogsPairs);
            const combinedLogs = deviceLogsPairs.flatMap(([, logs]) => logs);

            const scopeLogs =
                machineScope === "ALL"
                    ? combinedLogs
                    : logsByDevice.get(machineScope) || [];

            const woIds = extractWoIds(scopeLogs);
            const woDetailsMap = await fetchAllWoDetails(woIds, TOKEN);

            const report = buildReportV2(scopeLogs, woDetailsMap, {
                deviceId: machineScope === "ALL" ? MACHINE_IDS[0] : machineScope,
                startDate: formatDateForApi(startWindow),
                endDate: formatDateForApi(now),
                toleranceSec: 10,
            });

            setAllRows(report.filterableRows);
            setReportStats(report.stats);
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
            });

            setMachineSnapshots(
                MACHINE_IDS.map((deviceId) => buildMachineSnapshot(deviceId, logsByDevice.get(deviceId) || [], deviceNameMap)),
            );

            setLastRefreshed(new Date());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to refresh dashboard.");
            setAllRows([]);
            setMachineSnapshots([]);
            setReportStats(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const intervalId = window.setInterval(fetchData, REFRESH_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [rangePreset, shiftPreset, machineScope]);

    const totalFilteredCycleSec = latestCycles.reduce((sum, row) => sum + (row.durationSec || 0), 0);

    return (
        <div className="min-h-screen bg-[#02040b] text-slate-100">
            <div className="flex min-h-screen">
                <RailNav />

                <main className="flex-1 px-4 py-4 md:px-6 md:py-5">
                    <div className="mx-auto max-w-[1400px] space-y-4">
                        <header className="rounded-xl border border-slate-800 bg-[#02060f] px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="relative min-w-[220px] flex-1 max-w-xl">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                    <input
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        placeholder="Search WO, operator, action..."
                                        className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none"
                                    />
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <button type="button" className="rounded-lg border border-slate-700 p-2 hover:bg-slate-900">
                                        <Settings className="h-4 w-4" />
                                    </button>
                                    <button type="button" className="rounded-lg border border-slate-700 p-2 hover:bg-slate-900">
                                        <Bell className="h-4 w-4" />
                                    </button>
                                    <span className="rounded-full border border-blue-500/40 bg-blue-500/15 px-3 py-1 text-blue-200">
                                        mr1398463
                                    </span>
                                </div>
                            </div>
                        </header>

                        <section className="rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-500/90 via-indigo-500/80 to-violet-600/80 px-6 py-6 shadow-[0_30px_60px_-40px_rgba(59,130,246,0.8)]">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h1 className="text-3xl font-semibold tracking-tight text-white">Production Dashboard</h1>
                                    <p className="mt-1 text-sm text-blue-100">Real-time manufacturing intelligence</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white">
                                        Live {compactTime(lastRefreshed)}
                                    </div>
                                    <button
                                        onClick={fetchData}
                                        disabled={loading}
                                        className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60"
                                    >
                                        <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                                        Refresh
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="rounded-xl border border-slate-700 bg-slate-900/75 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={rangePreset}
                                    onChange={(event) => setRangePreset(event.target.value as RangePreset)}
                                    className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                                >
                                    <option value="TODAY">Today</option>
                                    <option value="LAST_6H">Last 6h</option>
                                    <option value="LAST_24H">Last 24h</option>
                                </select>

                                <select
                                    value={shiftPreset}
                                    onChange={(event) => setShiftPreset(event.target.value as ShiftPreset)}
                                    className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                                >
                                    <option value="ALL">All Shifts</option>
                                    <option value="A">Shift A (06-14)</option>
                                    <option value="B">Shift B (14-22)</option>
                                    <option value="C">Shift C (22-06)</option>
                                </select>

                                <select
                                    value={machineScope === "ALL" ? "ALL" : String(machineScope)}
                                    onChange={(event) => setMachineScope(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}
                                    className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                                >
                                    <option value="ALL">All Machines</option>
                                    {MACHINE_IDS.map((id) => (
                                        <option key={id} value={id}>{`Machine ${id}`}</option>
                                    ))}
                                </select>

                                <div className="ml-auto flex items-center gap-2">
                                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                                        Mode: {modeLabel(filterState.mode)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setFilterState((previous) => ({
                                                ...previous,
                                                mode:
                                                    previous.mode === "GOOD_ONLY"
                                                        ? "GOOD_WARNING"
                                                        : previous.mode === "GOOD_WARNING"
                                                            ? "ALL"
                                                            : "GOOD_ONLY",
                                            }))
                                        }
                                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                                    >
                                        Cycle Mode
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setFilterState((previous) => ({
                                                ...previous,
                                                includeUnknown: !previous.includeUnknown,
                                            }))
                                        }
                                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                                    >
                                        Unknown {filterState.includeUnknown ? "ON" : "OFF"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setFilterState((previous) => ({
                                                ...previous,
                                                includeBreakExtensions: !previous.includeBreakExtensions,
                                            }))
                                        }
                                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                                    >
                                        Breaks {filterState.includeBreakExtensions ? "ON" : "OFF"}
                                    </button>
                                    <Link
                                        to="/report-v2"
                                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 px-3 text-sm font-medium hover:bg-slate-700"
                                    >
                                        <Download className="h-4 w-4" />
                                        Export
                                    </Link>
                                </div>
                            </div>
                        </section>

                        {error ? (
                            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                                {error}
                            </div>
                        ) : null}

                        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                            {kpiCards.map((card) => (
                                <KpiCardItem key={card.id} card={card} />
                            ))}
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-semibold text-slate-100">Live Production Pulse</h2>
                                <span className="rounded-md bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                                    Live Tracking
                                </span>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                {machineSnapshots.map((machine) => (
                                    <article key={machine.deviceId} className="rounded-2xl border border-slate-800 bg-[#06122b] p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <h3 className="text-3xl font-semibold text-slate-100">{machine.deviceName}</h3>
                                            <span className="h-3 w-3 rounded-full bg-slate-500/70" />
                                        </div>
                                        <p className="text-sm text-slate-400">ID: {machine.deviceId}</p>
                                        <div className="mt-4 space-y-2 text-sm text-slate-300">
                                            <div className="flex items-center justify-between">
                                                <span>Active WO</span>
                                                <span className="rounded bg-slate-900 px-2 py-1 text-slate-100">{machine.activeWo}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span>Status</span>
                                                <span className={`rounded px-2 py-1 text-xs font-semibold ${statusToneClass[machine.status]}`}>
                                                    {machine.status}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-400">
                                            <p className="uppercase tracking-wide">Latest Event</p>
                                            <p className="mt-1 text-sm text-slate-200">{machine.latestEvent} @ {machine.latestEventTime}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <h2 className="text-lg font-semibold">Classified Cycle Feed</h2>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1">
                                        <Cpu className="h-3.5 w-3.5" />
                                        Rows: {filteredRows.length}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1">
                                        <Clock3 className="h-3.5 w-3.5" />
                                        Cycle Time: {formatDuration(totalFilteredCycleSec)}
                                    </span>
                                </div>
                            </div>

                            {latestCycles.length === 0 ? (
                                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-6 text-center text-sm text-slate-400">
                                    No cycle rows for current filters.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[980px] text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                                                <th className="px-3 py-2">Time</th>
                                                <th className="px-3 py-2">WO</th>
                                                <th className="px-3 py-2">Duration</th>
                                                <th className="px-3 py-2">Class</th>
                                                <th className="px-3 py-2">Reason</th>
                                                <th className="px-3 py-2">Operator</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {latestCycles.map((row) => {
                                                const classification = row.classification || "UNKNOWN";
                                                return (
                                                    <tr key={row.rowId} className="border-b border-slate-800/80 hover:bg-slate-950/60">
                                                        <td className="px-3 py-2 font-mono text-xs text-slate-300 whitespace-nowrap">
                                                            {row.logTime.toLocaleString("en-GB")}
                                                        </td>
                                                        <td className="px-3 py-2 whitespace-nowrap">{row.woSpecs?.woId || row.originalLog?.wo_id || "-"}</td>
                                                        <td className="px-3 py-2 font-mono whitespace-nowrap">{row.durationText || "-"}</td>
                                                        <td className="px-3 py-2 whitespace-nowrap">
                                                            <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${classificationBadgeClass[classification] || classificationBadgeClass.UNKNOWN}`}>
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

                        <footer className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1">
                                    <Activity className="h-3.5 w-3.5" />
                                    Logs: {hubSummary.totalLogs}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1">
                                    <BarChart3 className="h-3.5 w-3.5" />
                                    Jobs: {hubSummary.totalJobs}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1">
                                    <Gauge className="h-3.5 w-3.5" />
                                    Avg Cycle: {formatDuration(hubSummary.avgCycleSec)}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1">
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                    Unknown: {hubSummary.unknownCycles}
                                </span>
                            </div>
                        </footer>
                    </div>
                </main>
            </div>
        </div>
    );
}
