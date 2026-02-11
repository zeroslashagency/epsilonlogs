import { resolveBaseline } from "../baseline";
import { buildThresholdWindow } from "../threshold";
import { ReportConfig, ReportRow, ReportStats, WoDetails } from "./report-types";
import { buildReport } from "./report-builder";

export type RowClassification = "GOOD" | "WARNING" | "BAD" | "UNKNOWN";

export interface ReportV2FilterState {
    mode: "GOOD_ONLY" | "GOOD_WARNING" | "ALL";
    includeUnknown: boolean;
    includeBreakExtensions: boolean;
}

export interface ClassificationCounts {
    GOOD: number;
    WARNING: number;
    BAD: number;
    UNKNOWN: number;
}

export interface ReportV2Telemetry {
    totalRows: number;
    totalCycles: number;
    unknownRatio: number;
    counts: ClassificationCounts;
}

export interface ReportV2HubSummary {
    totalLogs: number;
    totalJobs: number;
    totalCycles: number;
    avgCycleSec: number;
    totalCycleSec: number;
    goodCycles: number;
    warningCycles: number;
    badCycles: number;
    unknownCycles: number;
    goodRatePct: number;
    unknownRatioPct: number;
    latestCycles: ReportRow[];
}

export interface BuildReportV2Result {
    rows: ReportRow[];
    stats: ReportStats;
    filterableRows: ReportRow[];
    telemetry: ReportV2Telemetry;
    hubSummary: ReportV2HubSummary;
}

export interface CycleClassificationResult {
    classification: RowClassification;
    reasonCode: string;
    reasonText: string;
    deltaSec: number | null;
    deltaPct: number | null;
}

export const DEFAULT_REPORT_V2_FILTER_STATE: ReportV2FilterState = {
    mode: "GOOD_ONLY",
    includeUnknown: false,
    includeBreakExtensions: false,
};

const createEmptyCounts = (): ClassificationCounts => ({
    GOOD: 0,
    WARNING: 0,
    BAD: 0,
    UNKNOWN: 0,
});

const toPercent = (num: number, den: number): number => {
    if (den <= 0) return 0;
    return Math.round((num / den) * 100);
};

const isCycleRow = (row: ReportRow): boolean =>
    row.jobType === "Production" && row.action === "SPINDLE_OFF" && typeof row.durationSec === "number";

const isBreakLikeRow = (row: ReportRow): boolean => {
    if (row.isPauseBanner) return true;

    if (row.action === "WO_PAUSE" || row.action === "WO_RESUME") {
        return true;
    }

    const label = (row.label || "").toLowerCase();
    return label.includes("break") || label.includes("pause");
};

const resolveCycleTarget = (woDetails: WoDetails | undefined): number | null => {
    if (!woDetails) {
        return null;
    }

    if (woDetails.job_type === 2 && (woDetails.target_duration || 0) > 0) {
        return woDetails.target_duration || null;
    }

    return woDetails.pcl;
};

const getRowKey = (row: ReportRow, woDetails: WoDetails | undefined, config: ReportConfig): string => {
    const deviceId = woDetails?.device_id ?? row.originalLog?.device_id ?? config.deviceId;
    const partNo = woDetails?.part_no ?? row.originalLog?.part_no ?? "UNKNOWN_PART";
    return `${deviceId}:${partNo}`;
};

export function classifyCycleDuration(
    actualSec: number,
    idealSec: number | null,
    thresholdPct = 0.1,
    minThresholdSec = 5,
    warningPct = 0.25,
): CycleClassificationResult {
    if (!Number.isFinite(actualSec) || actualSec <= 0) {
        return {
            classification: "UNKNOWN",
            reasonCode: "INVALID_DURATION",
            reasonText: "Invalid or non-positive cycle duration",
            deltaSec: null,
            deltaPct: null,
        };
    }

    if (idealSec === null || !Number.isFinite(idealSec) || idealSec <= 0) {
        return {
            classification: "UNKNOWN",
            reasonCode: "MISSING_BASELINE",
            reasonText: "Missing cycle baseline",
            deltaSec: null,
            deltaPct: null,
        };
    }

    const threshold = buildThresholdWindow({
        idealCycleSec: idealSec,
        thresholdPct,
        minThresholdSec,
        warningPct,
    });

    const deltaSec = actualSec - idealSec;
    const deltaPct = (deltaSec / idealSec) * 100;

    if (actualSec >= threshold.greenLowerSec && actualSec <= threshold.greenUpperSec) {
        return {
            classification: "GOOD",
            reasonCode: "WITHIN_THRESHOLD",
            reasonText: "Within green threshold",
            deltaSec,
            deltaPct,
        };
    }

    if (actualSec >= threshold.warningLowerSec && actualSec <= threshold.warningUpperSec) {
        const isLower = deltaSec < 0;
        return {
            classification: "WARNING",
            reasonCode: isLower ? "LOWER_THAN_THRESHOLD" : "HIGHER_THAN_THRESHOLD",
            reasonText: `${Math.abs(Math.round(deltaSec))} sec ${isLower ? "lower" : "excess"}`,
            deltaSec,
            deltaPct,
        };
    }

    const isLower = deltaSec < 0;
    return {
        classification: "BAD",
        reasonCode: isLower ? "SEVERE_LOWER" : "SEVERE_HIGHER",
        reasonText: `${Math.abs(Math.round(deltaSec))} sec ${isLower ? "lower" : "excess"}`,
        deltaSec,
        deltaPct,
    };
}

const decorateRowClassification = (
    row: ReportRow,
    woDetailsMap: Map<number, WoDetails>,
    config: ReportConfig,
    historyByKey: Map<string, number[]>,
): void => {
    if (!isCycleRow(row)) {
        row.classification = "UNKNOWN";
        row.reasonCode = isBreakLikeRow(row) ? "BREAK_CONTEXT" : "NON_PRODUCTION_EVENT";
        row.reasonText = isBreakLikeRow(row)
            ? "Break/pause event"
            : "Non-cycle event";
        return;
    }

    const woId = row.originalLog?.wo_id;
    const woDetails = typeof woId === "number" ? woDetailsMap.get(woId) : undefined;
    const key = getRowKey(row, woDetails, config);
    const history = historyByKey.get(key) || [];
    const targetDuration = resolveCycleTarget(woDetails);

    const baseline = resolveBaseline({
        targetDurationSec: targetDuration,
        historyDurationsSec: history,
        defaultIdealSec: 120,
        rollingMedianWindow: 20,
    });

    const result = classifyCycleDuration(row.durationSec!, baseline.idealCycleSec);
    row.classification = result.classification;
    row.reasonCode = result.reasonCode;
    row.reasonText = result.reasonText;

    historyByKey.set(key, [...history, row.durationSec!]);
};

const getRowClassification = (row: ReportRow): RowClassification => row.classification || "UNKNOWN";

export function applyReportV2Filters(
    rows: ReportRow[],
    filterState: ReportV2FilterState = DEFAULT_REPORT_V2_FILTER_STATE,
): ReportRow[] {
    return rows.filter((row) => {
        const classification = getRowClassification(row);

        if (classification === "UNKNOWN") {
            if (isBreakLikeRow(row)) {
                return filterState.includeBreakExtensions;
            }
            return filterState.includeUnknown;
        }

        if (filterState.mode === "GOOD_ONLY") {
            return classification === "GOOD";
        }

        if (filterState.mode === "GOOD_WARNING") {
            return classification === "GOOD" || classification === "WARNING";
        }

        return classification === "GOOD" || classification === "WARNING" || classification === "BAD";
    });
}

export function buildReportV2(
    rawLogs: Parameters<typeof buildReport>[0],
    woDetailsMap: Map<number, WoDetails>,
    config: ReportConfig,
): BuildReportV2Result {
    const { rows, stats } = buildReport(rawLogs, woDetailsMap, config);
    const orderedRows = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    const historyByKey = new Map<string, number[]>();

    for (const row of orderedRows) {
        decorateRowClassification(row, woDetailsMap, config, historyByKey);
    }

    const counts = createEmptyCounts();
    const cycleRows = rows.filter(isCycleRow);
    for (const row of cycleRows) {
        counts[getRowClassification(row)] += 1;
    }

    const totalCycles = cycleRows.length;
    const totalCycleSec = cycleRows.reduce((sum, row) => sum + (row.durationSec || 0), 0);
    const unknownRatio = totalCycles > 0 ? counts.UNKNOWN / totalCycles : 0;

    const hubSummary: ReportV2HubSummary = {
        totalLogs: stats.totalLogs,
        totalJobs: stats.totalJobs,
        totalCycles,
        avgCycleSec: totalCycles > 0 ? Math.round(totalCycleSec / totalCycles) : 0,
        totalCycleSec,
        goodCycles: counts.GOOD,
        warningCycles: counts.WARNING,
        badCycles: counts.BAD,
        unknownCycles: counts.UNKNOWN,
        goodRatePct: toPercent(counts.GOOD, totalCycles),
        unknownRatioPct: toPercent(counts.UNKNOWN, totalCycles),
        latestCycles: [...cycleRows].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50),
    };

    const telemetry: ReportV2Telemetry = {
        totalRows: rows.length,
        totalCycles,
        unknownRatio,
        counts,
    };

    return {
        rows,
        stats,
        filterableRows: rows,
        hubSummary,
        telemetry,
    };
}
