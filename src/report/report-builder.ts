import { DeviceLogEntry, OperatorSummary, ReportConfig, ReportRow, ReportStats, WoBreakdown, WoDetails } from "./report-types";
import { normalizeLogs } from "./log-normalizer";
import { segmentLogs } from "./wo-segmenter";
import { pairSpindleCycles } from "./spindle-pairer";
import { groupCyclesIntoJobs } from "./job-grouper";
import { injectComputedRows } from "./computed-row-injector";
import { annotateExtensions } from "./extension-annotator";

/**
 * Orchestrates the report generation pipeline.
 */
export function buildReport(
    rawLogs: DeviceLogEntry[],
    woDetailsMap: Map<number, WoDetails>,
    config: ReportConfig
): { rows: ReportRow[]; stats: ReportStats } {

    // 1. Normalize (dedupe, sort ASC)
    const logs = normalizeLogs(rawLogs);
    console.log(`Normalized ${logs.length} logs`);

    // 2. Segment by WO_START..WO_STOP
    const segments = segmentLogs(logs);
    console.log(`Created ${segments.length} segments:`, segments.map(s => `WO ${s.woId} (${s.jobType}, ${s.logs.length} logs)`));

    let allRows: ReportRow[] = [];
    const woBreakdowns: WoBreakdown[] = [];
    const operatorMap = new Map<string, {
        woCount: number;
        totalJobs: number;
        totalCycles: number;
        totalCuttingSec: number;
        totalPauseSec: number;
    }>();

    let totalJobs = 0;
    let totalCycles = 0;
    let totalCuttingSec = 0;
    let totalPauseSec = 0;
    let totalLoadingUnloadingSec = 0;
    let totalIdleSec = 0;
    let totalWoDurationSec = 0;
    let totalAllotedQty = 0;
    let totalOkQty = 0;
    let totalRejectQty = 0;

    // 3. Process each segment
    for (const segment of segments) {
        if (segment.jobType === "Production") {
            // A. Pair Cycles & Pauses
            pairSpindleCycles(segment);

            const segCuttingSec = segment.spindleCycles.reduce((sum, c) => sum + c.durationSec, 0);
            const segPauseSec = segment.pausePeriods.reduce((sum, p) => sum + p.durationSec, 0);

            totalCycles += segment.spindleCycles.length;
            totalCuttingSec += segCuttingSec;
            totalPauseSec += segPauseSec;

            // B. Get WO Details
            const details = woDetailsMap.get(segment.woId) || {
                id: segment.woId,
                pcl: null,
                start_time: null,
                end_time: null,
                extensions: [],
                wo_id_str: String(segment.woId),
                part_no: "",
                start_name: "",
                stop_name: "",
                start_comment: "",
                stop_comment: "",
                setting: "",
                alloted_qty: 0,
                ok_qty: 0,
                reject_qty: 0,
                device_id: 0,
                duration: 0,
            };

            totalWoDurationSec += details.duration;
            totalAllotedQty += details.alloted_qty;
            totalOkQty += details.ok_qty;
            totalRejectQty += details.reject_qty;

            // C. Group into Jobs
            const blocks = groupCyclesIntoJobs(segment.spindleCycles, details, {
                toleranceSec: config.toleranceSec
            });
            totalJobs += blocks.length;

            // D. Inject Computed Rows (pass woDetails for headers/summaries)
            let rows = injectComputedRows(segment, blocks, details);

            // E. Annotate break/extension comments
            rows = annotateExtensions(rows, details);

            // F. Compute loading & idle from computed rows
            let segLoadingSec = 0;
            let segIdleSec = 0;
            for (const row of rows) {
                if (row.isComputed && row.label) {
                    const durMatch = row.durationText;
                    const secs = parseDurationToSec(durMatch);
                    if (row.label.toLowerCase().includes("loading")) {
                        segLoadingSec += secs;
                    } else if (row.label.toLowerCase().includes("idle") || row.label.toLowerCase().includes("break")) {
                        segIdleSec += secs;
                    }
                }
            }
            totalLoadingUnloadingSec += segLoadingSec;
            totalIdleSec += segIdleSec;

            // G. Build WO Breakdown
            const operatorName = details.start_name || "Unknown";
            woBreakdowns.push({
                woId: details.wo_id_str,
                partNo: details.part_no,
                operator: operatorName,
                setting: details.setting,
                jobs: blocks.length,
                cycles: segment.spindleCycles.length,
                cuttingSec: segCuttingSec,
                pauseSec: segPauseSec,
                loadingSec: segLoadingSec,
                allotedQty: details.alloted_qty,
                okQty: details.ok_qty,
                rejectQty: details.reject_qty,
                pcl: details.pcl,
                avgCycleSec: segment.spindleCycles.length > 0
                    ? segCuttingSec / segment.spindleCycles.length
                    : 0,
                startTime: details.start_time
                    ? new Date(details.start_time).toLocaleString("en-GB")
                    : "",
                endTime: details.end_time
                    ? new Date(details.end_time).toLocaleString("en-GB")
                    : "",
                durationSec: details.duration,
            });

            // H. Accumulate operator stats
            const existing = operatorMap.get(operatorName);
            if (existing) {
                existing.woCount += 1;
                existing.totalJobs += blocks.length;
                existing.totalCycles += segment.spindleCycles.length;
                existing.totalCuttingSec += segCuttingSec;
                existing.totalPauseSec += segPauseSec;
            } else {
                operatorMap.set(operatorName, {
                    woCount: 1,
                    totalJobs: blocks.length,
                    totalCycles: segment.spindleCycles.length,
                    totalCuttingSec: segCuttingSec,
                    totalPauseSec: segPauseSec,
                });
            }

            allRows.push(...rows);
        } else {
            // Unknown / orphan logs
            for (const log of segment.logs) {
                allRows.push({
                    rowId: `log-${log.log_id}`,
                    logId: log.log_id,
                    logTime: new Date(log.log_time),
                    action: log.action,
                    jobType: "Unknown",
                    originalLog: log,
                    timestamp: new Date(log.log_time).getTime(),
                });
            }
        }
    }

    // 4. Build operator summaries
    const operatorSummaries: OperatorSummary[] = [];
    operatorMap.forEach((data, name) => {
        operatorSummaries.push({
            name,
            woCount: data.woCount,
            totalJobs: data.totalJobs,
            totalCycles: data.totalCycles,
            totalCuttingSec: data.totalCuttingSec,
            totalPauseSec: data.totalPauseSec,
            avgCycleSec: data.totalCycles > 0
                ? data.totalCuttingSec / data.totalCycles
                : 0,
        });
    });

    // 5. Calculate utilization
    const machineUtilization = totalWoDurationSec > 0
        ? Math.round((totalCuttingSec / totalWoDurationSec) * 100)
        : 0;

    const stats: ReportStats = {
        totalJobs,
        totalCycles,
        totalCuttingSec,
        totalPauseSec,
        totalLoadingUnloadingSec,
        totalIdleSec,
        totalWoDurationSec,
        machineUtilization,
        totalAllotedQty,
        totalOkQty,
        totalRejectQty,
        woBreakdowns,
        operatorSummaries,
    };

    // 6. Reverse chronological sort (latest on top)
    allRows.sort((a, b) => b.timestamp - a.timestamp);

    // 7. Assign S.No — skip computed/banner rows
    let sNoCounter = 1;
    allRows.forEach((row) => {
        if (row.isComputed || row.isWoHeader || row.isWoSummary || row.isPauseBanner) {
            row.sNo = undefined; // empty S.No
        } else {
            row.sNo = sNoCounter++;
        }
    });

    console.log(`Final report: ${allRows.length} rows, ${totalJobs} jobs, ${totalCycles} cycles`);
    return { rows: allRows, stats };
}

// --- Helper ---

/**
 * Parse a duration text like "7 min 31 sec" or "32 sec" into total seconds.
 */
function parseDurationToSec(durationText?: string): number {
    if (!durationText) return 0;
    let total = 0;
    const minMatch = durationText.match(/(\d+)\s*min/);
    const secMatch = durationText.match(/(\d+)\s*sec/);
    if (minMatch) total += parseInt(minMatch[1], 10) * 60;
    if (secMatch) total += parseInt(secMatch[1], 10);
    return total;
}
