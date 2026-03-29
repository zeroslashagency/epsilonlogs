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

    // Fallback: preserve contiguous orphan runs instead of merging every
    // unassigned event for a WO into one synthetic segment.
    if (unassignedLogs.length > 0) {
        const sortedUnassigned = [...unassignedLogs].sort((a, b) => {
            const tA = new Date(a.log_time).getTime();
            const tB = new Date(b.log_time).getTime();
            if (tA !== tB) {
                return tA - tB;
            }
            return a.log_id - b.log_id;
        });

        const fallbackClusters: DeviceLogEntry[][] = [];
        let currentCluster: DeviceLogEntry[] = [];

        const flushCluster = () => {
            if (currentCluster.length > 0) {
                fallbackClusters.push(currentCluster);
                currentCluster = [];
            }
        };

        for (const log of sortedUnassigned) {
            const prev = currentCluster[currentCluster.length - 1];
            const startsNewCluster =
                !prev ||
                prev.wo_id !== log.wo_id ||
                prev.action === "WO_STOP" ||
                prev.action === "MTR_OFF" ||
                log.action === "WO_START" ||
                log.action === "MTR_ON";

            if (startsNewCluster) {
                flushCluster();
            }

            currentCluster.push(log);
        }

        flushCluster();

        for (const cluster of fallbackClusters) {
            const woId = cluster[0]?.wo_id || 0;
            const fallbackType = cluster
                .map(parsePositiveJobType)
                .find((typeId): typeId is number => typeId != null) ?? JobType.PRODUCTION;

            segments.push({
                woId,
                logs: cluster,
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
