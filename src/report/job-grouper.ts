import { JobBlock, SpindleCycle, WoDetails } from "./report-types";

const MAX_CYCLES_PER_JOB = 4;
const MAX_GAP_SEC = 900; // 15 min

export interface GroupingOptions {
    toleranceSec?: number;
}

/**
 * FIX 1: Best-fit boundary job grouping.
 * Tracks the closest sum to PCL and closes at that point.
 * Stops when: sum >= PCL, cycles >= 4, or big gap to next cycle.
 */
export function groupCyclesIntoJobs(
    cycles: SpindleCycle[],
    woDetails: WoDetails,
    _options: GroupingOptions = {}
): JobBlock[] {
    const pcl = woDetails.pcl;
    const blocks: JobBlock[] = [];

    if (!pcl || pcl <= 0) {
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
                if (gapSec > MAX_GAP_SEC) break;
            }

            const cycle = cycles[idx]!;
            currentCycles.push(cycle);
            sumSec += cycle.durationSec;
            idx++;

            const err = Math.abs(sumSec - pcl);
            if (err < bestErr) {
                bestErr = err;
                bestEndIdx = currentCycles.length - 1;
                bestSum = sumSec;
            }

            // Condition A: crossed or hit target
            if (sumSec >= pcl) break;
            // Condition B: safety cap
            if (currentCycles.length >= MAX_CYCLES_PER_JOB) break;
        }

        if (currentCycles.length > 0 && bestEndIdx >= 0) {
            const jobCycles = currentCycles.slice(0, bestEndIdx + 1);
            blocks.push({
                label: `JOB - ${String(jobCounter++).padStart(2, '0')}`,
                cycles: jobCycles,
                totalSec: bestSum,
                varianceSec: bestSum - pcl,
                pcl,
            });

            // Return unused cycles for re-processing
            const unusedCount = currentCycles.length - (bestEndIdx + 1);
            idx -= unusedCount;
        }
    }

    return blocks;
}
