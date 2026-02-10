import { DEFAULT_BREAK_KEYWORDS } from "./types.js";
import type {
  ParsedExtension,
  ParsedPayload,
  ParsedWorkOrder,
  RawExtension,
  RawWorkOrder,
  WoApiResponse,
} from "./types.js";

const INVALID_ID = -1;

const toNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const toDateOrNull = (value: unknown): Date | null => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const hasBreakKeyword = (
  comment: string | null | undefined,
  breakKeywords: readonly string[] = DEFAULT_BREAK_KEYWORDS,
): boolean => {
  if (!comment) {
    return false;
  }
  const lowered = comment.toLowerCase();
  return breakKeywords.some((keyword) => lowered.includes(keyword.toLowerCase()));
};

export const parseWorkOrder = (raw: RawWorkOrder): ParsedWorkOrder => ({
  id: toNumber(raw.id) ?? INVALID_ID,
  woId: toStringOrNull(raw.wo_id) ?? "",
  deviceId: toNumber(raw.device_id),
  partNo: toStringOrNull(raw.part_no),
  status: toStringOrNull(raw.status),
  startTime: toDateOrNull(raw.start_time),
  endTime: toDateOrNull(raw.end_time),
  durationSec: toNumber(raw.duration),
  targetDurationSec: toNumber(raw.target_duration),
  timeSavedSec: toNumber(raw.time_saved),
  allotedQty: toNumber(raw.alloted_qty),
  okQty: toNumber(raw.ok_qty),
  rejectQty: toNumber(raw.reject_qty),
  loadTimeSec: toNumber(raw.load_time),
  idleTimeSec: toNumber(raw.idle_time),
  startComment: toStringOrNull(raw.start_comment),
  stopComment: toStringOrNull(raw.stop_comment),
});

export const parseExtension = (
  raw: RawExtension,
  breakKeywords: readonly string[] = DEFAULT_BREAK_KEYWORDS,
): ParsedExtension => {
  const extensionComment = toStringOrNull(raw.extension_comment);
  return {
    id: toNumber(raw.id) ?? INVALID_ID,
    woId: toNumber(raw.wo_id),
    extensionTime: toDateOrNull(raw.extension_time),
    extensionComment,
    extensionDurationSec: toNumber(raw.extension_duration),
    isBreakLike: hasBreakKeyword(extensionComment, breakKeywords),
  };
};

export const parseWoApiResponse = (
  response: WoApiResponse,
  breakKeywords: readonly string[] = DEFAULT_BREAK_KEYWORDS,
): ParsedPayload => {
  const workOrder = response.result?.wo ? parseWorkOrder(response.result.wo) : null;
  const rawExtensions = response.result?.extensions ?? [];
  const extensions = rawExtensions.map((item) => parseExtension(item, breakKeywords));
  return { workOrder, extensions };
};
