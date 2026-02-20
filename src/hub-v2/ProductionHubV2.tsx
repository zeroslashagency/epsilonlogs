import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    BarChart3,
    Bell,
    Download,
    Factory,
    Gauge,
    RefreshCcw,
    Search,
    Settings,
    ShieldAlert,
    User,
    Wrench,
    X,
    type LucideIcon,
} from "lucide-react";
import { fetchDeviceLogs, fetchWoDetails, formatDateForApi } from "../report/api-client";
import { buildReportV2 } from "../report/report-builder-v2";
import { DeviceLogEntry, ReportConfig, ReportRow, WoDetails } from "../report/report-types";
import { formatDuration } from "../report/format-utils";
import { Expandable, ExpandableContent, ExpandableTrigger } from "@/components/ui/expandable";

const TOKEN = import.meta.env.VITE_API_TOKEN;
const REFRESH_INTERVAL_MS = 30000;
const OVERVIEW_CACHE_TTL_MS = 45000;
const WO_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const LIVE_WINDOW_MS = 15 * 60 * 1000;
const MACHINE_IDS = [15, 16, 17, 18] as const;
const TOP_WO_LIMIT = 12;

type RangePreset = "DAY" | "LAST_3_DAYS" | "LAST_7_DAYS" | "LAST_30_DAYS";
type ShiftPreset = "ALL" | "A" | "B" | "C";
type MachineScope = "ALL" | number;
type DetailStage = 1 | 2 | 3;
type WoExecutionStatus = "LIVE" | "PROCESSING" | "COMPLETE";
type RowClassification = "GOOD" | "WARNING" | "BAD" | "UNKNOWN";
type WoJobType = ReportRow["jobType"];

interface WoJobTag {
    jobType: WoJobType;
}

interface WoCardSummary {
    woId: string;
    machineId: number | null;
    operatorName: string;
    jobType: WoJobType;
    executionStatus: WoExecutionStatus;
    pclText: string;
    totalCycles: number;
    goodCycles: number;
    warningCycles: number;
    badCycles: number;
    unknownCycles: number;
    totalCycleSec: number;
    totalDurationSec: number;
    avgCycleSec: number;
    latestTimestamp: number;
    latestEvent: string;
    latestClassification: RowClassification;
    latestDurationText: string;
    latestReason: string;
    jobTypeTags: WoJobTag[];
}

interface WoAccumulator {
    woId: string;
    machineId: number | null;
    operatorName: string;
    jobType: WoJobType;
    pclText: string;
    jobTypeFirstSeen: Map<WoJobType, number>;
    totalCycles: number;
    goodCycles: number;
    warningCycles: number;
    badCycles: number;
    unknownCycles: number;
    totalCycleSec: number;
    totalDurationSec: number;
    latestTimestamp: number;
    latestCycleTimestamp: number;
    latestEvent: string;
    latestAction: string;
    latestClassification: RowClassification;
    latestDurationText: string;
    latestReason: string;
    hasWoStart: boolean;
    hasWoStop: boolean;
}

const classificationBadgeClass: Record<RowClassification, string> = {
    GOOD: "bg-emerald-100 text-emerald-700 ring-emerald-300",
    WARNING: "bg-amber-100 text-amber-700 ring-amber-300",
    BAD: "bg-rose-100 text-rose-700 ring-rose-300",
    UNKNOWN: "bg-slate-100 text-slate-700 ring-slate-300",
};

const executionStatusBadgeClass: Record<WoExecutionStatus, string> = {
    LIVE: "bg-sky-100 text-sky-700 ring-sky-300",
    PROCESSING: "bg-amber-100 text-amber-700 ring-amber-300",
    COMPLETE: "bg-emerald-100 text-emerald-700 ring-emerald-300",
};

function getWindowStart(rangePreset: RangePreset, now: Date): Date {
    const start = new Date(now);

    if (rangePreset === "DAY") {
        start.setHours(start.getHours() - 24);
        return start;
    }

    if (rangePreset === "LAST_3_DAYS") {
        start.setDate(start.getDate() - 3);
        return start;
    }

    if (rangePreset === "LAST_7_DAYS") {
        start.setDate(start.getDate() - 7);
        return start;
    }

    start.setDate(start.getDate() - 30);
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

function compactTime(value: Date | null): string {
    if (!value) return "--:--";
    return value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: Date | null): string {
    if (!value) return "-";
    return value.toLocaleString("en-GB");
}

function hasText(value: string | null | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0;
}

function parseApiDate(value: string | null | undefined): Date | null {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
}

function resolveWoId(row: ReportRow): string | null {
    const raw = row.originalLog?.wo_id ?? row.woSpecs?.woId;
    return raw === undefined || raw === null ? null : String(raw);
}

function toPclText(value: unknown): string {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return formatDuration(numeric);
    }

    return String(value);
}

function hasMeaningfulPclText(value: string | null | undefined): value is string {
    if (!value) {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized !== "-" && normalized !== "0 min 0 sec" && normalized !== "0 sec";
}

function resolveRowPclText(row: ReportRow): string {
    const fromLog = toPclText(row.originalLog?.pcl);
    if (hasMeaningfulPclText(fromLog)) {
        return fromLog;
    }

    if (hasMeaningfulPclText(row.woSpecs?.pclText)) {
        return row.woSpecs!.pclText;
    }

    return row.woSpecs?.pclText || "-";
}

function resolveExecutionStatus(entry: WoAccumulator): WoExecutionStatus {
    if (entry.hasWoStop || entry.latestAction === "WO_STOP") {
        return "COMPLETE";
    }

    if (entry.latestAction === "WO_PAUSE") {
        return "PROCESSING";
    }

    if (entry.latestAction === "WO_START" || entry.latestAction === "WO_RESUME" || entry.latestAction === "SPINDLE_ON") {
        return "LIVE";
    }

    if (Date.now() - entry.latestTimestamp <= LIVE_WINDOW_MS) {
        return "LIVE";
    }

    return entry.hasWoStart ? "PROCESSING" : "LIVE";
}

function getJobTypeIcon(jobType: WoJobType): LucideIcon {
    if (jobType === "Production") return Factory;
    if (jobType === "Setting") return Settings;
    if (jobType === "Calibration") return Gauge;
    if (jobType === "Maintenance") return Wrench;
    if (jobType === "Manual Input") return User;
    if (jobType === "Other") return BarChart3;
    return ShieldAlert;
}

function getJobTypeBadgeClass(jobType: WoJobType): string {
    if (jobType === "Production") return "bg-blue-100 text-blue-700 ring-blue-300";
    if (jobType === "Setting") return "bg-violet-100 text-violet-700 ring-violet-300";
    if (jobType === "Calibration") return "bg-cyan-100 text-cyan-700 ring-cyan-300";
    if (jobType === "Maintenance") return "bg-amber-100 text-amber-700 ring-amber-300";
    if (jobType === "Manual Input") return "bg-emerald-100 text-emerald-700 ring-emerald-300";
    if (jobType === "Other") return "bg-rose-100 text-rose-700 ring-rose-300";
    return "bg-slate-100 text-slate-700 ring-slate-300";
}

function buildDefaultAccumulator(woId: string, row: ReportRow): WoAccumulator {
    const timestamp = row.timestamp;
    const latestAction = row.action || "";
    const logJobType = row.jobType;
    const operatorName = row.operatorName || String(row.originalLog?.start_name || "").trim() || "Unknown";
    return {
        woId,
        machineId: row.originalLog?.device_id ?? null,
        operatorName,
        jobType: logJobType,
        pclText: resolveRowPclText(row),
        jobTypeFirstSeen: new Map([[logJobType, timestamp]]),
        totalCycles: 0,
        goodCycles: 0,
        warningCycles: 0,
        badCycles: 0,
        unknownCycles: 0,
        totalCycleSec: 0,
        totalDurationSec: 0,
        latestTimestamp: timestamp,
        latestCycleTimestamp: -1,
        latestEvent: row.action || row.label || row.summary || "EVENT",
        latestAction,
        latestClassification: "UNKNOWN",
        latestDurationText: "-",
        latestReason: "No reason",
        hasWoStart: row.action === "WO_START",
        hasWoStop: row.action === "WO_STOP",
    };
}

export default function ProductionHubV2() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

    const [rangePreset, setRangePreset] = useState<RangePreset>("DAY");
    const [shiftPreset, setShiftPreset] = useState<ShiftPreset>("ALL");
    const [machineScope, setMachineScope] = useState<MachineScope>("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    const [allRows, setAllRows] = useState<ReportRow[]>([]);
    const [woDetailsById, setWoDetailsById] = useState<Map<number, WoDetails>>(new Map());
    const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
    const [detailStage, setDetailStage] = useState<DetailStage>(1);
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);
    const overviewCacheRef = useRef<Map<string, { rows: ReportRow[]; fetchedAt: number }>>(new Map());
    const woDetailsCacheRef = useRef<Map<number, { data: WoDetails | null; fetchedAt: number }>>(new Map());
    const inflightWoDetailsRef = useRef<Map<number, Promise<WoDetails | null>>>(new Map());

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        if (!query) {
            return allRows;
        }

        return allRows.filter((row) => {
            const wo = String(row.woSpecs?.woId || row.originalLog?.wo_id || "").toLowerCase();
            const operator = (row.operatorName || "").toLowerCase();
            const action = (row.action || "").toLowerCase();
            const reason = (row.reasonText || "").toLowerCase();
            return wo.includes(query) || operator.includes(query) || action.includes(query) || reason.includes(query);
        });
    }, [allRows, searchQuery]);

    const topWoCards = useMemo<WoCardSummary[]>(() => {
        const grouped = new Map<string, WoAccumulator>();

        filteredRows.forEach((row) => {
            const woId = resolveWoId(row);
            if (!woId) {
                return;
            }

            const timestamp = row.timestamp;
            const entry = grouped.get(woId) || buildDefaultAccumulator(woId, row);

            entry.totalDurationSec += row.durationSec || 0;
            const existingJobTypeTs = entry.jobTypeFirstSeen.get(row.jobType);
            if (existingJobTypeTs === undefined || row.timestamp < existingJobTypeTs) {
                entry.jobTypeFirstSeen.set(row.jobType, row.timestamp);
            }
            if (!hasMeaningfulPclText(entry.pclText)) {
                const candidatePcl = resolveRowPclText(row);
                if (hasMeaningfulPclText(candidatePcl)) {
                    entry.pclText = candidatePcl;
                }
            }
            if (entry.jobType === "Unknown" && row.jobType !== "Unknown") {
                entry.jobType = row.jobType;
            }
            if (row.action === "WO_START") {
                entry.hasWoStart = true;
            }
            if (row.action === "WO_STOP") {
                entry.hasWoStop = true;
            }

            if (timestamp >= entry.latestTimestamp) {
                entry.latestTimestamp = timestamp;
                entry.latestEvent = row.action || row.label || row.summary || "EVENT";
                entry.latestAction = row.action || "";
                entry.machineId = row.originalLog?.device_id ?? entry.machineId;
                entry.operatorName =
                    row.operatorName || String(row.originalLog?.start_name || "").trim() || entry.operatorName;
            }

            if (row.action === "SPINDLE_OFF") {
                const classification: RowClassification = row.classification || "UNKNOWN";
                entry.totalCycles += 1;
                entry.totalCycleSec += row.durationSec || 0;
                entry.goodCycles += classification === "GOOD" ? 1 : 0;
                entry.warningCycles += classification === "WARNING" ? 1 : 0;
                entry.badCycles += classification === "BAD" ? 1 : 0;
                entry.unknownCycles += classification === "UNKNOWN" ? 1 : 0;

                if (timestamp >= entry.latestCycleTimestamp) {
                    entry.latestCycleTimestamp = timestamp;
                    entry.latestClassification = classification;
                    entry.latestDurationText = row.durationText || "-";
                    entry.latestReason = row.reasonText || "No reason";
                }
            }

            grouped.set(woId, entry);
        });

        return [...grouped.values()]
            .sort((left, right) => right.latestTimestamp - left.latestTimestamp)
            .slice(0, TOP_WO_LIMIT)
            .map((entry) => {
                const orderedJobTags = [...entry.jobTypeFirstSeen.entries()]
                    .sort((left, right) => {
                        return left[1] - right[1];
                    })
                    .map(([jobType]) => ({
                        jobType,
                    }));

                const visibleTags = orderedJobTags.filter((tag) => tag.jobType !== "Unknown");
                const status = resolveExecutionStatus(entry);
                return {
                    woId: entry.woId,
                    machineId: entry.machineId,
                    operatorName: entry.operatorName,
                    jobType: entry.jobType,
                    executionStatus: status,
                    pclText: entry.pclText,
                    totalCycles: entry.totalCycles,
                    goodCycles: entry.goodCycles,
                    warningCycles: entry.warningCycles,
                    badCycles: entry.badCycles,
                    unknownCycles: entry.unknownCycles,
                    totalCycleSec: entry.totalCycleSec,
                    totalDurationSec: entry.totalDurationSec,
                    avgCycleSec: entry.totalCycles > 0 ? Math.round(entry.totalCycleSec / entry.totalCycles) : 0,
                    latestTimestamp: entry.latestTimestamp,
                    latestEvent: entry.latestEvent,
                    latestClassification: entry.latestClassification,
                    latestDurationText: entry.latestDurationText,
                    latestReason: entry.latestReason,
                    jobTypeTags: visibleTags.length > 0 ? visibleTags : [{ jobType: entry.jobType }],
                };
            });
    }, [filteredRows]);

    useEffect(() => {
        if (topWoCards.length === 0) {
            setSelectedWoId(null);
            setDetailStage(1);
            setIsOverlayOpen(false);
            return;
        }

        if (selectedWoId && !topWoCards.some((card) => card.woId === selectedWoId)) {
            setSelectedWoId(null);
            setDetailStage(1);
            setIsOverlayOpen(false);
        }
    }, [selectedWoId, topWoCards]);

    const selectedWoCard = useMemo(
        () => topWoCards.find((card) => card.woId === selectedWoId) || null,
        [selectedWoId, topWoCards],
    );

    const selectedWoRows = useMemo(() => {
        if (!selectedWoId) {
            return [];
        }

        return allRows
            .filter((row) => resolveWoId(row) === selectedWoId)
            .sort((left, right) => right.timestamp - left.timestamp);
    }, [allRows, selectedWoId]);

    const selectedWoDetails = useMemo(() => {
        if (!selectedWoId) {
            return null;
        }
        const woIdNum = Number(selectedWoId);
        if (!Number.isFinite(woIdNum)) {
            return null;
        }
        return woDetailsById.get(woIdNum) || null;
    }, [selectedWoId, woDetailsById]);

    const selectedWoStageData = useMemo(() => {
        if (selectedWoRows.length === 0) {
            return {
                startTime: null as Date | null,
                endTime: null as Date | null,
                totalWindowSec: 0,
                startComment: "-",
                endComment: "-",
                startEvent: "-",
                endEvent: "-",
            };
        }

        const latestRow = selectedWoRows[0];
        const oldestRow = selectedWoRows[selectedWoRows.length - 1];
        const woStartRow = [...selectedWoRows].reverse().find((row) => row.action === "WO_START");
        const woStopRow = selectedWoRows.find((row) => row.action === "WO_STOP");
        const apiStartTime = parseApiDate(selectedWoDetails?.start_time);
        const apiEndTime = parseApiDate(selectedWoDetails?.end_time);

        const startTime = apiStartTime || woStartRow?.logTime || oldestRow.logTime;
        const endTime = apiEndTime || woStopRow?.logTime || latestRow.logTime;

        const totalWindowSec =
            selectedWoDetails && selectedWoDetails.duration > 0
                ? selectedWoDetails.duration
                : Math.max(0, Math.round((latestRow.timestamp - oldestRow.timestamp) / 1000));

        const startComment =
            (hasText(selectedWoDetails?.start_comment) ? selectedWoDetails?.start_comment : "") ||
            (hasText(woStartRow?.startRowData?.comment) ? woStartRow?.startRowData?.comment : "") ||
            (hasText(woStartRow?.woHeaderData?.startComment) ? woStartRow?.woHeaderData?.startComment : "") ||
            (hasText(woStartRow?.originalLog?.start_comment as string | undefined)
                ? (woStartRow?.originalLog?.start_comment as string)
                : "") ||
            "-";

        const endComment =
            (hasText(selectedWoDetails?.stop_comment) ? selectedWoDetails?.stop_comment : "") ||
            (hasText(woStopRow?.stopRowData?.reason) ? woStopRow?.stopRowData?.reason : "") ||
            (hasText(woStopRow?.originalLog?.stop_comment as string | undefined)
                ? (woStopRow?.originalLog?.stop_comment as string)
                : "") ||
            "-";

        return {
            startTime,
            endTime,
            totalWindowSec,
            startComment,
            endComment,
            startEvent: woStartRow?.action || oldestRow.action || oldestRow.label || "WO_START",
            endEvent: woStopRow?.action || latestRow.action || latestRow.label || "WO_STOP",
        };
    }, [selectedWoRows, selectedWoDetails]);

    const ensureWoDetailsLoaded = useCallback(
        async (woIdValue: string | null) => {
            if (!woIdValue || !TOKEN) {
                return;
            }

            const woIdNum = Number(woIdValue);
            if (!Number.isFinite(woIdNum)) {
                return;
            }

            if (woDetailsById.has(woIdNum)) {
                return;
            }

            const now = Date.now();
            const cached = woDetailsCacheRef.current.get(woIdNum);
            if (cached && now - cached.fetchedAt <= WO_DETAIL_CACHE_TTL_MS) {
                if (cached.data) {
                    setWoDetailsById((prev) => {
                        if (prev.has(woIdNum)) {
                            return prev;
                        }
                        const next = new Map(prev);
                        next.set(woIdNum, cached.data);
                        return next;
                    });
                }
                return;
            }

            const inflight = inflightWoDetailsRef.current.get(woIdNum);
            if (inflight) {
                const data = await inflight;
                if (data) {
                    setWoDetailsById((prev) => {
                        if (prev.has(woIdNum)) {
                            return prev;
                        }
                        const next = new Map(prev);
                        next.set(woIdNum, data);
                        return next;
                    });
                }
                return;
            }

            const request = fetchWoDetails(woIdNum, TOKEN)
                .catch(() => null)
                .finally(() => {
                    inflightWoDetailsRef.current.delete(woIdNum);
                });
            inflightWoDetailsRef.current.set(woIdNum, request);

            const fetched = await request;
            woDetailsCacheRef.current.set(woIdNum, { data: fetched, fetchedAt: Date.now() });

            if (!fetched) {
                return;
            }

            setWoDetailsById((prev) => {
                if (prev.has(woIdNum)) {
                    return prev;
                }
                const next = new Map(prev);
                next.set(woIdNum, fetched);
                return next;
            });
        },
        [woDetailsById],
    );

    const fetchData = async (options?: { force?: boolean }) => {
        setLoading(true);
        setError(null);

        if (!TOKEN) {
            setError("Missing VITE_API_TOKEN. Set token to enable live dashboard data.");
            setLoading(false);
            return;
        }

        const cacheKey = `${rangePreset}|${shiftPreset}|${machineScope}`;
        const nowTimestamp = Date.now();
        const cachedOverview = overviewCacheRef.current.get(cacheKey);
        if (!options?.force && cachedOverview && nowTimestamp - cachedOverview.fetchedAt <= OVERVIEW_CACHE_TTL_MS) {
            setAllRows(cachedOverview.rows);
            setLastRefreshed(new Date(cachedOverview.fetchedAt));
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

            const deviceLogResults = await Promise.allSettled(
                MACHINE_IDS.map(async (deviceId) => {
                    const logs = await fetchDeviceLogs(configForDevice(deviceId), TOKEN);
                    const shiftFiltered = logs.filter((log) => belongsToShift(new Date(log.log_time), shiftPreset));
                    return [deviceId, shiftFiltered] as const;
                }),
            );

            const deviceLogsPairs = deviceLogResults
                .filter((result): result is PromiseFulfilledResult<readonly [number, DeviceLogEntry[]]> => result.status === "fulfilled")
                .map((result) => result.value);

            if (deviceLogsPairs.length === 0) {
                throw new Error("No device logs available for selected range.");
            }

            const logsByDevice = new Map<number, DeviceLogEntry[]>(deviceLogsPairs);
            const combinedLogs = deviceLogsPairs.flatMap(([, logs]) => logs);
            const scopeLogs = machineScope === "ALL" ? combinedLogs : logsByDevice.get(machineScope) || [];

            const report = buildReportV2(scopeLogs, new Map(), {
                deviceId: machineScope === "ALL" ? MACHINE_IDS[0] : machineScope,
                startDate: formatDateForApi(startWindow),
                endDate: formatDateForApi(now),
                toleranceSec: 10,
            });

            overviewCacheRef.current.set(cacheKey, { rows: report.filterableRows, fetchedAt: Date.now() });
            setAllRows(report.filterableRows);
            setLastRefreshed(new Date());

            const failedCount = deviceLogResults.length - deviceLogsPairs.length;
            if (failedCount > 0) {
                setError(`Partial data loaded. ${failedCount} machine request(s) failed.`);
            }
        } catch (err: unknown) {
            if (cachedOverview) {
                setAllRows(cachedOverview.rows);
                setLastRefreshed(new Date(cachedOverview.fetchedAt));
                setError(`Live refresh failed, showing cached data. ${err instanceof Error ? err.message : ""}`.trim());
            } else {
                setError(err instanceof Error ? err.message : "Failed to refresh dashboard.");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchData();
        const intervalId = window.setInterval(() => {
            void fetchData();
        }, REFRESH_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [rangePreset, shiftPreset, machineScope]);

    useEffect(() => {
        if (!selectedWoId || detailStage < 2) {
            return;
        }
        void ensureWoDetailsLoaded(selectedWoId);
    }, [detailStage, ensureWoDetailsLoaded, selectedWoId]);

    const selectedWoGoodRate =
        selectedWoCard && selectedWoCard.totalCycles > 0
            ? Math.round((selectedWoCard.goodCycles / selectedWoCard.totalCycles) * 100)
            : 0;

    const closeOverlay = () => {
        setIsOverlayOpen(false);
        if (selectedWoId) {
            setDetailStage(2);
            return;
        }
        setDetailStage(1);
    };

    const closeAllDetails = () => {
        setIsOverlayOpen(false);
        setDetailStage(1);
        setSelectedWoId(null);
    };

    useEffect(() => {
        if (!isOverlayOpen) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeOverlay();
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isOverlayOpen]);

    const handleWoCardClick = (woId: string) => {
        if (selectedWoId === woId && detailStage === 2 && !isOverlayOpen) {
            setSelectedWoId(null);
            setDetailStage(1);
            return;
        }

        setSelectedWoId(woId);
        setDetailStage(2);
        setIsOverlayOpen(false);
        void ensureWoDetailsLoaded(woId);
    };

    const openWoLogsOverlay = () => {
        if (!selectedWoId) {
            return;
        }
        void ensureWoDetailsLoaded(selectedWoId);
        setDetailStage(3);
        setIsOverlayOpen(true);
    };

    const backToSummary = () => {
        setDetailStage(2);
        setIsOverlayOpen(false);
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_1px_1px,#d6dbe3_1px,transparent_1px)] [background-size:20px_20px] p-2 text-slate-900 sm:p-4">
            <main className="mx-auto w-full max-w-none">
                <section className="min-h-[calc(100vh-1rem)] w-full rounded-[28px] border border-slate-300 bg-[#dce3ec]/90 p-4 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.6)] sm:min-h-[calc(100vh-2rem)] sm:p-6">
                    <header className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Logo</div>

                            <nav className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                                <span className="rounded-md bg-slate-900 px-2.5 py-1.5 font-medium text-white">Dashboard</span>
                                <Link
                                    to="/report"
                                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-slate-600 hover:bg-slate-100"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Device Logs Report
                                </Link>
                            </nav>

                            <div className="ml-auto flex min-w-[240px] items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        placeholder="Search WO..."
                                        className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none"
                                    />
                                </div>
                                <button type="button" className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50">
                                    <Bell className="h-4 w-4" />
                                </button>
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                                    <User className="h-3.5 w-3.5" />
                                    epsilon
                                </span>
                            </div>
                        </div>
                    </header>

                    <section className="mt-4 rounded-2xl border border-slate-200 bg-white/85 px-3 py-3 sm:px-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={rangePreset}
                                onChange={(event) => setRangePreset(event.target.value as RangePreset)}
                                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 sm:text-sm"
                            >
                                <option value="LAST_30_DAYS">Month</option>
                                <option value="LAST_7_DAYS">7 Days</option>
                                <option value="LAST_3_DAYS">3 Days</option>
                                <option value="DAY">Day</option>
                            </select>

                            <select
                                value={shiftPreset}
                                onChange={(event) => setShiftPreset(event.target.value as ShiftPreset)}
                                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 sm:text-sm"
                            >
                                <option value="ALL">All Shifts</option>
                                <option value="A">Shift A (06-14)</option>
                                <option value="B">Shift B (14-22)</option>
                                <option value="C">Shift C (22-06)</option>
                            </select>

                            <select
                                value={machineScope === "ALL" ? "ALL" : String(machineScope)}
                                onChange={(event) => setMachineScope(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}
                                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 sm:text-sm"
                            >
                                <option value="ALL">All Machines</option>
                                {MACHINE_IDS.map((id) => (
                                    <option key={id} value={id}>{`Machine ${id}`}</option>
                                ))}
                            </select>

                            <Link
                                to="/report"
                                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 sm:text-sm"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Open /report
                            </Link>

                            <button
                                type="button"
                                onClick={() => {
                                    void fetchData({ force: true });
                                }}
                                disabled={loading}
                                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:text-sm"
                            >
                                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                                Refresh
                            </button>
                        </div>

                        <div className="mt-2 text-xs text-slate-500">Live: {compactTime(lastRefreshed)}</div>
                    </section>

                    {error ? (
                        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {error}
                        </div>
                    ) : null}

                    <section className="mt-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h1 className="text-lg font-semibold text-slate-800 sm:text-xl">WO Overview</h1>
                            <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                                Click card to expand summary · Showing latest {TOP_WO_LIMIT}
                            </span>
                        </div>

                        {topWoCards.length === 0 ? (
                            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                                No WO cards available for current filters.
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {topWoCards.map((card) => {
                                    const JobTypeIcon = getJobTypeIcon(card.jobType);
                                    const isStageTwo = selectedWoId === card.woId && detailStage === 2 && !isOverlayOpen;
                                    const isActive = selectedWoId === card.woId;

                                    return (
                                        <Expandable
                                            key={card.woId}
                                            expanded={isStageTwo}
                                            onToggle={() => handleWoCardClick(card.woId)}
                                            transitionDuration={0.22}
                                            className={`rounded-2xl border bg-white p-4 text-left shadow-[0_12px_24px_-22px_rgba(15,23,42,0.9)] transition hover:-translate-y-0.5 ${isActive ? "border-slate-900 ring-1 ring-slate-300" : "border-slate-200"
                                                }`}
                                        >
                                            <ExpandableTrigger className="w-full text-left">
                                                <div className="mb-3 flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2 text-xs text-slate-600">
                                                        <span className="rounded-md bg-slate-100 p-1.5">
                                                            <JobTypeIcon className="h-3.5 w-3.5" />
                                                        </span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {card.jobTypeTags.slice(0, 3).map((jobTag) => (
                                                                <span
                                                                    key={`${card.woId}-${jobTag.jobType}`}
                                                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${getJobTypeBadgeClass(jobTag.jobType)}`}
                                                                >
                                                                    {jobTag.jobType}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <span
                                                        className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${executionStatusBadgeClass[card.executionStatus]}`}
                                                    >
                                                        {card.executionStatus}
                                                    </span>
                                                </div>

                                                <p className="text-lg font-semibold text-slate-800">{`WO-${card.woId}`}</p>
                                                <p className="mt-1 text-xs text-slate-500">{`Machine ${card.machineId ?? "-"} · ${card.operatorName}`}</p>

                                                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                                                    <p className="text-slate-500">PCL Time</p>
                                                    <p className="font-medium text-slate-700">{card.pclText}</p>
                                                    <p className="text-slate-500">Cycles</p>
                                                    <p className="font-medium text-slate-700">{card.totalCycles}</p>
                                                    <p className="text-slate-500">Total</p>
                                                    <p className="font-medium text-slate-700">{formatDuration(card.totalDurationSec)}</p>
                                                </div>

                                                <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                                                    {isStageTwo ? "Summary expanded" : "Click to expand summary"}
                                                </div>
                                            </ExpandableTrigger>

                                            <ExpandableContent preset="slide-up" className="mt-3 border-t border-slate-100 pt-3">
                                                <article className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <h2 className="text-sm font-semibold text-slate-800">WO Summary</h2>
                                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600">Stage 2</span>
                                                    </div>

                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        <div className="rounded-md border border-slate-200 bg-white p-2">
                                                            <p className="text-[11px] text-slate-500">Starting Time</p>
                                                            <p className="mt-0.5 text-xs font-semibold text-slate-800">
                                                                {formatDateTime(selectedWoStageData.startTime)}
                                                            </p>
                                                        </div>
                                                        <div className="rounded-md border border-slate-200 bg-white p-2">
                                                            <p className="text-[11px] text-slate-500">Ending Time</p>
                                                            <p className="mt-0.5 text-xs font-semibold text-slate-800">
                                                                {formatDateTime(selectedWoStageData.endTime)}
                                                            </p>
                                                        </div>
                                                        <div className="rounded-md border border-slate-200 bg-white p-2">
                                                            <p className="text-[11px] text-slate-500">Total</p>
                                                            <p className="mt-0.5 text-xs font-semibold text-slate-800">
                                                                {formatDuration(selectedWoStageData.totalWindowSec)}
                                                            </p>
                                                        </div>
                                                        <div className="rounded-md border border-slate-200 bg-white p-2">
                                                            <p className="text-[11px] text-slate-500">Good Rate</p>
                                                            <p className="mt-0.5 text-xs font-semibold text-slate-800">{`${selectedWoGoodRate}%`}</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 rounded-md border border-slate-200 bg-white p-2.5">
                                                        <div className="mb-1.5 flex items-center justify-between gap-2">
                                                            <p className="text-xs font-semibold text-slate-800">Comments</p>
                                                            <span
                                                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${getJobTypeBadgeClass(card.jobType)}`}
                                                            >
                                                                {card.jobType}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                                                <p className="text-[11px] text-slate-500">{`Starting Comment · ${selectedWoStageData.startEvent}`}</p>
                                                                <p className="mt-0.5 text-xs text-slate-700">{selectedWoStageData.startComment}</p>
                                                            </div>
                                                            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                                                <p className="text-[11px] text-slate-500">{`Ending Comment · ${selectedWoStageData.endEvent}`}</p>
                                                                <p className="mt-0.5 text-xs text-slate-700">{selectedWoStageData.endComment}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </article>

                                                <div className="mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={openWoLogsOverlay}
                                                        className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"
                                                    >
                                                        Open WO Logs
                                                    </button>
                                                </div>
                                            </ExpandableContent>
                                        </Expandable>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </section>
            </main>

            {isOverlayOpen && selectedWoCard && detailStage === 3 ? (
                <div className="fixed inset-0 z-50 bg-slate-950/35 p-2 backdrop-blur-[2px] sm:p-5" onClick={closeOverlay}>
                    <div
                        className="mx-auto flex h-full w-full max-w-[1700px] flex-col rounded-[28px] border border-slate-300 bg-[#dce3ec] p-4 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.85)] sm:p-6"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                                <button
                                    type="button"
                                    onClick={closeAllDetails}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 hover:bg-slate-50"
                                >
                                    1. WO Overview
                                </button>
                                <span
                                    className={`rounded-full px-3 py-1 ${detailStage === 2
                                            ? "bg-slate-900 text-white"
                                            : "border border-slate-200 bg-white text-slate-600"
                                        }`}
                                >
                                    2. WO Summary
                                </span>
                                <span
                                    className={`rounded-full px-3 py-1 ${detailStage === 3
                                            ? "bg-slate-900 text-white"
                                            : "border border-slate-200 bg-white text-slate-600"
                                        }`}
                                >
                                    3. WO Logs
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={closeOverlay}
                                className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
                            >
                                <X className="h-3.5 w-3.5" />
                                Close
                            </button>
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-xl font-semibold text-slate-800">{`WO-${selectedWoCard.woId}`}</p>
                                    <p className="mt-1 text-sm text-slate-600">{`Machine ${selectedWoCard.machineId ?? "-"} · ${selectedWoCard.operatorName}`}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getJobTypeBadgeClass(selectedWoCard.jobType)}`}
                                    >
                                        {selectedWoCard.jobType}
                                    </span>
                                    <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${executionStatusBadgeClass[selectedWoCard.executionStatus]}`}
                                    >
                                        {selectedWoCard.executionStatus}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-base font-semibold text-slate-800">WO Logs</h2>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Stage 3</span>
                            </div>

                            <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                                <p>{`WO-${selectedWoCard.woId}`}</p>
                                <p>{`Total rows: ${selectedWoRows.length}`}</p>
                            </div>

                            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
                                <table className="w-full min-w-[760px] text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2">Time</th>
                                            <th className="px-3 py-2">Action</th>
                                            <th className="px-3 py-2">Duration</th>
                                            <th className="px-3 py-2">Class</th>
                                            <th className="px-3 py-2">Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedWoRows.map((row) => {
                                            const rowClassification: RowClassification = row.classification || "UNKNOWN";
                                            const rowLabel = row.action || row.label || row.summary || "EVENT";
                                            return (
                                                <tr key={row.rowId} className="border-t border-slate-100 text-slate-700">
                                                    <td className="px-3 py-2 whitespace-nowrap">{row.logTime.toLocaleString("en-GB")}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{rowLabel}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{row.durationText || "-"}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        <span
                                                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${classificationBadgeClass[rowClassification]}`}
                                                        >
                                                            {rowClassification}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">{row.reasonText || "-"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={backToSummary}
                                    className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
                                >
                                    Back To Summary
                                </button>
                                <Link
                                    to="/report"
                                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Open /report
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
