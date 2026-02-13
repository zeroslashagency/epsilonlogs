import { DeviceLogEntry } from "./report-types";

export interface KeySplitDisableWindow {
    startTs: number;
    endTs: number;
}

const KEY_ON = "KEY_ON";
const KEY_OFF = "KEY_OFF";

function normalizeAction(action: string | null | undefined): string {
    return String(action || "").trim().toUpperCase();
}

export function isKeyOnAction(action: string | null | undefined): boolean {
    return normalizeAction(action) === KEY_ON;
}

export function isKeyOffAction(action: string | null | undefined): boolean {
    return normalizeAction(action) === KEY_OFF;
}

export function isKeyAction(action: string | null | undefined): boolean {
    const normalized = normalizeAction(action);
    return normalized === KEY_ON || normalized === KEY_OFF;
}

export function getKeyActionSummary(action: string | null | undefined): string {
    if (isKeyOnAction(action)) {
        return "Manual entry: KEY ON";
    }
    if (isKeyOffAction(action)) {
        return "Manual entry: KEY OFF";
    }
    return "Manual key entry";
}

export function buildKeySplitDisableWindows(logs: DeviceLogEntry[]): KeySplitDisableWindow[] {
    const windows: KeySplitDisableWindow[] = [];
    const sorted = [...logs].sort((left, right) => {
        const leftTs = new Date(left.log_time).getTime();
        const rightTs = new Date(right.log_time).getTime();
        if (leftTs !== rightTs) return leftTs - rightTs;
        return left.log_id - right.log_id;
    });

    let activeStart: number | null = null;
    for (const log of sorted) {
        const ts = new Date(log.log_time).getTime();
        if (!Number.isFinite(ts)) {
            continue;
        }

        if (isKeyOnAction(log.action)) {
            if (activeStart === null) {
                activeStart = ts;
            }
            continue;
        }

        if (isKeyOffAction(log.action) && activeStart !== null) {
            windows.push({
                startTs: activeStart,
                endTs: ts,
            });
            activeStart = null;
        }
    }

    if (activeStart !== null) {
        windows.push({
            startTs: activeStart,
            endTs: Number.POSITIVE_INFINITY,
        });
    }

    return windows;
}
