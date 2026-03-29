import { supportsM30Completion } from "./machine-config";
import { DeviceLogEntry, JobType } from "./report-types";

const M30_CHANGED_PREFIX = "M30_CHANGED";
const M30_CONNECTION_ACTIONS = new Set([
    "M30_CONNECT",
    "M30_CONNECTED",
    "M30_DISCONNECTED",
]);
const M30_BURST_GAP_MS = 60_000;

interface ActiveWoState {
    jobType: number | null;
    operatorName: string;
    woId: number;
    woName: string;
}

interface DeviceState {
    activeWo: ActiveWoState | null;
    openSpindleLog: DeviceLogEntry | null;
}

function createInitialDeviceState(): DeviceState {
    return {
        activeWo: null,
        openSpindleLog: null,
    };
}

function normalizeAction(action: string | null | undefined): string {
    return String(action || "").trim().toUpperCase();
}

function isM30ConnectionAction(action: string | null | undefined): boolean {
    return M30_CONNECTION_ACTIONS.has(normalizeAction(action));
}

export function isM30ChangedAction(action: string | null | undefined): boolean {
    return normalizeAction(action).startsWith(M30_CHANGED_PREFIX);
}

function isProductionJob(activeWo: ActiveWoState | null): boolean {
    return activeWo?.jobType === JobType.PRODUCTION;
}

function getStateByDeviceId(
    stateByDeviceId: Map<number, DeviceState>,
    deviceId: number,
): DeviceState {
    const existing = stateByDeviceId.get(deviceId);
    if (existing) {
        return existing;
    }

    const created = createInitialDeviceState();
    stateByDeviceId.set(deviceId, created);
    return created;
}

function buildSyntheticM30CompletionLog(
    burstStartLog: DeviceLogEntry,
    activeWo: ActiveWoState,
    logId: number,
): DeviceLogEntry {
    const syntheticLog: DeviceLogEntry = {
        ...burstStartLog,
        action: "SPINDLE_OFF",
        completionSource: "M30",
        device_id: burstStartLog.device_id,
        isSynthetic: true,
        log_id: logId,
        m30BurstCount: 1,
        m30OriginalAction: burstStartLog.action,
        wo_id: activeWo.woId,
    };

    if (typeof activeWo.jobType === "number") {
        syntheticLog.job_type = activeWo.jobType;
    }

    const startName = activeWo.operatorName || burstStartLog.start_name;
    if (typeof startName === "string" && startName.trim().length > 0) {
        syntheticLog.start_name = startName;
    }

    const woName = activeWo.woName || burstStartLog.wo_name;
    if (typeof woName === "string" && woName.trim().length > 0) {
        syntheticLog.wo_name = woName;
    }

    return syntheticLog;
}

function updateM30BurstMetadata(
    syntheticLog: DeviceLogEntry,
    burstLogs: DeviceLogEntry[],
): void {
    syntheticLog.m30BurstCount = burstLogs.length;
    const firstAction = burstLogs[0]?.action;
    if (typeof firstAction === "string" && firstAction.trim().length > 0) {
        syntheticLog.m30OriginalAction = firstAction;
    }
}

export function applyM30CompletionSignals(logs: DeviceLogEntry[]): DeviceLogEntry[] {
    if (logs.length === 0) {
        return logs;
    }

    const transformedLogs: DeviceLogEntry[] = [];
    const maxLogId = logs.reduce((max, log) => Math.max(max, log.log_id), 0);
    const stateByDeviceId = new Map<number, DeviceState>();
    let nextSyntheticLogId = maxLogId + 1;

    for (let index = 0; index < logs.length; index += 1) {
        const log = logs[index]!;
        const deviceId = log.device_id;
        const state = getStateByDeviceId(stateByDeviceId, deviceId);
        const action = normalizeAction(log.action);

        if (action === "WO_START" || action === "MTR_ON") {
            const jobTypeValue = Number(log.job_type);
            state.activeWo = {
                jobType: Number.isFinite(jobTypeValue) ? jobTypeValue : null,
                operatorName: typeof log.start_name === "string" ? log.start_name : "",
                woId: log.wo_id,
                woName: typeof log.wo_name === "string" ? log.wo_name : String(log.wo_id || ""),
            };
            state.openSpindleLog = null;
            transformedLogs.push(log);
            continue;
        }

        if (action === "WO_STOP" || action === "MTR_OFF") {
            state.activeWo = null;
            state.openSpindleLog = null;
            transformedLogs.push(log);
            continue;
        }

        if (action === "SPINDLE_ON") {
            state.openSpindleLog = log;
            transformedLogs.push(log);
            continue;
        }

        if (action === "SPINDLE_OFF") {
            state.openSpindleLog = null;
            transformedLogs.push(log);
            continue;
        }

        if (isM30ConnectionAction(action)) {
            transformedLogs.push(log);
            continue;
        }

        if (isM30ChangedAction(action)) {
            const burstLogs = [log];
            let burstIndex = index + 1;

            while (burstIndex < logs.length) {
                const candidate = logs[burstIndex]!;
                if (
                    candidate.device_id !== deviceId ||
                    !isM30ChangedAction(candidate.action)
                ) {
                    break;
                }

                const prevTs = new Date(burstLogs[burstLogs.length - 1]!.log_time).getTime();
                const nextTs = new Date(candidate.log_time).getTime();
                if (!Number.isFinite(prevTs) || !Number.isFinite(nextTs) || nextTs - prevTs > M30_BURST_GAP_MS) {
                    break;
                }

                burstLogs.push(candidate);
                burstIndex += 1;
            }

            const canCompleteCycle =
                supportsM30Completion(deviceId)
                && isProductionJob(state.activeWo)
                && state.openSpindleLog !== null;

            if (canCompleteCycle) {
                const syntheticLog = buildSyntheticM30CompletionLog(
                    burstLogs[0]!,
                    state.activeWo!,
                    nextSyntheticLogId++,
                );
                updateM30BurstMetadata(syntheticLog, burstLogs);
                transformedLogs.push(syntheticLog);
                state.openSpindleLog = null;
            }

            index = burstIndex - 1;
            continue;
        }

        transformedLogs.push(log);
    }

    return transformedLogs.sort((left, right) => {
        const leftTs = new Date(left.log_time).getTime();
        const rightTs = new Date(right.log_time).getTime();
        if (leftTs !== rightTs) {
            return leftTs - rightTs;
        }
        return left.log_id - right.log_id;
    });
}
