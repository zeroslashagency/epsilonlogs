import { DeviceLogEntry } from "./report-types";

/**
 * Normalizes raw API logs:
 * - Parses ISO timestamps to Date objects
 * - Sorts by log_time ASC
 * - Dedupes by log_id
 */
export function normalizeLogs(logs: DeviceLogEntry[]): DeviceLogEntry[] {
    // 1. Dedupe by log_id
    const seenIds = new Set<number>();
    const uniqueLogs: DeviceLogEntry[] = [];

    for (const log of logs) {
        const rawId = (log as { log_id?: unknown; id?: unknown }).log_id ?? (log as { id?: unknown }).id;
        const canonicalId = typeof rawId === "number" ? rawId : Number(rawId);
        if (!Number.isFinite(canonicalId)) {
            continue;
        }

        const rawWoId = (log as { wo_id?: unknown }).wo_id;
        const canonicalWoId = typeof rawWoId === "number" ? rawWoId : Number(rawWoId);
        const rawDeviceId = (log as { device_id?: unknown }).device_id;
        const canonicalDeviceId = typeof rawDeviceId === "number" ? rawDeviceId : Number(rawDeviceId);

        if (!seenIds.has(canonicalId)) {
            seenIds.add(canonicalId);
            uniqueLogs.push({
                ...log,
                log_id: canonicalId,
                wo_id: Number.isFinite(canonicalWoId) ? canonicalWoId : 0,
                device_id: Number.isFinite(canonicalDeviceId) ? canonicalDeviceId : 0,
            });
        }
    }

    // 2. Sort by time ASC
    return uniqueLogs.sort((a, b) => {
        const tA = new Date(a.log_time).getTime();
        const tB = new Date(b.log_time).getTime();
        if (tA !== tB) {
            return tA - tB;
        }
        return a.log_id - b.log_id;
    });
}

/**
 * Extracts distinct WO IDs from the logs.
 */
export function extractWoIds(logs: DeviceLogEntry[]): number[] {
    const ids = new Set<number>();
    for (const log of logs) {
        const rawWoId = (log as { wo_id?: unknown }).wo_id;
        const canonicalWoId = typeof rawWoId === "number" ? rawWoId : Number(rawWoId);
        if (Number.isFinite(canonicalWoId) && canonicalWoId > 0) {
            ids.add(canonicalWoId);
        }
    }
    return Array.from(ids);
}
