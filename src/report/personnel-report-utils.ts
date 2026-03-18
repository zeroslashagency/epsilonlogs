import {
  fetchDeviceLogs,
  fetchLatestDeviceLogs,
  type DeviceLogsFetchProgress,
} from "./api-client";
import { ALL_MACHINES, getMachineLabel } from "./machine-config";
import {
  mapRawJobTypeToLabel,
  type DeviceLogEntry,
  type ReportConfig,
  type ReportRow,
  type WoDetails,
} from "./report-types";

export interface PersonnelOption {
  key: string;
  uid: number | null;
  name: string;
  woIds: number[];
  deviceIds: number[];
}

interface MutablePersonnelOption {
  key: string;
  uid: number | null;
  name: string;
  woIds: Set<number>;
  deviceIds: Set<number>;
}

export interface PersonnelActivitySummary {
  logCount: number;
  latestLogTime: string | null;
}

export interface PersonnelMachineOverlapLane {
  sessionKey: string;
  deviceId: number;
  woId: number;
  woIdLabel: string;
  jobType: string;
  startTime: string;
  endTime: string;
  latestLogTime: string | null;
  latestAction: string | null;
  logCount: number;
}

export interface PersonnelMachineOverlap {
  id: string;
  overlapStart: string;
  overlapEnd: string;
  overlapDurationSec: number;
  left: PersonnelMachineOverlapLane;
  right: PersonnelMachineOverlapLane;
}

export interface PersonnelOverlapLogSlot {
  timestamp: number;
  leftRows: ReportRow[];
  rightRows: ReportRow[];
}

export interface PersonnelOverlapLogWindow {
  overlap: PersonnelMachineOverlap;
  slots: PersonnelOverlapLogSlot[];
}

export interface PersonnelOverlapCompareWindow {
  id: string;
  startTime: string;
  endTime: string;
  durationSec: number;
  lanes: Array<PersonnelMachineOverlapLane & { key: string }>;
  slots: Array<{
    timestamp: number;
    laneRows: Record<string, ReportRow[]>;
  }>;
}

export interface PersonnelMergedLogGroup {
  key: string;
  deviceId: number | null;
  machineLabel: string;
  woIdLabel: string;
  jobType: string;
  latestTimestamp: number;
  rows: ReportRow[];
}

export interface DeviceLogsBatchProgress {
  completedRatio: number;
  completedDevices: number;
  totalDevices: number;
  currentDeviceId: number;
  currentDeviceCompletedPages: number;
  currentDeviceTotalPages: number;
}

interface PersonnelMachineSession extends PersonnelMachineOverlapLane {
  key: string;
  startMs: number;
  endMs: number;
}

function buildCompareLaneKey(deviceId: number, woId: number, woIdLabel: string): string {
  return `${deviceId}:${woIdLabel || woId}`;
}

function normalizePersonnelName(name: string | null | undefined): string {
  return String(name ?? "").trim();
}

function normalizePersonnelNameKey(name: string | null | undefined): string {
  return normalizePersonnelName(name).toLowerCase();
}

export function buildPersonnelKey(
  uid: number | null | undefined,
  name: string | null | undefined,
): string {
  if (typeof uid === "number" && uid > 0) {
    return `uid:${uid}`;
  }

  const normalizedName = normalizePersonnelNameKey(name);
  return normalizedName ? `name:${normalizedName}` : "";
}

function addMembership(
  option: MutablePersonnelOption,
  woId: number | null | undefined,
  deviceId: number | null | undefined,
): void {
  if (typeof woId === "number" && woId > 0) {
    option.woIds.add(woId);
  }
  if (typeof deviceId === "number" && deviceId > 0) {
    option.deviceIds.add(deviceId);
  }
}

function promoteNameOptionToUid(
  optionsByKey: Map<string, MutablePersonnelOption>,
  keyByName: Map<string, string>,
  nextKey: string,
  uid: number,
  name: string,
): MutablePersonnelOption {
  const normalizedName = normalizePersonnelNameKey(name);
  const existingNameKey = normalizedName ? keyByName.get(normalizedName) : null;

  if (existingNameKey) {
    const existing = optionsByKey.get(existingNameKey);
    if (existing) {
      optionsByKey.delete(existingNameKey);
      existing.key = nextKey;
      existing.uid = uid;
      if (!existing.name) {
        existing.name = name;
      }
      optionsByKey.set(nextKey, existing);
      keyByName.set(normalizedName, nextKey);
      return existing;
    }
  }

  const created: MutablePersonnelOption = {
    key: nextKey,
    uid,
    name,
    woIds: new Set<number>(),
    deviceIds: new Set<number>(),
  };
  optionsByKey.set(nextKey, created);
  if (normalizedName) {
    keyByName.set(normalizedName, nextKey);
  }
  return created;
}

function upsertPersonnelOption(
  optionsByKey: Map<string, MutablePersonnelOption>,
  keyByName: Map<string, string>,
  uid: number | null | undefined,
  name: string | null | undefined,
  woId: number | null | undefined,
  deviceId: number | null | undefined,
): void {
  const displayName = normalizePersonnelName(name);
  const normalizedName = normalizePersonnelNameKey(name);
  const resolvedUid = typeof uid === "number" && uid > 0 ? uid : null;
  const key = buildPersonnelKey(resolvedUid, displayName);

  if (!key) {
    return;
  }

  let option = optionsByKey.get(key);
  if (!option) {
    if (resolvedUid !== null) {
      option = promoteNameOptionToUid(
        optionsByKey,
        keyByName,
        key,
        resolvedUid,
        displayName,
      );
    } else {
      const aliasedKey = normalizedName ? keyByName.get(normalizedName) : null;
      if (aliasedKey) {
        option = optionsByKey.get(aliasedKey);
      }
      if (!option) {
        option = {
          key,
          uid: null,
          name: displayName,
          woIds: new Set<number>(),
          deviceIds: new Set<number>(),
        };
        optionsByKey.set(key, option);
      }
    }
  }

  if (displayName && !option.name) {
    option.name = displayName;
  }
  if (resolvedUid !== null && option.uid === null) {
    option.uid = resolvedUid;
  }
  if (normalizedName) {
    keyByName.set(normalizedName, option.key);
  }

  addMembership(option, woId, deviceId);
}

export function derivePersonnelOptions(
  woDetailsMap: Map<number, WoDetails>,
  logs: DeviceLogEntry[],
): PersonnelOption[] {
  const optionsByKey = new Map<string, MutablePersonnelOption>();
  const keyByName = new Map<string, string>();

  for (const [woId, details] of woDetailsMap.entries()) {
    upsertPersonnelOption(
      optionsByKey,
      keyByName,
      details.start_uid,
      details.start_name,
      woId,
      details.device_id,
    );
  }

  for (const log of logs) {
    upsertPersonnelOption(
      optionsByKey,
      keyByName,
      typeof log.uid === "number" ? log.uid : null,
      typeof log.start_name === "string" ? log.start_name : null,
      log.wo_id,
      log.device_id,
    );
  }

  return Array.from(optionsByKey.values())
    .map((option) => ({
      key: option.key,
      uid: option.uid,
      name: option.name || "Unknown",
      woIds: Array.from(option.woIds).sort((a, b) => a - b),
      deviceIds: Array.from(option.deviceIds).sort((a, b) => a - b),
    }))
    .sort((left, right) => {
      const nameCompare = left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
      });
      if (nameCompare !== 0) {
        return nameCompare;
      }

      return left.key.localeCompare(right.key);
    });
}

function matchesPersonnel(
  option: PersonnelOption,
  uid: number | null | undefined,
  name: string | null | undefined,
): boolean {
  const normalizedName = normalizePersonnelNameKey(name);
  const selectedName = normalizePersonnelNameKey(option.name);

  if (
    option.uid !== null &&
    typeof uid === "number" &&
    uid > 0 &&
    uid === option.uid
  ) {
    return true;
  }

  if (selectedName && normalizedName && normalizedName === selectedName) {
    return true;
  }

  return false;
}

export function filterWoDetailsMapByPersonnel(
  woDetailsMap: Map<number, WoDetails>,
  option: PersonnelOption,
): Map<number, WoDetails> {
  const filtered = new Map<number, WoDetails>();

  for (const [woId, details] of woDetailsMap.entries()) {
    if (matchesPersonnel(option, details.start_uid, details.start_name)) {
      filtered.set(woId, details);
    }
  }

  return filtered;
}

export function filterLogsByPersonnel(
  logs: DeviceLogEntry[],
  woDetailsMap: Map<number, WoDetails>,
  option: PersonnelOption,
): DeviceLogEntry[] {
  return logs.filter((log) => {
    const details =
      typeof log.wo_id === "number" && log.wo_id > 0
        ? woDetailsMap.get(log.wo_id)
        : undefined;

    const resolvedUid =
      details?.start_uid ?? (typeof log.uid === "number" ? log.uid : null);
    const resolvedName =
      details?.start_name ??
      (typeof log.start_name === "string" ? log.start_name : null);

    return matchesPersonnel(option, resolvedUid, resolvedName);
  });
}

export function summarizePersonnelActivity(
  logs: DeviceLogEntry[],
  woDetailsMap: Map<number, WoDetails>,
): Map<string, PersonnelActivitySummary> {
  const summaries = new Map<string, PersonnelActivitySummary>();

  for (const log of logs) {
    const details =
      typeof log.wo_id === "number" && log.wo_id > 0
        ? woDetailsMap.get(log.wo_id)
        : undefined;
    const resolvedUid =
      details?.start_uid ?? (typeof log.uid === "number" ? log.uid : null);
    const resolvedName =
      details?.start_name ??
      (typeof log.start_name === "string" ? log.start_name : null);
    const key = buildPersonnelKey(resolvedUid, resolvedName);

    if (!key) {
      continue;
    }

    const current = summaries.get(key) ?? {
      logCount: 0,
      latestLogTime: null,
    };

    current.logCount += 1;

    if (!current.latestLogTime || log.log_time > current.latestLogTime) {
      current.latestLogTime = log.log_time;
    }

    summaries.set(key, current);
  }

  return summaries;
}

function parseIsoTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getTime();
}

function serializeIsoTime(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function resolveJobTypeLabel(
  details: WoDetails | undefined,
  logs: DeviceLogEntry[],
): string {
  if (typeof details?.job_type === "number") {
    return mapRawJobTypeToLabel(details.job_type);
  }

  const numericJobType = logs.find((log) => typeof log.job_type === "number");
  if (typeof numericJobType?.job_type === "number") {
    return mapRawJobTypeToLabel(numericJobType.job_type);
  }

  const stringJobType = logs.find((log) => typeof log.job_type === "string");
  if (typeof stringJobType?.job_type === "string") {
    return stringJobType.job_type.trim() || "Unknown";
  }

  return "Unknown";
}

function resolveSessionWindow(
  details: WoDetails | undefined,
  logs: DeviceLogEntry[],
): { startMs: number; endMs: number } | null {
  const sortedLogs = [...logs].sort((left, right) =>
    left.log_time.localeCompare(right.log_time),
  );
  const firstLogTime = sortedLogs[0]?.log_time ?? null;
  const lastLogTime = sortedLogs[sortedLogs.length - 1]?.log_time ?? null;

  const startMs = parseIsoTime(details?.start_time) ?? parseIsoTime(firstLogTime);
  const endMs = parseIsoTime(details?.end_time) ?? parseIsoTime(lastLogTime);

  if (startMs === null || endMs === null) {
    return null;
  }

  if (endMs <= startMs) {
    return null;
  }

  return { startMs, endMs };
}

function getDashboardOrder(deviceId: number): number {
  const index = ALL_MACHINES.findIndex((machine) => machine.id === deviceId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function buildDeviceLogsBatchProgress(
  deviceIds: number[],
  progressByDevice: Map<number, number>,
  snapshot: DeviceLogsFetchProgress,
): DeviceLogsBatchProgress {
  const totalDevices = deviceIds.length;
  const completedRatio =
    totalDevices === 0
      ? 1
      : deviceIds.reduce((sum, deviceId) => sum + (progressByDevice.get(deviceId) ?? 0), 0) /
        totalDevices;
  const completedDevices = deviceIds.filter(
    (deviceId) => (progressByDevice.get(deviceId) ?? 0) >= 1,
  ).length;

  return {
    completedRatio,
    completedDevices,
    totalDevices,
    currentDeviceId: snapshot.deviceId,
    currentDeviceCompletedPages: snapshot.completedPages,
    currentDeviceTotalPages: snapshot.totalPages,
  };
}

function compareLanes(
  left: PersonnelMachineOverlapLane,
  right: PersonnelMachineOverlapLane,
): number {
  const leftOrder = getDashboardOrder(left.deviceId);
  const rightOrder = getDashboardOrder(right.deviceId);

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.deviceId - right.deviceId;
}

function buildPersonnelMachineSessions(
  logs: DeviceLogEntry[],
  woDetailsMap: Map<number, WoDetails>,
): PersonnelMachineSession[] {
  const logsByWoId = new Map<number, DeviceLogEntry[]>();

  for (const log of logs) {
    if (typeof log.wo_id !== "number" || log.wo_id <= 0) {
      continue;
    }

    const current = logsByWoId.get(log.wo_id) ?? [];
    current.push(log);
    logsByWoId.set(log.wo_id, current);
  }

  const sessions: PersonnelMachineSession[] = [];

  for (const [woId, details] of woDetailsMap.entries()) {
    const sessionLogs = logsByWoId.get(woId) ?? [];
    const deviceId =
      details.device_id ||
      sessionLogs.find((log) => typeof log.device_id === "number" && log.device_id > 0)
        ?.device_id ||
      0;

    if (deviceId <= 0) {
      continue;
    }

    const window = resolveSessionWindow(details, sessionLogs);
    if (!window) {
      continue;
    }

    const latestLog = sessionLogs.reduce<DeviceLogEntry | null>((latest, current) => {
      if (!latest || current.log_time > latest.log_time) {
        return current;
      }

      return latest;
    }, null);

    sessions.push({
      key: buildCompareLaneKey(deviceId, woId, details.wo_id_str || String(woId)),
      sessionKey: `${deviceId}:${woId}:${window.startMs}:${window.endMs}`,
      deviceId,
      woId,
      woIdLabel: details.wo_id_str || String(woId),
      jobType: resolveJobTypeLabel(details, sessionLogs),
      startTime: serializeIsoTime(window.startMs),
      endTime: serializeIsoTime(window.endMs),
      latestLogTime: latestLog?.log_time ?? null,
      latestAction: latestLog?.action ?? null,
      logCount: sessionLogs.length,
      startMs: window.startMs,
      endMs: window.endMs,
    });
  }

  return sessions.sort((left, right) => {
    const startCompare = left.startMs - right.startMs;
    if (startCompare !== 0) {
      return startCompare;
    }

    return compareLanes(left, right);
  });
}

export function detectPersonnelMachineOverlaps(
  logs: DeviceLogEntry[],
  woDetailsMap: Map<number, WoDetails>,
): PersonnelMachineOverlap[] {
  const sessions = buildPersonnelMachineSessions(logs, woDetailsMap);
  const overlaps: PersonnelMachineOverlap[] = [];

  for (let index = 0; index < sessions.length; index += 1) {
    const current = sessions[index];
    if (!current) {
      continue;
    }

    const currentStartMs = parseIsoTime(current.startTime);
    const currentEndMs = parseIsoTime(current.endTime);

    if (currentStartMs === null || currentEndMs === null) {
      continue;
    }

    for (
      let comparisonIndex = index + 1;
      comparisonIndex < sessions.length;
      comparisonIndex += 1
    ) {
      const candidate = sessions[comparisonIndex];
      if (!candidate || candidate.deviceId === current.deviceId) {
        continue;
      }

      const candidateStartMs = parseIsoTime(candidate.startTime);
      const candidateEndMs = parseIsoTime(candidate.endTime);

      if (candidateStartMs === null || candidateEndMs === null) {
        continue;
      }

      const overlapStart = Math.max(currentStartMs, candidateStartMs);
      const overlapEnd = Math.min(currentEndMs, candidateEndMs);

      if (overlapEnd <= overlapStart) {
        continue;
      }

      const [left, right] =
        compareLanes(current, candidate) <= 0
          ? [current, candidate]
          : [candidate, current];

      overlaps.push({
        id: `${left.woId}:${left.deviceId}-${right.woId}:${right.deviceId}-${overlapStart}`,
        overlapStart: serializeIsoTime(overlapStart),
        overlapEnd: serializeIsoTime(overlapEnd),
        overlapDurationSec: Math.floor((overlapEnd - overlapStart) / 1000),
        left,
        right,
      });
    }
  }

  return overlaps.sort((left, right) => {
    const startCompare = right.overlapStart.localeCompare(left.overlapStart);
    if (startCompare !== 0) {
      return startCompare;
    }

    const leftDeviceCompare = compareLanes(left.left, right.left);
    if (leftDeviceCompare !== 0) {
      return leftDeviceCompare;
    }

    return compareLanes(left.right, right.right);
  });
}

function resolveReportRowDeviceId(
  row: ReportRow,
  woDetailsByWoIdStr: Map<string, WoDetails>,
): number | null {
  if (typeof row.originalLog?.device_id === "number" && row.originalLog.device_id > 0) {
    return row.originalLog.device_id;
  }

  if (
    row.isWoHeader &&
    typeof row.woHeaderData?.deviceId === "number" &&
    row.woHeaderData.deviceId > 0
  ) {
    return row.woHeaderData.deviceId;
  }

  if (
    row.isWoSummary &&
    typeof row.woSummaryData?.deviceId === "number" &&
    row.woSummaryData.deviceId > 0
  ) {
    return row.woSummaryData.deviceId;
  }

  const woId = row.woSpecs?.woId;
  if (!woId) {
    return null;
  }

  const details = woDetailsByWoIdStr.get(woId);
  if (details && typeof details.device_id === "number" && details.device_id > 0) {
    return details.device_id;
  }

  return null;
}

function resolveReportRowWoId(row: ReportRow): string | null {
  if (typeof row.originalLog?.wo_id === "number" && row.originalLog.wo_id > 0) {
    return String(row.originalLog.wo_id);
  }

  if (row.isWoHeader && row.woHeaderData?.woIdStr) {
    return row.woHeaderData.woIdStr;
  }

  if (row.isWoSummary && row.woSummaryData?.woIdStr) {
    return row.woSummaryData.woIdStr;
  }

  if (row.woSpecs?.woId) {
    return row.woSpecs.woId;
  }

  return null;
}

export function groupPersonnelMergedRows(
  rows: ReportRow[],
  woDetailsMap: Map<number, WoDetails>,
): PersonnelMergedLogGroup[] {
  if (rows.length === 0) {
    return [];
  }

  const woDetailsByWoIdStr = new Map<string, WoDetails>();
  for (const details of woDetailsMap.values()) {
    if (details.wo_id_str) {
      woDetailsByWoIdStr.set(details.wo_id_str, details);
    }
  }

  const groups = new Map<string, PersonnelMergedLogGroup>();

  for (const row of rows) {
    if (row.isPauseBanner) {
      continue;
    }

    const woIdLabel = resolveReportRowWoId(row) ?? "Unknown";
    const deviceId = resolveReportRowDeviceId(row, woDetailsByWoIdStr);
    const machineLabel =
      typeof deviceId === "number" && deviceId > 0
        ? getMachineLabel(deviceId)
        : "Unknown machine";
    const jobType = String(row.jobType ?? "Unknown");
    const key = `${deviceId ?? 0}:${woIdLabel}`;
    const existing = groups.get(key);

    if (existing) {
      existing.rows.push(row);
      existing.latestTimestamp = Math.max(existing.latestTimestamp, row.timestamp);
      if (existing.jobType === "Unknown" && jobType !== "Unknown") {
        existing.jobType = jobType;
      }
      continue;
    }

    groups.set(key, {
      key,
      deviceId: typeof deviceId === "number" && deviceId > 0 ? deviceId : null,
      machineLabel,
      woIdLabel,
      jobType,
      latestTimestamp: row.timestamp,
      rows: [row],
    });
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftOrder =
      left.deviceId !== null ? getDashboardOrder(left.deviceId) : Number.MAX_SAFE_INTEGER;
    const rightOrder =
      right.deviceId !== null
        ? getDashboardOrder(right.deviceId)
        : Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const latestCompare = right.latestTimestamp - left.latestTimestamp;
    if (latestCompare !== 0) {
      return latestCompare;
    }

    return left.woIdLabel.localeCompare(right.woIdLabel, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function matchesCompareLane(
  row: ReportRow,
  lane: PersonnelMachineSession,
  woDetailsByWoIdStr: Map<string, WoDetails>,
): boolean {
  const deviceId = resolveReportRowDeviceId(row, woDetailsByWoIdStr);
  if (deviceId === null || deviceId !== lane.deviceId) {
    return false;
  }

  if (typeof row.originalLog?.wo_id === "number" && row.originalLog.wo_id > 0) {
    return row.originalLog.wo_id === lane.woId;
  }

  const woId = resolveReportRowWoId(row);
  return woId === lane.woIdLabel;
}

export function buildPersonnelOverlapLogWindows(
  rows: ReportRow[],
  overlaps: PersonnelMachineOverlap[],
  woDetailsMap: Map<number, WoDetails>,
): PersonnelOverlapLogWindow[] {
  const woDetailsByWoIdStr = new Map<string, WoDetails>();
  for (const details of woDetailsMap.values()) {
    if (details.wo_id_str) {
      woDetailsByWoIdStr.set(details.wo_id_str, details);
    }
  }

  return overlaps
    .map((overlap) => {
      const overlapStartMs = parseIsoTime(overlap.overlapStart);
      const overlapEndMs = parseIsoTime(overlap.overlapEnd);
      if (overlapStartMs === null || overlapEndMs === null) {
        return null;
      }

      const slotMap = new Map<number, PersonnelOverlapLogSlot>();

      for (const row of rows) {
        if (row.isPauseBanner || row.isWoHeader || row.isWoSummary) {
          continue;
        }

        if (row.timestamp < overlapStartMs || row.timestamp > overlapEndMs) {
          continue;
        }

        const deviceId = resolveReportRowDeviceId(row, woDetailsByWoIdStr);
        if (deviceId === null) {
          continue;
        }

        if (deviceId !== overlap.left.deviceId && deviceId !== overlap.right.deviceId) {
          continue;
        }

        const current = slotMap.get(row.timestamp) ?? {
          timestamp: row.timestamp,
          leftRows: [],
          rightRows: [],
        };

        if (deviceId === overlap.left.deviceId) {
          current.leftRows.push(row);
        } else {
          current.rightRows.push(row);
        }

        slotMap.set(row.timestamp, current);
      }

      const slots = Array.from(slotMap.values()).sort(
        (left, right) => right.timestamp - left.timestamp,
      );

      if (slots.length === 0) {
        return null;
      }

      return {
        overlap,
        slots,
      } satisfies PersonnelOverlapLogWindow;
    })
    .filter((window): window is PersonnelOverlapLogWindow => window !== null);
}

export function buildPersonnelOverlapCompareWindows(
  rows: ReportRow[],
  overlaps: PersonnelMachineOverlap[],
  woDetailsMap: Map<number, WoDetails>,
): PersonnelOverlapCompareWindow[] {
  if (overlaps.length === 0) {
    return [];
  }

  const woDetailsByWoIdStr = new Map<string, WoDetails>();
  for (const details of woDetailsMap.values()) {
    if (details.wo_id_str) {
      woDetailsByWoIdStr.set(details.wo_id_str, details);
    }
  }

  const sessionMap = new Map<string, PersonnelMachineSession>();
  for (const overlap of overlaps) {
    for (const lane of [overlap.left, overlap.right]) {
      const startMs = parseIsoTime(lane.startTime);
      const endMs = parseIsoTime(lane.endTime);
      if (startMs === null || endMs === null || endMs <= startMs) {
        continue;
      }

      const sessionKey =
        lane.sessionKey || `${lane.deviceId}:${lane.woId}:${startMs}:${endMs}`;
      const key = buildCompareLaneKey(
        lane.deviceId,
        lane.woId,
        lane.woIdLabel,
      );

      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          ...lane,
          key,
          sessionKey,
          startMs,
          endMs,
        });
      }
    }
  }

  const sessions = Array.from(sessionMap.values()).sort((left, right) => {
    const startCompare = left.startMs - right.startMs;
    if (startCompare !== 0) {
      return startCompare;
    }

    return compareLanes(left, right);
  });

  if (sessions.length < 2) {
    return [];
  }

  const boundaries = Array.from(
    new Set(
      sessions.flatMap((session) => [session.startMs, session.endMs]),
    ),
  ).sort((left, right) => left - right);

  const segments: Array<{
    startMs: number;
    endMs: number;
    lanes: PersonnelMachineSession[];
  }> = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMs = boundaries[index]!;
    const endMs = boundaries[index + 1]!;
    if (endMs <= startMs) {
      continue;
    }

    const activeLanes = sessions
      .filter((session) => session.startMs < endMs && session.endMs > startMs)
      .sort(compareLanes);

    if (activeLanes.length < 2) {
      continue;
    }

      const previous = segments[segments.length - 1];
      const sameLaneSet =
        previous &&
        previous.lanes.length === activeLanes.length &&
        previous.lanes.every(
          (lane, laneIndex) =>
            lane.sessionKey === activeLanes[laneIndex]?.sessionKey,
        );

    if (sameLaneSet) {
      previous.endMs = endMs;
    } else {
      segments.push({
        startMs,
        endMs,
        lanes: activeLanes,
      });
    }
  }

  return segments
    .map((segment) => {
      const laneRowsMap = new Map<string, ReportRow[]>();
      const slotMap = new Map<number, Record<string, ReportRow[]>>();

      for (const lane of segment.lanes) {
        laneRowsMap.set(lane.key, []);
      }

      for (const row of rows) {
        if (row.isPauseBanner) {
          continue;
        }

        const lane = segment.lanes.find(
          (candidate) => matchesCompareLane(row, candidate, woDetailsByWoIdStr),
        );
        if (!lane) {
          continue;
        }

        const laneRows = laneRowsMap.get(lane.key);
        if (!laneRows) {
          continue;
        }

        const isContextRow = row.isWoHeader || row.isWoSummary;
        if (!isContextRow) {
          if (row.timestamp < segment.startMs || row.timestamp > segment.endMs) {
            continue;
          }

          const current = slotMap.get(row.timestamp) ?? {};
          const currentLaneRows = current[lane.key] ?? [];
          current[lane.key] = [...currentLaneRows, row];
          slotMap.set(row.timestamp, current);
        }

        laneRows.push(row);
      }

      const hasAnySlot = Array.from(slotMap.values()).some(
        (slot) => Object.values(slot).some((laneRows) => laneRows.length > 0),
      );
      if (!hasAnySlot) {
        return null;
      }

      return {
        id: `${segment.lanes
          .map((lane) => lane.sessionKey)
          .join("|")}-${segment.startMs}`,
        startTime: serializeIsoTime(segment.startMs),
        endTime: serializeIsoTime(segment.endMs),
        durationSec: Math.floor((segment.endMs - segment.startMs) / 1000),
        lanes: segment.lanes.map(
          ({ startMs: _startMs, endMs: _endMs, ...lane }) => lane,
        ),
        slots: Array.from(slotMap.entries())
          .sort((left, right) => right[0] - left[0])
          .map(([timestamp, laneRows]) => ({
            timestamp,
            laneRows,
          })),
      } satisfies PersonnelOverlapCompareWindow;
    })
    .filter((window): window is PersonnelOverlapCompareWindow => window !== null);
}

export async function fetchLogsForDevices(
  deviceIds: number[],
  config: Pick<ReportConfig, "startDate" | "endDate" | "toleranceSec">,
  token: string,
  signal?: AbortSignal,
  onProgress?: (progress: DeviceLogsBatchProgress) => void,
): Promise<DeviceLogEntry[]> {
  const uniqueDeviceIds = Array.from(
    new Set(deviceIds.filter((deviceId) => Number.isInteger(deviceId) && deviceId > 0)),
  );
  const progressByDevice = new Map(uniqueDeviceIds.map((deviceId) => [deviceId, 0]));

  const batches = await Promise.all(
    uniqueDeviceIds.map((deviceId) =>
      fetchDeviceLogs(
        {
          ...config,
          deviceId,
        },
        token,
        signal,
        (snapshot) => {
          const deviceRatio =
            snapshot.totalPages <= 0
              ? 1
              : snapshot.completedPages / snapshot.totalPages;
          progressByDevice.set(deviceId, Math.max(0, Math.min(1, deviceRatio)));
          onProgress?.(
            buildDeviceLogsBatchProgress(
              uniqueDeviceIds,
              progressByDevice,
              snapshot,
            ),
          );
        },
      ),
    ),
  );

  return batches.flat();
}

export async function fetchRecentLogsForDevices(
  deviceIds: number[],
  config: Pick<ReportConfig, "startDate" | "endDate" | "toleranceSec">,
  token: string,
  signal?: AbortSignal,
  pagesBack = 4,
  onProgress?: (progress: DeviceLogsBatchProgress) => void,
): Promise<DeviceLogEntry[]> {
  const uniqueDeviceIds = Array.from(
    new Set(deviceIds.filter((deviceId) => Number.isInteger(deviceId) && deviceId > 0)),
  );
  const progressByDevice = new Map(uniqueDeviceIds.map((deviceId) => [deviceId, 0]));

  const batches = await Promise.all(
    uniqueDeviceIds.map((deviceId) =>
      fetchLatestDeviceLogs(
        {
          ...config,
          deviceId,
        },
        token,
        signal,
        pagesBack,
        (snapshot) => {
          const deviceRatio =
            snapshot.totalPages <= 0
              ? 1
              : snapshot.completedPages / snapshot.totalPages;
          progressByDevice.set(deviceId, Math.max(0, Math.min(1, deviceRatio)));
          onProgress?.(
            buildDeviceLogsBatchProgress(
              uniqueDeviceIds,
              progressByDevice,
              snapshot,
            ),
          );
        },
      ),
    ),
  );

  return batches.flat();
}

export function formatMachineScopeLabel(
  deviceIds: number[],
  deviceNameMap: Map<number, string>,
): string {
  return deviceIds
    .map((deviceId) => {
      const name = deviceNameMap.get(deviceId);
      return name ? `${name} (${deviceId})` : `Machine ${deviceId}`;
    })
    .join(", ");
}

export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function resolvePersonnelReportDeviceIds(
  selectedDeviceIds: number[],
  personnelDeviceIds: number[],
): number[] {
  const selectedSet = new Set(selectedDeviceIds);
  const narrowed = personnelDeviceIds.filter((deviceId) =>
    selectedSet.has(deviceId),
  );

  return narrowed.length > 0 ? narrowed : selectedDeviceIds;
}
