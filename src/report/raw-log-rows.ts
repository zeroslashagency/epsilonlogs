import { formatDuration } from "./format-utils";
import { normalizeLogs } from "./log-normalizer";
import {
  DeviceLogEntry,
  ReportJobType,
  ReportRow,
  WoDetails,
  mapRawJobTypeToLabel,
} from "./report-types";

function parsePositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveJobType(log: DeviceLogEntry, details?: WoDetails): ReportJobType {
  const rawJobType = parsePositiveNumber(log.job_type) ?? details?.job_type ?? null;
  if (rawJobType == null) {
    return log.action === "KEY_ON" || log.action === "KEY_OFF"
      ? "Manual Input"
      : "Unknown";
  }

  return mapRawJobTypeToLabel(rawJobType);
}

function resolveOperatorName(log: DeviceLogEntry, details?: WoDetails): string | undefined {
  const operatorName = log.start_name || details?.start_name || details?.stop_name;
  return operatorName && operatorName.trim().length > 0 ? operatorName : undefined;
}

function resolvePclText(log: DeviceLogEntry, details?: WoDetails): string {
  const pclValue = parsePositiveNumber(details?.pcl) ?? parsePositiveNumber(log.pcl);
  return pclValue != null ? formatDuration(pclValue) : "—";
}

function buildWoSpecs(log: DeviceLogEntry, details?: WoDetails): ReportRow["woSpecs"] | undefined {
  const woId =
    (typeof log.wo_name === "string" && log.wo_name.trim()) ||
    details?.wo_id_str ||
    (log.wo_id > 0 ? String(log.wo_id) : "");

  if (!woId) {
    return undefined;
  }

  return {
    woId,
    pclText: resolvePclText(log, details),
    allotted: parsePositiveNumber(details?.alloted_qty) ?? parsePositiveNumber(log.alloted_qty) ?? 0,
  };
}

function buildStartRowData(log: DeviceLogEntry, details?: WoDetails): ReportRow["startRowData"] | undefined {
  if (log.action !== "WO_START" && log.action !== "MTR_ON") {
    return undefined;
  }

  const partNo = log.part_no || details?.part_no || "";
  const allotted = parsePositiveNumber(log.alloted_qty) ?? parsePositiveNumber(details?.alloted_qty) ?? 0;
  const comment = log.start_comment || details?.start_comment || "";

  return { partNo, allotted, comment };
}

function buildStopRowData(log: DeviceLogEntry, details?: WoDetails): ReportRow["stopRowData"] | undefined {
  if (log.action !== "WO_STOP" && log.action !== "MTR_OFF") {
    return undefined;
  }

  return {
    ok: parsePositiveNumber(log.ok_qty) ?? parsePositiveNumber(details?.ok_qty) ?? 0,
    reject: parsePositiveNumber(log.reject_qty) ?? parsePositiveNumber(details?.reject_qty) ?? 0,
    reason: log.stop_comment || details?.stop_comment || "",
  };
}

export function buildRawLogRows(
  logs: DeviceLogEntry[],
  woDetailsMap: Map<number, WoDetails>,
): ReportRow[] {
  const normalizedLogs = normalizeLogs(logs);
  const sortedLogs = [...normalizedLogs].sort((left, right) => {
    const leftTs = new Date(left.log_time).getTime();
    const rightTs = new Date(right.log_time).getTime();
    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }
    return right.log_id - left.log_id;
  });

  return sortedLogs.map((log, index) => {
    const details = log.wo_id > 0 ? woDetailsMap.get(log.wo_id) : undefined;
    const row: ReportRow = {
      rowId: `raw-${log.log_id}`,
      sNo: index + 1,
      logId: log.log_id,
      logTime: new Date(log.log_time),
      action: log.action,
      jobType: resolveJobType(log, details),
      timestamp: new Date(log.log_time).getTime(),
      originalLog: log,
    };

    const operatorName = resolveOperatorName(log, details);
    if (operatorName) {
      row.operatorName = operatorName;
    }

    const woSpecs = buildWoSpecs(log, details);
    if (woSpecs) {
      row.woSpecs = woSpecs;
    }

    const startRowData = buildStartRowData(log, details);
    if (startRowData) {
      row.startRowData = startRowData;
    }

    const stopRowData = buildStopRowData(log, details);
    if (stopRowData) {
      row.stopRowData = stopRowData;
    }

    return row;
  });
}

function rowPriority(row: ReportRow): number {
  if (row.isWoSummary) return 0;
  if (row.action === "WO_STOP") return 1;
  if (row.isPauseBanner) return 2;
  if (row.isWoHeader) return 3;
  if (row.action === "WO_START") return 4;
  return 5;
}

function sortRowsForWeb(left: ReportRow, right: ReportRow): number {
  if (right.timestamp !== left.timestamp) {
    return right.timestamp - left.timestamp;
  }

  const priorityDiff = rowPriority(left) - rowPriority(right);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const leftLogId = typeof left.logId === "number" ? left.logId : -1;
  const rightLogId = typeof right.logId === "number" ? right.logId : -1;
  if (rightLogId !== leftLogId) {
    return rightLogId - leftLogId;
  }

  return left.rowId.localeCompare(right.rowId);
}

function shouldAssignSerialNumber(row: ReportRow): boolean {
  return !row.isWoHeader && !row.isWoSummary && !row.isPauseBanner && !row.isComputed;
}

function assignSerialNumbers(rows: ReportRow[]): ReportRow[] {
  let nextSerial = 1;
  return rows.map((row) => {
    if (!shouldAssignSerialNumber(row)) {
      if (row.sNo == null) {
        return row;
      }
      const nextRow = { ...row };
      delete nextRow.sNo;
      return nextRow;
    }

    return {
      ...row,
      sNo: nextSerial++,
    };
  });
}

export function buildWebLogRows(
  logs: DeviceLogEntry[],
  processedRows: ReportRow[],
  woDetailsMap: Map<number, WoDetails>,
): ReportRow[] {
  const rawRows = buildRawLogRows(logs, woDetailsMap);
  const existingLogIds = new Set<number>();

  for (const row of processedRows) {
    if (typeof row.logId === "number") {
      existingLogIds.add(row.logId);
      continue;
    }

    const originalLogId = row.originalLog?.log_id;
    if (typeof originalLogId === "number") {
      existingLogIds.add(originalLogId);
    }
  }

  const missingRawRows = rawRows.filter(
    (row) => typeof row.logId === "number" && !existingLogIds.has(row.logId),
  );

  const mergedRows = [...processedRows, ...missingRawRows].sort(sortRowsForWeb);
  return assignSerialNumbers(mergedRows);
}
