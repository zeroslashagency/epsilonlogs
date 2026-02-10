import { resolveBaseline } from "./baseline.js";
import { parseWoApiResponse } from "./parser.js";
import { buildThresholdWindow } from "./threshold.js";
import type {
  Classification,
  ClassificationOptions,
  ClassifiedExtensionRow,
  ClassifiedRow,
  ClassifiedWorkOrderRow,
  ParsedExtension,
  ParsedPayload,
  ParsedWorkOrder,
  ReasonCode,
  WoApiResponse,
} from "./types.js";

const isValidDate = (value: Date | null): value is Date =>
  value !== null && !Number.isNaN(value.getTime());

const reasonTextForDelta = (deltaSec: number): string =>
  deltaSec >= 0
    ? `${Math.abs(Math.round(deltaSec))} sec excess`
    : `${Math.abs(Math.round(deltaSec))} sec lower`;

const reasonTextForCode = (code: ReasonCode): string => {
  switch (code) {
    case "WITHIN_THRESHOLD":
      return "Within green threshold";
    case "LOWER_THAN_THRESHOLD":
      return "Below expected cycle time";
    case "HIGHER_THAN_THRESHOLD":
      return "Above expected cycle time";
    case "SEVERE_LOWER":
      return "Severely below expected cycle time";
    case "SEVERE_HIGHER":
      return "Severely above expected cycle time";
    case "INVALID_TIMESTAMP":
      return "Invalid or missing timestamp";
    case "INVALID_DURATION":
      return "Invalid or non-positive duration";
    case "MISSING_BASELINE":
      return "Unable to resolve baseline";
    case "BREAK_CONTEXT":
      return "Break or non-production context";
    case "EXTENSION_EVENT":
      return "Extension/downtime event";
    case "TARGET_ZERO_TIME_SAVED_POSITIVE":
      return "Target is zero but time_saved is positive";
    case "TIME_SAVED_INCONSISTENT":
      return "time_saved is inconsistent with computed delta";
    case "OK_QTY_EXCEEDS_ALLOTED":
      return "ok_qty exceeds alloted_qty";
    case "QTY_SANITY_LIMIT_EXCEEDED":
      return "Quantity exceeds sanity limit";
    default: {
      const _unreachable: never = code;
      return _unreachable;
    }
  }
};

const pickDirectionalReason = (classification: Classification, deltaSec: number): ReasonCode => {
  if (classification === "GOOD") {
    return "WITHIN_THRESHOLD";
  }
  if (classification === "WARNING") {
    return deltaSec < 0 ? "LOWER_THAN_THRESHOLD" : "HIGHER_THAN_THRESHOLD";
  }
  return deltaSec < 0 ? "SEVERE_LOWER" : "SEVERE_HIGHER";
};

export const classifyWorkOrder = (
  workOrder: ParsedWorkOrder,
  options: ClassificationOptions = {},
): ClassifiedWorkOrderRow => {
  const {
    historyDurationsSec = [],
    fallbackIdealSec = 120,
    rollingMedianWindow = 20,
    thresholdPct = 0.1,
    minThresholdSec = 5,
    warningPct = 0.25,
    quantitySanityMultiplier = 2,
  } = options;

  if (!isValidDate(workOrder.startTime) || !isValidDate(workOrder.endTime)) {
    return {
      rowKind: "WO",
      category: "UNKNOWN",
      classification: "UNKNOWN",
      reasonCode: "INVALID_TIMESTAMP",
      reasonText: reasonTextForCode("INVALID_TIMESTAMP"),
      workOrder,
      baselineSource: null,
      metrics: { actualSec: workOrder.durationSec, idealSec: null, deltaSec: null, deltaPct: null },
    };
  }

  if (workOrder.durationSec === null || workOrder.durationSec <= 0) {
    return {
      rowKind: "WO",
      category: "UNKNOWN",
      classification: "UNKNOWN",
      reasonCode: "INVALID_DURATION",
      reasonText: reasonTextForCode("INVALID_DURATION"),
      workOrder,
      baselineSource: null,
      metrics: { actualSec: workOrder.durationSec, idealSec: null, deltaSec: null, deltaPct: null },
    };
  }

  const baseline = resolveBaseline({
    targetDurationSec: workOrder.targetDurationSec,
    historyDurationsSec,
    defaultIdealSec: fallbackIdealSec,
    rollingMedianWindow,
  });

  if (baseline.idealCycleSec <= 0) {
    return {
      rowKind: "WO",
      category: "UNKNOWN",
      classification: "UNKNOWN",
      reasonCode: "MISSING_BASELINE",
      reasonText: reasonTextForCode("MISSING_BASELINE"),
      workOrder,
      baselineSource: null,
      metrics: {
        actualSec: workOrder.durationSec,
        idealSec: null,
        deltaSec: null,
        deltaPct: null,
      },
    };
  }

  const thresholds = buildThresholdWindow({
    idealCycleSec: baseline.idealCycleSec,
    thresholdPct,
    minThresholdSec,
    warningPct,
  });

  const actualSec = workOrder.durationSec;
  const idealSec = baseline.idealCycleSec;
  const deltaSec = actualSec - idealSec;
  const deltaPct = (deltaSec / idealSec) * 100;

  let classification: Classification;
  if (actualSec >= thresholds.greenLowerSec && actualSec <= thresholds.greenUpperSec) {
    classification = "GOOD";
  } else if (actualSec >= thresholds.warningLowerSec && actualSec <= thresholds.warningUpperSec) {
    classification = "WARNING";
  } else {
    classification = "BAD";
  }

  let reasonCode = pickDirectionalReason(classification, deltaSec);
  let reasonText =
    reasonCode === "WITHIN_THRESHOLD" ? reasonTextForCode(reasonCode) : reasonTextForDelta(deltaSec);

  const expectedTimeSaved =
    workOrder.targetDurationSec !== null ? workOrder.targetDurationSec - actualSec : null;
  const hasTargetZeroPositiveTimeSaved =
    workOrder.targetDurationSec === 0 &&
    workOrder.timeSavedSec !== null &&
    workOrder.timeSavedSec > 0;
  const hasInconsistentTimeSaved =
    workOrder.timeSavedSec !== null &&
    expectedTimeSaved !== null &&
    Math.abs(workOrder.timeSavedSec - expectedTimeSaved) > 1;
  const hasOkQtyOverrun =
    workOrder.okQty !== null &&
    workOrder.allotedQty !== null &&
    workOrder.allotedQty >= 0 &&
    workOrder.okQty > workOrder.allotedQty;
  const totalQty =
    (workOrder.okQty ?? 0) +
    (workOrder.rejectQty ?? 0);
  const hasSanityLimitExceeded =
    workOrder.allotedQty !== null &&
    workOrder.allotedQty > 0 &&
    totalQty > workOrder.allotedQty * quantitySanityMultiplier;

  if (classification === "GOOD" && hasTargetZeroPositiveTimeSaved) {
    classification = "WARNING";
    reasonCode = "TARGET_ZERO_TIME_SAVED_POSITIVE";
    reasonText = reasonTextForCode(reasonCode);
  } else if (classification === "GOOD" && hasSanityLimitExceeded) {
    classification = "WARNING";
    reasonCode = "QTY_SANITY_LIMIT_EXCEEDED";
    reasonText = reasonTextForCode(reasonCode);
  } else if (classification === "GOOD" && hasOkQtyOverrun) {
    classification = "WARNING";
    reasonCode = "OK_QTY_EXCEEDS_ALLOTED";
    reasonText = reasonTextForCode(reasonCode);
  } else if (hasInconsistentTimeSaved) {
    // Keep color based on computed delta, not time_saved, per product rule.
    reasonText = `${reasonText} (time_saved mismatch)`;
  }

  return {
    rowKind: "WO",
    category: "PRODUCTION",
    classification,
    reasonCode,
    reasonText,
    workOrder,
    baselineSource: baseline.source,
    metrics: { actualSec, idealSec, deltaSec, deltaPct },
  };
};

export const classifyExtension = (extension: ParsedExtension): ClassifiedExtensionRow => {
  const reasonCode: ReasonCode = extension.isBreakLike ? "BREAK_CONTEXT" : "EXTENSION_EVENT";
  return {
    rowKind: "EXTENSION",
    category: "DOWNTIME",
    classification: "UNKNOWN",
    reasonCode,
    reasonText: reasonTextForCode(reasonCode),
    extension,
  };
};

const timelineSortKey = (row: ClassifiedRow): number => {
  if (row.rowKind === "WO") {
    return row.workOrder.startTime?.getTime() ?? Number.MIN_SAFE_INTEGER;
  }
  return row.extension.extensionTime?.getTime() ?? Number.MIN_SAFE_INTEGER;
};

export const classifyParsedPayload = (
  payload: ParsedPayload,
  options: ClassificationOptions = {},
): ClassifiedRow[] => {
  const rows: ClassifiedRow[] = [];
  if (payload.workOrder) {
    rows.push(classifyWorkOrder(payload.workOrder, options));
  }
  rows.push(...payload.extensions.map((item) => classifyExtension(item)));
  return rows.sort((a, b) => timelineSortKey(b) - timelineSortKey(a));
};

export const classifyApiPayload = (
  response: WoApiResponse,
  options: ClassificationOptions = {},
): ClassifiedRow[] => {
  const parsed = parseWoApiResponse(response, options.breakKeywords);
  return classifyParsedPayload(parsed, options);
};
