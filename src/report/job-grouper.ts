import { JobBlock, SpindleCycle, WoDetails } from "./report-types";
import { KeySplitDisableWindow } from "./key-actions";

const MAX_CYCLES_PER_JOB = 4;
const MAX_GAP_SEC = 900; // 15 min

export interface GroupingOptions {
    toleranceSec?: number;
    splitDisableWindows?: KeySplitDisableWindow[];
}

function isSplitDisabledForGap(
    _prevOffTs: number,
    nextOnTs: number,
    windows: KeySplitDisableWindow[],
): boolean {
    for (const window of windows) {
        const activeAtNextOn = window.startTs < nextOnTs && window.endTs >= nextOnTs;
        if (activeAtNextOn) {
            return true;
        }
    }
    return false;
}

/**
 * FIX 1: Best-fit boundary job grouping.
 * Tracks the closest sum to PCL and closes at that point.
 * Stops when: sum >= PCL, cycles >= 4, or big gap to next cycle.
 */
export function groupCyclesIntoJobs(
    cycles: SpindleCycle[],
    woDetails: WoDetails,
    options: GroupingOptions = {}
): JobBlock[] {
    const pcl = woDetails.pcl;

    // Logic: If Job Type 2 (Setting), use target_duration if available. 
    // Otherwise use PCL.
    let targetPcl: number | null = woDetails.pcl;
    if (woDetails.job_type === 2 && (woDetails.target_duration || 0) > 0) {
        targetPcl = woDetails.target_duration || null;
    }

    const blocks: JobBlock[] = [];

    if (!targetPcl || targetPcl <= 0) {
        let i = 1;
        for (const cycle of cycles) {
            blocks.push({
                label: `JOB - ${String(i++).padStart(2, '0')}`,
                cycles: [cycle],
                totalSec: cycle.durationSec,
                varianceSec: null,
                pcl: null,
            });
        }
        return blocks;
    }

    let jobCounter = 1;
    let idx = 0;

    while (idx < cycles.length) {
        const currentCycles: SpindleCycle[] = [];
        let sumSec = 0;
        let bestErr = Infinity;
        let bestEndIdx = -1;
        let bestSum = 0;

        while (idx < cycles.length) {
            // FIX 2 condition C: big gap before adding this cycle
            if (currentCycles.length > 0) {
                const lastCycle = currentCycles[currentCycles.length - 1]!;
                const lastOffTs = new Date(lastCycle.offLog.log_time).getTime();
                const thisOnTs = new Date(cycles[idx]!.onLog.log_time).getTime();
                const gapSec = (thisOnTs - lastOffTs) / 1000;
                const splitDisableWindows = options.splitDisableWindows || [];
                const splitDisabled = isSplitDisabledForGap(lastOffTs, thisOnTs, splitDisableWindows);
                if (gapSec > MAX_GAP_SEC && !splitDisabled) break;
            }

            const cycle = cycles[idx]!;
            currentCycles.push(cycle);
            sumSec += cycle.durationSec;
            idx++;

            const err = Math.abs(sumSec - targetPcl!);
            if (err < bestErr) {
                bestErr = err;
                bestEndIdx = currentCycles.length - 1;
                bestSum = sumSec;
            }

            // Condition A: crossed or hit target
            if (sumSec >= targetPcl!) break;
            // Condition B: safety cap
            if (currentCycles.length >= MAX_CYCLES_PER_JOB) break;
        }

        if (currentCycles.length > 0 && bestEndIdx >= 0) {
            const jobCycles = currentCycles.slice(0, bestEndIdx + 1);
            blocks.push({
                label: `JOB - ${String(jobCounter++).padStart(2, '0')}`,
                cycles: jobCycles,
                totalSec: bestSum,
                varianceSec: bestSum - targetPcl!,
                pcl: targetPcl,
            });

            // Return unused cycles for re-processing
            const unusedCount = currentCycles.length - (bestEndIdx + 1);
            idx -= unusedCount;
        }
    }

    return blocks;
}
