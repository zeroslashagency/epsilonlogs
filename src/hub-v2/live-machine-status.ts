import { getMachineLabel, getMachineType, type MachineType } from "../report/machine-config";
import {
  mapRawJobTypeToLabel,
  type DeviceLogEntry,
  type ReportJobType,
} from "../report/report-types";

export type MachineStatus =
  | "LIVE"
  | "SETTING"
  | "MAINTENANCE"
  | "CALIBRATION"
  | "PAUSED"
  | "IDLE"
  | "OFFLINE"
  | "ERROR";

export interface MachineSnapshot {
  machineId: number;
  machineLabel: string;
  machineType: MachineType | null;
  status: MachineStatus;
  statusLabel: string;
  statusMessage: string;
  currentWoId: string | null;
  operatorName: string | null;
  jobTypeLabel: ReportJobType | "Unknown";
  latestAction: string | null;
  latestTimestamp: number | null;
  errorMessage: string | null;
  logs: DeviceLogEntry[];
}

interface BuildMachineSnapshotOptions {
  machineId: number;
  logs: DeviceLogEntry[];
  now: number;
  liveWindowMs?: number;
  offlineWindowMs?: number;
}

const ACTIVE_ACTIONS = new Set(["SPINDLE_ON", "WO_START", "WO_RESUME"]);
const STOPPED_ACTIONS = new Set(["SPINDLE_OFF", "WO_STOP"]);
const DEFAULT_LIVE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_OFFLINE_WINDOW_MS = 2 * 60 * 60 * 1000;

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeJobType(log: DeviceLogEntry | null): ReportJobType | "Unknown" {
  if (!log || log.job_type == null) {
    return "Unknown";
  }

  const numericType = Number(log.job_type);
  if (!Number.isFinite(numericType)) {
    return "Unknown";
  }

  return mapRawJobTypeToLabel(numericType);
}

function resolveWoId(log: DeviceLogEntry | null): string | null {
  if (!log) {
    return null;
  }

  const woName = String(log.wo_name || "").trim();
  if (woName.length > 0) {
    return woName;
  }

  return typeof log.wo_id === "number" && log.wo_id > 0
    ? String(log.wo_id)
    : null;
}

function createBaseSnapshot(machineId: number): MachineSnapshot {
  return {
    machineId,
    machineLabel: getMachineLabel(machineId),
    machineType: getMachineType(machineId),
    status: "OFFLINE",
    statusLabel: "Offline",
    statusMessage: "No recent machine events.",
    currentWoId: null,
    operatorName: null,
    jobTypeLabel: "Unknown",
    latestAction: null,
    latestTimestamp: null,
    errorMessage: null,
    logs: [],
  };
}

export function buildMachineErrorSnapshot(
  machineId: number,
  errorMessage: string,
): MachineSnapshot {
  return {
    ...createBaseSnapshot(machineId),
    status: "ERROR",
    statusLabel: "Request Failed",
    statusMessage: "Live data request failed for this machine.",
    errorMessage,
  };
}

export function buildMachineSnapshot({
  machineId,
  logs,
  now,
  liveWindowMs = DEFAULT_LIVE_WINDOW_MS,
  offlineWindowMs = DEFAULT_OFFLINE_WINDOW_MS,
}: BuildMachineSnapshotOptions): MachineSnapshot {
  const base = createBaseSnapshot(machineId);
  const sortedLogs = [...logs].sort((left, right) => {
    return (
      (toTimestamp(right.log_time) ?? Number.NEGATIVE_INFINITY) -
      (toTimestamp(left.log_time) ?? Number.NEGATIVE_INFINITY)
    );
  });

  const latestLog = sortedLogs[0] ?? null;
  if (!latestLog) {
    return base;
  }

  const latestTimestamp = toTimestamp(latestLog.log_time);
  if (latestTimestamp === null) {
    return {
      ...base,
      statusMessage: "Latest event timestamp is invalid.",
      logs: sortedLogs,
    };
  }

  const ageMs = Math.max(0, now - latestTimestamp);
  const latestAction = latestLog.action || null;
  const jobTypeLabel = normalizeJobType(latestLog);
  const operatorName =
    typeof latestLog.start_name === "string" && latestLog.start_name.trim().length > 0
      ? latestLog.start_name.trim()
      : null;

  const snapshot: MachineSnapshot = {
    ...base,
    currentWoId: resolveWoId(latestLog),
    operatorName,
    jobTypeLabel,
    latestAction,
    latestTimestamp,
    logs: sortedLogs,
  };

  if (ageMs > offlineWindowMs) {
    return {
      ...snapshot,
      status: "OFFLINE",
      statusLabel: "Offline",
      statusMessage: "No recent machine event in the live window.",
    };
  }

  if (jobTypeLabel === "Maintenance") {
    return {
      ...snapshot,
      status: "MAINTENANCE",
      statusLabel: "Maintenance",
      statusMessage: "Maintenance activity is in progress.",
    };
  }

  if (jobTypeLabel === "Setting" || jobTypeLabel === "Man Setting") {
    return {
      ...snapshot,
      status: "SETTING",
      statusLabel: "Setting",
      statusMessage: "Setup or setting activity is in progress.",
    };
  }

  if (jobTypeLabel === "Calibration") {
    return {
      ...snapshot,
      status: "CALIBRATION",
      statusLabel: "Calibration",
      statusMessage: "Calibration activity is in progress.",
    };
  }

  if (latestAction === "WO_PAUSE") {
    return {
      ...snapshot,
      status: "PAUSED",
      statusLabel: "Paused",
      statusMessage: "Work order is paused.",
    };
  }

  if (ACTIVE_ACTIONS.has(latestAction || "") || ageMs <= liveWindowMs) {
    return {
      ...snapshot,
      status: "LIVE",
      statusLabel: "Live",
      statusMessage:
        latestAction === "SPINDLE_ON"
          ? "Spindle is running now."
          : "Recent work order activity detected.",
    };
  }

  if (STOPPED_ACTIONS.has(latestAction || "")) {
    return {
      ...snapshot,
      status: "IDLE",
      statusLabel: "Idle",
      statusMessage: "Machine is reachable but not actively running.",
    };
  }

  return {
    ...snapshot,
    status: "IDLE",
    statusLabel: "Idle",
    statusMessage: "Machine is waiting for the next event.",
  };
}
