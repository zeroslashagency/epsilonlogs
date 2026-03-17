import { fetchDeviceLogs } from "./api-client";
import type { DeviceLogEntry, ReportConfig, WoDetails } from "./report-types";

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

export async function fetchLogsForDevices(
  deviceIds: number[],
  config: Pick<ReportConfig, "startDate" | "endDate" | "toleranceSec">,
  token: string,
  signal?: AbortSignal,
): Promise<DeviceLogEntry[]> {
  const uniqueDeviceIds = Array.from(
    new Set(deviceIds.filter((deviceId) => Number.isInteger(deviceId) && deviceId > 0)),
  );

  const batches = await Promise.all(
    uniqueDeviceIds.map((deviceId) =>
      fetchDeviceLogs(
        {
          ...config,
          deviceId,
        },
        token,
        signal,
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
