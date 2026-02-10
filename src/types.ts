export const DEFAULT_BREAK_KEYWORDS = ["tea", "dinner", "meeting"] as const;

export type Classification = "GOOD" | "WARNING" | "BAD" | "UNKNOWN";
export type RowKind = "WO" | "EXTENSION";
export type RowCategory = "PRODUCTION" | "DOWNTIME" | "UNKNOWN";
export type BaselineSource = "TARGET" | "ROLLING_MEDIAN" | "DEFAULT";

export type ReasonCode =
  | "WITHIN_THRESHOLD"
  | "LOWER_THAN_THRESHOLD"
  | "HIGHER_THAN_THRESHOLD"
  | "SEVERE_LOWER"
  | "SEVERE_HIGHER"
  | "INVALID_TIMESTAMP"
  | "INVALID_DURATION"
  | "MISSING_BASELINE"
  | "BREAK_CONTEXT"
  | "EXTENSION_EVENT"
  | "TARGET_ZERO_TIME_SAVED_POSITIVE"
  | "TIME_SAVED_INCONSISTENT"
  | "OK_QTY_EXCEEDS_ALLOTED"
  | "QTY_SANITY_LIMIT_EXCEEDED";

export interface ApiError {
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export interface WoApiResponse {
  success: boolean;
  error: ApiError | null;
  result?: {
    wo?: RawWorkOrder;
    extensions?: RawExtension[];
  } | null;
}

export interface RawWorkOrder {
  id?: number;
  wo_id?: string;
  start_uid?: number | null;
  device_id?: number | null;
  setting?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  part_no?: string | null;
  alloted_qty?: number | null;
  start_comment?: string | null;
  pcl?: number | null;
  job_type?: number | null;
  target_duration?: number | null;
  ok_qty?: number | null;
  reject_qty?: number | null;
  stop_comment?: string | null;
  stop_uid?: number | null;
  status?: string | null;
  duration?: number | null;
  start_name?: string | null;
  stop_name?: string | null;
  time_saved?: number | null;
  load_time?: number | null;
  idle_time?: number | null;
}

export interface RawExtension {
  id?: number;
  wo_id?: number;
  extension_time?: string | null;
  extension_comment?: string | null;
  extension_duration?: number | null;
}

export interface ParsedWorkOrder {
  id: number;
  woId: string;
  deviceId: number | null;
  partNo: string | null;
  status: string | null;
  startTime: Date | null;
  endTime: Date | null;
  durationSec: number | null;
  targetDurationSec: number | null;
  timeSavedSec: number | null;
  allotedQty: number | null;
  okQty: number | null;
  rejectQty: number | null;
  loadTimeSec: number | null;
  idleTimeSec: number | null;
  startComment: string | null;
  stopComment: string | null;
}

export interface ParsedExtension {
  id: number;
  woId: number | null;
  extensionTime: Date | null;
  extensionComment: string | null;
  extensionDurationSec: number | null;
  isBreakLike: boolean;
}

export interface ParsedPayload {
  workOrder: ParsedWorkOrder | null;
  extensions: ParsedExtension[];
}

export interface BaselineResolution {
  source: BaselineSource;
  idealCycleSec: number;
}

export interface ThresholdWindow {
  greenLowerSec: number;
  greenUpperSec: number;
  warningLowerSec: number;
  warningUpperSec: number;
}

export interface ClassificationOptions {
  historyDurationsSec?: number[];
  fallbackIdealSec?: number;
  rollingMedianWindow?: number;
  thresholdPct?: number;
  minThresholdSec?: number;
  warningPct?: number;
  breakKeywords?: readonly string[];
  quantitySanityMultiplier?: number;
}

export interface ClassifiedRowBase {
  rowKind: RowKind;
  category: RowCategory;
  classification: Classification;
  reasonCode: ReasonCode;
  reasonText: string;
}

export interface ClassifiedWorkOrderRow extends ClassifiedRowBase {
  rowKind: "WO";
  category: "PRODUCTION" | "UNKNOWN";
  workOrder: ParsedWorkOrder;
  metrics: {
    actualSec: number | null;
    idealSec: number | null;
    deltaSec: number | null;
    deltaPct: number | null;
  };
  baselineSource: BaselineSource | null;
}

export interface ClassifiedExtensionRow extends ClassifiedRowBase {
  rowKind: "EXTENSION";
  category: "DOWNTIME";
  extension: ParsedExtension;
}

export type ClassifiedRow = ClassifiedWorkOrderRow | ClassifiedExtensionRow;

export interface FilterState {
  mode: "GOOD_ONLY" | "GOOD_WARNING" | "ALL";
  includeUnknown: boolean;
  includeBreakExtensions: boolean;
}
