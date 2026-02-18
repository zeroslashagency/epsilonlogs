import { DeviceLogEntry, JobType, WoSegment } from "./report-types";

/**
 * Helper to map raw job type ID to string label.
 */
function mapJobType(typeId: number): WoSegment["jobType"] {
    switch (typeId) {
        case JobType.PRODUCTION: return "Production";
        case JobType.SETTING: return "Setting";
        case JobType.CALIBRATION: return "Calibration";
        case JobType.MAINTENANCE: return "Maintenance";
        default: return "Other";
    }
}

/**
 * FIX 6: Scope jobs strictly inside WO_START..WO_STOP.
 * Uses state-machine scan. Logs outside any START..STOP go to fallback.
 */
export function segmentLogs(logs: DeviceLogEntry[]): WoSegment[] {
    const segments: WoSegment[] = [];
    let activeSegment: WoSegment | null = null;
    const unassignedLogs: DeviceLogEntry[] = [];

    for (const log of logs) {
        if (log.action === "WO_START") {
            if (activeSegment) {
                segments.push(activeSegment);
                activeSegment = null;
            }
            // Parse job_type from log (API returns string or number)
            const rawType = log.job_type ? parseInt(String(log.job_type), 10) : JobType.PRODUCTION;

            activeSegment = {
                woId: log.wo_id,
                logs: [log],
                spindleCycles: [],
                pausePeriods: [],
                jobType: mapJobType(rawType),
                rawJobType: rawType,
            };
        } else if (log.action === "WO_STOP") {
            if (activeSegment && activeSegment.woId === log.wo_id) {
                activeSegment.logs.push(log);
                segments.push(activeSegment);
                activeSegment = null;
            } else {
                unassignedLogs.push(log);
            }
        } else {
            if (activeSegment && activeSegment.woId === log.wo_id) {
                activeSegment.logs.push(log);
            } else {
                unassignedLogs.push(log);
            }
        }
    }

    if (activeSegment) {
        segments.push(activeSegment);
    }

    // Fallback: group unassigned by wo_id (handles WO_START outside date range)
    if (unassignedLogs.length > 0) {
        const byWo = new Map<number, DeviceLogEntry[]>();
        for (const log of unassignedLogs) {
            const woId = log.wo_id || 0;
            const list = byWo.get(woId) || [];
            list.push(log);
            byWo.set(woId, list);
        }
        for (const [woId, woLogs] of byWo) {
            const hasSpindle = woLogs.some(l =>
                l.action === "SPINDLE_ON" || l.action === "SPINDLE_OFF"
            );
            // Fallback assumes Production if spindle activity exists
            const fallbackType = woId && hasSpindle ? JobType.PRODUCTION : JobType.PRODUCTION;

            segments.push({
                woId,
                logs: woLogs.sort((a, b) =>
                    new Date(a.log_time).getTime() - new Date(b.log_time).getTime()
                ),
                spindleCycles: [],
                pausePeriods: [],
                jobType: mapJobType(fallbackType),
                rawJobType: fallbackType,
            });
        }
    }

    segments.sort((a, b) => {
        const tA = a.logs[0] ? new Date(a.logs[0].log_time).getTime() : 0;
        const tB = b.logs[0] ? new Date(b.logs[0].log_time).getTime() : 0;
        return tA - tB;
    });

    return segments;
}
