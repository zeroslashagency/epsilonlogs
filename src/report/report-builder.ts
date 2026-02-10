import { DeviceLogEntry, ReportConfig, ReportRow, ReportStats, WoDetails } from "./report-types";
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
    const stats: ReportStats = {
        totalJobs: 0,
        totalCycles: 0,
        totalCuttingSec: 0,
    };

    // 3. Process each segment
    for (const segment of segments) {
        if (segment.jobType === "Production") {
            // A. Pair Cycles & Pauses
            pairSpindleCycles(segment);

            stats.totalCycles += segment.spindleCycles.length;
            stats.totalCuttingSec += segment.spindleCycles.reduce((sum, c) => sum + c.durationSec, 0);

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
                setting: "",
                alloted_qty: 0,
                ok_qty: 0,
                reject_qty: 0,
                device_id: 0,
                duration: 0,
            };

            // C. Group into Jobs
            const blocks = groupCyclesIntoJobs(segment.spindleCycles, details, {
                toleranceSec: config.toleranceSec
            });
            stats.totalJobs += blocks.length;

            // D. Inject Computed Rows (pass woDetails for headers/summaries)
            let rows = injectComputedRows(segment, blocks, details);

            // E. Annotate break/extension comments
            rows = annotateExtensions(rows, details);

            allRows.push(...rows);
        } else {
            // Unknown / orphan logs
            for (const log of segment.logs) {
                allRows.push({
                    rowId: `log-${log.id}`,
                    logId: log.id,
                    logTime: new Date(log.log_time),
                    action: log.action,
                    jobType: "Unknown",
                    originalLog: log,
                    timestamp: new Date(log.log_time).getTime(),
                });
            }
        }
    }

    // 4. Reverse chronological sort (latest on top)
    allRows.sort((a, b) => b.timestamp - a.timestamp);

    // 5. Assign S.No — skip computed/banner rows
    let sNoCounter = 1;
    allRows.forEach((row) => {
        if (row.isComputed || row.isWoHeader || row.isWoSummary || row.isPauseBanner) {
            row.sNo = undefined; // empty S.No
        } else {
            row.sNo = sNoCounter++;
        }
    });

    console.log(`Final report: ${allRows.length} rows, ${stats.totalJobs} jobs, ${stats.totalCycles} cycles`);
    return { rows: allRows, stats };
}
