import { DeviceLogEntry, PausePeriod, SpindleCycle, WoSegment } from "./report-types";

/**
 * Pairs SPINDLE_ON with SPINDLE_OFF and WO_PAUSE with WO_RESUME within a segment.
 * Populates segment.spindleCycles and segment.pausePeriods.
 */
export function pairSpindleCycles(segment: WoSegment): void {
    const logs = segment.logs;
    const cycles: SpindleCycle[] = [];
    const pauses: PausePeriod[] = [];

    let currentOn: DeviceLogEntry | null = null;
    let currentPause: DeviceLogEntry | null = null;

    for (const log of logs) {
        // --- SPINDLE PAIRING ---
        if (log.action === "SPINDLE_ON") {
            if (!currentOn) {
                currentOn = log;
            }
        } else if (log.action === "SPINDLE_OFF") {
            if (currentOn) {
                const onTime = new Date(currentOn.log_time).getTime();
                const offTime = new Date(log.log_time).getTime();
                const durationSec = (offTime - onTime) / 1000;

                const cycle: SpindleCycle = {
                    onLog: currentOn,
                    offLog: log,
                    durationSec: Math.max(0, durationSec),
                };
                if (log.completionSource === "M30") {
                    cycle.completionSource = "M30";
                }
                cycles.push(cycle);
                currentOn = null;
            }
        }

        // --- PAUSE PAIRING ---
        if (log.action === "WO_PAUSE") {
            if (!currentPause) {
                currentPause = log;
            }
        } else if (log.action === "WO_RESUME") {
            if (currentPause) {
                const pauseTime = new Date(currentPause.log_time).getTime();
                const resumeTime = new Date(log.log_time).getTime();
                const durationSec = (resumeTime - pauseTime) / 1000;

                pauses.push({
                    pauseLog: currentPause,
                    resumeLog: log,
                    durationSec: Math.max(0, durationSec),
                });
                currentPause = null;
            }
        }
    }

    segment.spindleCycles = cycles;
    segment.pausePeriods = pauses;
}
