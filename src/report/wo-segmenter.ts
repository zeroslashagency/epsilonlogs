import { DeviceLogEntry, JobType, WoSegment, mapRawJobTypeToLabel } from "./report-types";

function parsePositiveJobType(log: DeviceLogEntry): number | null {
    const parsedType = log.job_type != null ? parseInt(String(log.job_type), 10) : NaN;
    return Number.isFinite(parsedType) && parsedType > 0 ? parsedType : null;
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
            const rawType = parsePositiveJobType(log) ?? JobType.PRODUCTION;

            activeSegment = {
                woId: log.wo_id,
                logs: [log],
                spindleCycles: [],
                pausePeriods: [],
                jobType: mapRawJobTypeToLabel(rawType),
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
        } else if (log.action === "MTR_ON") {
            // Maintenance start — treat like WO_START with job_type=MAINTENANCE
            if (activeSegment) {
                segments.push(activeSegment);
                activeSegment = null;
            }
            const mtrType = log.job_type != null ? parseInt(String(log.job_type), 10) : NaN;
            const mtrRawType = Number.isFinite(mtrType) && mtrType > 0 ? mtrType : JobType.MAINTENANCE;

            activeSegment = {
                woId: log.wo_id,
                logs: [log],
                spindleCycles: [],
                pausePeriods: [],
                jobType: mapRawJobTypeToLabel(mtrRawType),
                rawJobType: mtrRawType,
            };
        } else if (log.action === "MTR_OFF") {
            // Maintenance end — treat like WO_STOP
            if (activeSegment && activeSegment.woId === log.wo_id) {
                activeSegment.logs.push(log);
                segments.push(activeSegment);
                activeSegment = null;
            } else {
                unassignedLogs.push(log);
            }
        } else {
            if (activeSegment && activeSegment.woId === log.wo_id) {
                const logJobType = parsePositiveJobType(log);
                if (logJobType != null && (activeSegment.rawJobType == null || activeSegment.rawJobType === JobType.PRODUCTION)) {
                    activeSegment.rawJobType = logJobType;
                    activeSegment.jobType = mapRawJobTypeToLabel(logJobType);
                }
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
            const fallbackType = woLogs
                .map(parsePositiveJobType)
                .find((typeId): typeId is number => typeId != null) ?? JobType.PRODUCTION;

            segments.push({
                woId,
                logs: woLogs.sort((a, b) =>
                    new Date(a.log_time).getTime() - new Date(b.log_time).getTime()
                ),
                spindleCycles: [],
                pausePeriods: [],
                jobType: mapRawJobTypeToLabel(fallbackType),
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
