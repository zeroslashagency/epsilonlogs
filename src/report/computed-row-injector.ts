import { JobBlock, ReportRow, SpindleCycle, WoSegment } from "./report-types";

const MAX_LOADING_GAP_SEC = 900;    // 15 min
const SHIFT_BREAK_SEC = 120 * 60;   // 120 min

/**
 * FIX 2, 3, 5: Transforms JobBlocks into ReportRows with correct
 * Loading/Unloading boundaries, shift break detection, and display positions.
 */
export function injectComputedRows(
    segment: WoSegment,
    jobBlocks: JobBlock[]
): ReportRow[] {
    const rows: ReportRow[] = [];

    const woStartLog = segment.logs.find(l => l.action === "WO_START");
    const woStopLog = segment.logs.find(l => l.action === "WO_STOP");

    // 1. WO_START row
    if (woStartLog) {
        rows.push({
            rowId: `log-${woStartLog.id}`,
            logId: woStartLog.id,
            logTime: new Date(woStartLog.log_time),
            action: "WO_START",
            jobType: segment.jobType,
            originalLog: woStartLog,
            timestamp: new Date(woStartLog.log_time).getTime(),
            label: ""
        });
    }

    // 2. Ideal Time (gap before first spindle)
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
                timestamp: refTime + 1000
            });
        }
    }

    // 3. Job Blocks, cycles, and gaps
    for (let bIdx = 0; bIdx < jobBlocks.length; bIdx++) {
        const block = jobBlocks[bIdx]!;

        for (let cIdx = 0; cIdx < block.cycles.length; cIdx++) {
            const cycle = block.cycles[cIdx]!;
            const isFinal = cIdx === block.cycles.length - 1;

            // FIX 5: Variance on FINAL cycle's SPINDLE_ON
            rows.push({
                rowId: `log-${cycle.onLog.id}`,
                logId: cycle.onLog.id,
                logTime: new Date(cycle.onLog.log_time),
                action: "SPINDLE_ON",
                label: block.label,
                jobType: segment.jobType,
                isJobBlock: true,
                originalLog: cycle.onLog,
                timestamp: new Date(cycle.onLog.log_time).getTime(),
                summary: isFinal && block.pcl ? fmtVariance(block.varianceSec) : undefined,
                varianceColor: isFinal && block.pcl ? varColor(block.varianceSec) : undefined
            });

            // FIX 5: Total on FINAL cycle's SPINDLE_OFF
            rows.push({
                rowId: `log-${cycle.offLog.id}`,
                logId: cycle.offLog.id,
                logTime: new Date(cycle.offLog.log_time),
                action: "SPINDLE_OFF",
                label: block.label,
                durationText: fmtDur(cycle.durationSec),
                jobType: segment.jobType,
                isJobBlock: true,
                originalLog: cycle.offLog,
                timestamp: new Date(cycle.offLog.log_time).getTime(),
                summary: isFinal && block.pcl ? fmtDur(block.totalSec) : undefined
            });

            // FIX 2: Loading/Unloading — respect boundaries
            let nextCycle: SpindleCycle | null = null;
            if (!isFinal) {
                nextCycle = block.cycles[cIdx + 1]!;
            } else if (bIdx < jobBlocks.length - 1) {
                nextCycle = jobBlocks[bIdx + 1]!.cycles[0]!;
            }

            if (nextCycle) {
                const offTs = new Date(cycle.offLog.log_time).getTime();
                const nextOnTs = new Date(nextCycle.onLog.log_time).getTime();
                const gapSec = (nextOnTs - offTs) / 1000;

                // Check for intervening WO_PAUSE/WO_STOP/WO_START
                const intervening = segment.logs.filter(l => {
                    const ts = new Date(l.log_time).getTime();
                    return ts > offTs && ts < nextOnTs &&
                        ["WO_PAUSE", "WO_RESUME", "WO_STOP", "WO_START"].includes(l.action);
                });

                const hasPause = intervening.some(l => l.action === "WO_PAUSE");
                const hasStop = intervening.some(l => l.action === "WO_STOP");

                if (hasStop) {
                    // Don't insert loading row across WO_STOP
                } else if (hasPause) {
                    // Split gap around pause
                    const pauseEvt = intervening.find(l => l.action === "WO_PAUSE");
                    const resumeEvt = intervening.find(l => l.action === "WO_RESUME");

                    if (pauseEvt) {
                        const pauseTs = new Date(pauseEvt.log_time).getTime();
                        const preSec = (pauseTs - offTs) / 1000;
                        if (preSec > 0 && preSec <= MAX_LOADING_GAP_SEC) {
                            rows.push(makeGapRow(`pre-${cycle.offLog.id}`, offTs + 500, preSec, "Loading /Unloading Time", segment.jobType));
                        }
                    }
                    if (resumeEvt) {
                        const resumeTs = new Date(resumeEvt.log_time).getTime();
                        const postSec = (nextOnTs - resumeTs) / 1000;
                        if (postSec > 0 && postSec <= MAX_LOADING_GAP_SEC) {
                            rows.push(makeGapRow(`post-${resumeEvt.id}`, resumeTs + 500, postSec, "Loading /Unloading Time", segment.jobType));
                        }
                    }
                } else if (gapSec > 0 && gapSec <= MAX_LOADING_GAP_SEC) {
                    rows.push(makeGapRow(`load-${cycle.offLog.id}`, offTs + 500, gapSec, "Loading /Unloading Time", segment.jobType));
                } else if (gapSec > MAX_LOADING_GAP_SEC) {
                    rows.push(makeGapRow(`idle-${cycle.offLog.id}`, offTs + 500, gapSec, "Idle/Break Time", segment.jobType));
                }
            }
        }
    }

    // 4. WO_STOP row
    if (woStopLog) {
        rows.push({
            rowId: `log-${woStopLog.id}`,
            logId: woStopLog.id,
            logTime: new Date(woStopLog.log_time),
            action: "WO_STOP",
            jobType: segment.jobType,
            originalLog: woStopLog,
            timestamp: new Date(woStopLog.log_time).getTime(),
            label: ""
        });
    }

    // 5. PAUSE/RESUME events (FIX 3: detect shift breaks)
    const pauseResumeLogs = segment.logs.filter(l =>
        l.action === "WO_PAUSE" || l.action === "WO_RESUME"
    );

    for (const log of pauseResumeLogs) {
        let durationText: string | undefined;
        let label = "";

        if (log.action === "WO_PAUSE") {
            const pair = segment.pausePeriods.find(p => p.pauseLog.id === log.id);
            if (pair) {
                durationText = fmtDur(pair.durationSec);
                if (pair.durationSec > SHIFT_BREAK_SEC) {
                    label = "Shift Break / Machine Off";
                }
            }
        }

        rows.push({
            rowId: `log-${log.id}`,
            logId: log.id,
            logTime: new Date(log.log_time),
            action: log.action,
            durationText,
            jobType: segment.jobType,
            originalLog: log,
            timestamp: new Date(log.log_time).getTime(),
            label
        });
    }

    return rows.sort((a, b) => a.timestamp - b.timestamp);
}

// --- Helpers ---

function makeGapRow(idSuffix: string, ts: number, sec: number, label: string, jobType: "Production" | "Unknown"): ReportRow {
    return {
        rowId: `computed-${idSuffix}`,
        logTime: new Date(ts),
        action: "",
        durationText: fmtDur(sec),
        label,
        summary: fmtDur(sec),
        jobType,
        timestamp: ts,
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
