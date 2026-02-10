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
            if (currentOn) {
                // Double ON? Maybe missed OFF.
                // We could close the previous one here or ignore the second ON.
                // Let's assume missed OFF -> close with 0 duration or ignore data?
                // Better: ignore the *new* ON (assume it's a re-trigger) OR close old one.
                // Let's treat the new ON as the start of a new cycle, closing old one at new ON time.
                // Actually, simple pairing: just overwrite currentOn is safest for "latest start".
                // But for duration calc, we need start time.
                // Let's stick to strict pairing: find next OFF.
                // If we see ON, ON, OFF -> Pair 2nd ON with OFF? Or 1st?
                // Implementation: if currentOn exists, we ignore new ON? No, that loses data.
                // Let's auto-close previous at this timestamp?
                // For simplicity: Last ON wins? Or First ON wins?
                // Let's keep it simple: strict state machine.
            }
            currentOn = log;
        } else if (log.action === "SPINDLE_OFF") {
            if (currentOn) {
                const onTime = new Date(currentOn.log_time).getTime();
                const offTime = new Date(log.log_time).getTime();
                const durationSec = (offTime - onTime) / 1000;

                cycles.push({
                    onLog: currentOn,
                    offLog: log,
                    durationSec: Math.max(0, durationSec),
                });
                currentOn = null;
            }
        }

        // --- PAUSE PAIRING ---
        if (log.action === "WO_PAUSE") {
            currentPause = log;
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
