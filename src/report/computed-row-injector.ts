import { DeviceLogEntry, JobBlock, PausePeriod, ReportRow, SpindleCycle, WoDetails, WoSegment } from "./report-types.js";

const MAX_LOADING_GAP_SEC = 900;    // 15 min
const SHIFT_BREAK_SEC = 120 * 60;   // 120 min

/**
 * Transforms JobBlocks into ReportRows with:
 * - WO Header banner at WO_START
 * - WO Summary banner at WO_STOP
 * - Pause banners with reason + duration
 * - Loading/Unloading with boundary checks
 * - Operator name on all rows
 * - jobBlockLabel for visual grouping
 * - isComputed flag for S.No skip
 */
export function injectComputedRows(
    segment: WoSegment,
    jobBlocks: JobBlock[],
    woDetails?: WoDetails
): ReportRow[] {
    const rows: ReportRow[] = [];
    const operator = woDetails?.start_name || "";

    const woStartLog = segment.logs.find((l: DeviceLogEntry) => l.action === "WO_START");
    const woStopLog = segment.logs.find((l: DeviceLogEntry) => l.action === "WO_STOP");

    // Pre-calculate woSpecs for all rows in this segment
    let woSpecs: { woId: string; pclText: string; allotted: number } | undefined = undefined;
    if (woDetails) {
        const pclSec = woDetails.pcl || 0;
        const pclMinutes = Math.floor(pclSec / 60);
        const pclSeconds = Math.round(pclSec % 60);
        woSpecs = {
            woId: woDetails.wo_id_str,
            pclText: `${pclMinutes} min ${pclSeconds} sec`,
            allotted: woDetails.alloted_qty
        };
    }

    // 1. WO Header banner (at WO_START)
    if (woStartLog && woDetails) {
        const pclSec = woDetails.pcl || 0;
        rows.push({
            rowId: `wo-header-${segment.woId}`,
            logTime: new Date(woStartLog.log_time),
            jobType: segment.jobType,
            timestamp: new Date(woStartLog.log_time).getTime() - 1,
            isWoHeader: true,
            operatorName: operator,
            woSpecs,
            woHeaderData: {
                woIdStr: woDetails.wo_id_str,
                partNo: woDetails.part_no,
                operatorName: operator,
                pclText: fmtDur(pclSec),
                setting: woDetails.setting,
                deviceId: woDetails.device_id,
                startComment: woDetails.start_comment,
            },
        });
    }

    // 2. WO_START row
    if (woStartLog) {
        let summaryText = woDetails?.start_comment || "";
        rows.push({
            rowId: `log-${woStartLog.log_id}`,
            logId: woStartLog.log_id,
            logTime: new Date(woStartLog.log_time),
            action: "WO_START",
            jobType: segment.jobType,
            originalLog: woStartLog,
            timestamp: new Date(woStartLog.log_time).getTime(),
            operatorName: operator,
            summary: summaryText,
            woSpecs: woSpecs
        });
    }

    // 3. Ideal Time
    const firstCycle = jobBlocks[0]?.cycles[0];
    if (firstCycle) {
        const refTime = woStartLog
            ? new Date(woStartLog.log_time).getTime()
            : new Date(segment.logs[0]!.log_time).getTime();
        const firstOnTs = new Date(firstCycle.onLog.log_time).getTime();
        const idealSec = (firstOnTs - refTime) / 1000;
        if (idealSec > 0) {
            rows.push({
                rowId: `computed-ideal-${segment.woId}`,
                logTime: new Date(refTime + 1000),
                action: "",
                durationText: fmtDur(idealSec),
                label: "Ideal Time",
                summary: fmtDur(idealSec),
                jobType: segment.jobType,
                timestamp: refTime + 1000,
                isComputed: true,
                operatorName: operator,
                woSpecs,
            });
        }
    }

    // 4. Job Blocks + cycles + gaps
    for (let bIdx = 0; bIdx < jobBlocks.length; bIdx++) {
        const block = jobBlocks[bIdx]!;

        for (let cIdx = 0; cIdx < block.cycles.length; cIdx++) {
            const cycle = block.cycles[cIdx]!;
            const isFinal = cIdx === block.cycles.length - 1;

            // SPINDLE_ON — variance on final cycle
            rows.push({
                rowId: `log-${cycle.onLog.log_id}`,
                logId: cycle.onLog.log_id,
                logTime: new Date(cycle.onLog.log_time),
                action: "SPINDLE_ON",
                label: block.label,
                jobType: segment.jobType,
                isJobBlock: true,
                jobBlockLabel: block.label,
                originalLog: cycle.onLog,
                timestamp: new Date(cycle.onLog.log_time).getTime(),
                summary: isFinal && block.pcl ? fmtVariance(block.varianceSec) : undefined,
                varianceColor: isFinal && block.pcl ? varColor(block.varianceSec) : undefined,
                operatorName: operator,
                woSpecs,
            });

            // SPINDLE_OFF — total on final cycle
            rows.push({
                rowId: `log-${cycle.offLog.log_id}`,
                logId: cycle.offLog.log_id,
                logTime: new Date(cycle.offLog.log_time),
                action: "SPINDLE_OFF",
                label: block.label,
                durationText: fmtDur(cycle.durationSec),
                jobType: segment.jobType,
                isJobBlock: true,
                jobBlockLabel: block.label,
                originalLog: cycle.offLog,
                timestamp: new Date(cycle.offLog.log_time).getTime(),
                summary: isFinal && block.pcl ? fmtDur(block.totalSec) : undefined,
                operatorName: operator,
                woSpecs,
            });

            // Loading/Unloading gap
            const nextCycle = !isFinal
                ? block.cycles[cIdx + 1]
                : bIdx < jobBlocks.length - 1 ? jobBlocks[bIdx + 1]!.cycles[0] : null;

            if (nextCycle) {
                const offTs = new Date(cycle.offLog.log_time).getTime();
                const nextOnTs = new Date(nextCycle.onLog.log_time).getTime();
                const gapSec = (nextOnTs - offTs) / 1000;

                const intervening = segment.logs.filter((l: DeviceLogEntry) => {
                    const ts = new Date(l.log_time).getTime();
                    return ts > offTs && ts < nextOnTs &&
                        ["WO_PAUSE", "WO_RESUME", "WO_STOP", "WO_START"].includes(l.action);
                });

                const hasPause = intervening.some((l: DeviceLogEntry) => l.action === "WO_PAUSE");
                const hasStop = intervening.some((l: DeviceLogEntry) => l.action === "WO_STOP");

                // Determine effective block label for gap rows:
                // If next cycle is in SAME block, include gap in that block.
                // If next cycle is in NEW block, gap is outside?
                // The issue was visual discontinuity. If we give it the CURRENT block's label, it extends the green line.
                // But only if next cycle is ALSO the same label?
                // Actually, if we give it the label, it will be wrapped. That's what we want if it's "part of the job".
                const gapLabel = (!isFinal) ? block.label : undefined;

                if (hasStop) {
                    // skip
                } else if (hasPause) {
                    const pauseEvt = intervening.find((l: DeviceLogEntry) => l.action === "WO_PAUSE");
                    const resumeEvt = intervening.find((l: DeviceLogEntry) => l.action === "WO_RESUME");
                    if (pauseEvt) {
                        const preSec = (new Date(pauseEvt.log_time).getTime() - offTs) / 1000;
                        if (preSec > 0 && preSec <= MAX_LOADING_GAP_SEC) {
                            rows.push(makeGapRow(`pre-${cycle.offLog.log_id}`, offTs + 500, preSec, "Loading /Unloading Time", segment.jobType, operator, woSpecs, gapLabel));
                        }
                    }
                    if (resumeEvt) {
                        const postSec = (nextOnTs - new Date(resumeEvt.log_time).getTime()) / 1000;
                        if (postSec > 0 && postSec <= MAX_LOADING_GAP_SEC) {
                            rows.push(makeGapRow(`post-${resumeEvt.log_id}`, new Date(resumeEvt.log_time).getTime() + 500, postSec, "Loading /Unloading Time", segment.jobType, operator, woSpecs, gapLabel)); // Should this extend block? Only if next is same.
                        }
                    }
                } else if (gapSec > 0 && gapSec <= MAX_LOADING_GAP_SEC) {
                    // This is the standard intra-job loading time. Give it the block label.
                    rows.push(makeGapRow(`load-${cycle.offLog.log_id}`, offTs + 500, gapSec, "Loading /Unloading Time", segment.jobType, operator, woSpecs, gapLabel));
                } else if (gapSec > MAX_LOADING_GAP_SEC) {
                    rows.push(makeGapRow(`idle-${cycle.offLog.log_id}`, offTs + 500, gapSec, "Idle/Break Time", segment.jobType, operator, woSpecs, undefined)); // Break breaks the block
                }
            }
        }
    }

    // 5. Pause/Resume events + Pause Banners
    const pauseResumeLogs = segment.logs.filter((l: DeviceLogEntry) =>
        l.action === "WO_PAUSE" || l.action === "WO_RESUME"
    );

    for (const log of pauseResumeLogs) {
        let durationText: string | undefined;
        let pauseBannerData = undefined;

        if (log.action === "WO_PAUSE") {
            const pair = segment.pausePeriods.find((p: PausePeriod) => p.pauseLog.log_id === log.log_id);
            if (pair) {
                durationText = fmtDur(pair.durationSec);
                const isShiftBreak = pair.durationSec > SHIFT_BREAK_SEC;

                // Find reason from WO extensions
                const reason = findPauseReason(log, woDetails);

                // Insert a Pause Banner row just before the pause event
                rows.push({
                    rowId: `pause-banner-${log.log_id}`,
                    logTime: new Date(log.log_time),
                    jobType: segment.jobType,
                    timestamp: new Date(log.log_time).getTime() - 1,
                    isPauseBanner: true,
                    isComputed: true,
                    operatorName: operator,
                    woSpecs,
                    pauseBannerData: {
                        reason: reason || (isShiftBreak ? "Shift Break / Machine Off" : "Paused"),
                        durationText: fmtDur(pair.durationSec),
                        isShiftBreak,
                    },
                });
            }
        }

        // Also add the raw event row
        rows.push({
            rowId: `log-${log.log_id}`,
            logId: log.log_id,
            logTime: new Date(log.log_time),
            action: log.action,
            durationText,
            jobType: segment.jobType,
            originalLog: log,
            timestamp: new Date(log.log_time).getTime(),
            operatorName: operator,
            woSpecs,
        });
    }

    // 6. WO_STOP row
    if (woStopLog) {
        rows.push({
            rowId: `log-${woStopLog.log_id}`,
            logId: woStopLog.log_id,
            logTime: new Date(woStopLog.log_time),
            action: "WO_STOP",
            jobType: segment.jobType,
            originalLog: woStopLog,
            timestamp: new Date(woStopLog.log_time).getTime(),
            operatorName: operator,
            summary: woDetails?.stop_comment,
            woSpecs,
        });
    }

    // 7. WO Summary banner (after WO_STOP)
    if (woStopLog && woDetails) {
        const totalPauseSec = segment.pausePeriods.reduce((s: number, p: PausePeriod) => s + p.durationSec, 0);
        const pauseReasons = segment.pausePeriods
            .map((p: PausePeriod) => findPauseReason(p.pauseLog, woDetails))
            .filter(Boolean) as string[];

        const totalCuttingSec = segment.spindleCycles.reduce((s: number, c: SpindleCycle) => s + c.durationSec, 0);

        rows.push({
            rowId: `wo-summary-${segment.woId}`,
            logTime: new Date(woStopLog.log_time),
            jobType: segment.jobType,
            timestamp: new Date(woStopLog.log_time).getTime() + 1,
            isWoSummary: true,
            isComputed: true,
            operatorName: operator,
            woSpecs,
            woSummaryData: {
                woIdStr: woDetails.wo_id_str,
                partNo: woDetails.part_no,
                operatorName: operator,
                setting: woDetails.setting,
                deviceId: woDetails.device_id,
                startTime: woDetails.start_time
                    ? new Date(woDetails.start_time).toLocaleString("en-GB")
                    : "",
                endTime: woDetails.end_time
                    ? new Date(woDetails.end_time).toLocaleString("en-GB")
                    : "",
                totalDuration: fmtDur(woDetails.duration),
                totalJobs: jobBlocks.length,
                totalCycles: segment.spindleCycles.length,
                totalCuttingTime: fmtDur(totalCuttingSec),
                allotedQty: woDetails.alloted_qty,
                okQty: woDetails.ok_qty,
                rejectQty: woDetails.reject_qty,
                totalPauseTime: totalPauseSec > 0 ? fmtDur(totalPauseSec) : "0 sec",
                pauseReasons,
                stopComment: woDetails.stop_comment,
            },
        });
    }

    return rows.sort((a, b) => a.timestamp - b.timestamp);
}

// --- Helpers ---

function findPauseReason(pauseLog: { log_time: string }, woDetails?: WoDetails): string | null {
    if (!woDetails?.extensions?.length) return null;
    const pauseTs = new Date(pauseLog.log_time).getTime();
    let best: { comment: string; diff: number } | null = null;

    for (const ext of woDetails.extensions) {
        if (!ext.extension_time || !ext.extension_comment) continue;
        const extTs = new Date(ext.extension_time).getTime();
        const diff = Math.abs(extTs - pauseTs);
        if (diff < 5 * 60 * 1000 && (!best || diff < best.diff)) {
            best = { comment: ext.extension_comment, diff };
        }
    }
    return best?.comment || null;
}

function makeGapRow(idSuffix: string, ts: number, sec: number, label: string, jobType: "Production" | "Unknown", operator: string, woSpecs?: { woId: string; pclText: string; allotted: number }, jobBlockLabel?: string): ReportRow {
    return {
        rowId: `computed-${idSuffix}`,
        logTime: new Date(ts),
        action: "",
        durationText: fmtDur(sec),
        label,
        summary: fmtDur(sec),
        jobType,
        timestamp: ts,
        isComputed: true,
        operatorName: operator,
        woSpecs,
        jobBlockLabel,
    };
}

function fmtDur(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m > 0) return `${m} min ${s} sec`;
    return `${s} sec`;
}

function fmtVariance(diff: number | null): string | undefined {
    if (diff === null) return undefined;
    const abs = Math.round(Math.abs(diff));
    if (diff > 0) return `${abs} sec excess`;
    if (diff < 0) return `${abs} sec lower`;
    return `0 sec`;
}

function varColor(diff: number | null): "red" | "green" | "neutral" | undefined {
    if (diff === null) return undefined;
    if (diff > 0) return "red";
    if (diff < 0) return "green";
    return "neutral";
}
