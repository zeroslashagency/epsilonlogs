import React from "react";
import { ReportRow } from "./report-types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDuration } from "./format-utils";
import {
  CheckCircle2,
  Loader2,
  PauseCircle,
  Zap,
  ZapOff,
  Play,
  Square,
  Key,
  Clock,
  ChevronRight,
  Cpu,
  User,
  Package,
  TimerOff,
  ChevronDown,
} from "lucide-react";
import { getMachineLabel } from "./machine-config";
import type { PersonnelOverlapCompareWindow } from "./personnel-report-utils";
import type { WoDetails } from "./report-types";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function fmt(v: string | number | null | undefined, fb = "—"): string {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || fb;
}

function fmtTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}  ${hh}:${min}:${ss}`;
}

const COMPARE_LANE_GRID_TEMPLATE =
  "52px 70px 104px 96px 112px 112px minmax(220px,1fr) 120px 120px 140px";

function buildWoDetailsByWoIdStr(
  woDetailsMap?: Map<number, WoDetails>,
): Map<string, WoDetails> {
  const byWoIdStr = new Map<string, WoDetails>();

  if (!woDetailsMap) {
    return byWoIdStr;
  }

  for (const details of woDetailsMap.values()) {
    if (details.wo_id_str) {
      byWoIdStr.set(details.wo_id_str, details);
    }
  }

  return byWoIdStr;
}

function resolveRowMachineLabel(
  row: ReportRow,
  woDetailsByWoIdStr?: Map<string, WoDetails>,
): string {
  const deviceId =
    row.originalLog?.device_id ??
    row.woHeaderData?.deviceId ??
    row.woSummaryData?.deviceId;

  if (typeof deviceId === "number" && deviceId > 0) {
    return getMachineLabel(deviceId);
  }

  const woId = row.woSpecs?.woId;
  if (woId && woDetailsByWoIdStr) {
    const details = woDetailsByWoIdStr.get(woId);
    if (
      details &&
      typeof details.device_id === "number" &&
      details.device_id > 0
    ) {
      return getMachineLabel(details.device_id);
    }
  }

  return "—";
}

type WorkOrderSpan = {
  startRowId: string;
  woId: string | undefined;
  rows: ReportRow[];
  startRow: ReportRow;
  stopRow: ReportRow | undefined;
  machineLabel: string;
  operatorName: string | undefined;
  jobType: string | undefined;
  partNo: string | undefined;
  setting: string | undefined;
  startComment: string | undefined;
  stopComment: string | undefined;
  allottedQty: number | undefined;
  okQty: number | undefined;
  rejectQty: number | undefined;
  logCount: number;
  startTime: Date;
  endTime: Date;
  totalDurationText: string;
  cuttingText: string;
  loadingText: string;
  pauseText: string;
  idealText: string;
  timelineText: string;
};

function getRowWoId(row: ReportRow): string | undefined {
  const candidates = [
    row.woSpecs?.woId,
    typeof row.originalLog?.wo_id === "number"
      ? String(row.originalLog.wo_id)
      : undefined,
    row.woHeaderData?.woIdStr,
    row.woSummaryData?.woIdStr,
  ];

  return candidates.find((value) => !!value && value.trim().length > 0);
}

function formatDurationValue(seconds: number | null | undefined): string {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? formatDuration(Math.max(0, seconds))
    : "—";
}

function buildTimelineText(rows: ReportRow[]): string {
  const actions: string[] = [];

  for (const row of rows) {
    const action = getRowDisplayAction(row);
    if (!action) {
      continue;
    }

    if (actions[actions.length - 1] !== action) {
      actions.push(action);
    }
  }

  if (actions.length === 0) {
    return "—";
  }

  if (actions.length <= 8) {
    return actions.join(" -> ");
  }

  return `${actions.slice(0, 7).join(" -> ")} -> +${actions.length - 7} more`;
}

function buildWorkOrderSpans(
  rows: ReportRow[],
  woDetailsByWoIdStr: Map<string, WoDetails>,
): Map<string, WorkOrderSpan> {
  const regularRows = rows.filter(
    (row) => !row.isPauseBanner && !row.isWoHeader && !row.isWoSummary,
  );
  const spans = new Map<string, WorkOrderSpan>();

  for (let index = 0; index < regularRows.length; index += 1) {
    const startRow = regularRows[index];
    if (!startRow) {
      continue;
    }

    if (getRowDisplayAction(startRow) !== "WO_START") {
      continue;
    }

    const startWoId = getRowWoId(startRow);
    let stopIndex = -1;
    let nextStartIndex = -1;

    for (
      let candidateIndex = index + 1;
      candidateIndex < regularRows.length;
      candidateIndex += 1
    ) {
      const candidate = regularRows[candidateIndex];
      if (!candidate) {
        continue;
      }

      const candidateAction = getRowDisplayAction(candidate);
      const candidateWoId = getRowWoId(candidate);

      if (
        candidateAction === "WO_START" &&
        nextStartIndex === -1 &&
        (!startWoId || (candidateWoId && candidateWoId !== startWoId))
      ) {
        nextStartIndex = candidateIndex;
        break;
      }

      if (
        candidateAction === "WO_STOP" &&
        (!startWoId || !candidateWoId || candidateWoId === startWoId)
      ) {
        stopIndex = candidateIndex;
        break;
      }
    }

    const endIndex =
      stopIndex >= 0
        ? stopIndex
        : nextStartIndex >= 0
          ? nextStartIndex - 1
          : regularRows.length - 1;
    const spanRows = regularRows.slice(index, endIndex + 1);
    if (spanRows.length === 0) {
      continue;
    }

    const stopRow = stopIndex >= 0 ? regularRows[stopIndex] : undefined;
    const details = startWoId ? woDetailsByWoIdStr.get(startWoId) : undefined;
    const spanEndRow = stopRow ?? spanRows[spanRows.length - 1];
    if (!spanEndRow) {
      continue;
    }

    const computedCuttingSec = spanRows.reduce((total, row) => {
      if (
        row.isComputed ||
        !row.jobBlockLabel ||
        typeof row.durationSec !== "number"
      ) {
        return total;
      }

      return total + row.durationSec;
    }, 0);
    const computedLoadingSec = spanRows.reduce((total, row) => {
      if (!row.isComputed || typeof row.durationSec !== "number") {
        return total;
      }

      return row.label?.toLowerCase().includes("load")
        ? total + row.durationSec
        : total;
    }, 0);
    const computedPauseSec = spanRows.reduce((total, row) => {
      if (
        getRowDisplayAction(row) !== "WO_PAUSE" ||
        typeof row.durationSec !== "number"
      ) {
        return total;
      }

      return total + row.durationSec;
    }, 0);
    const computedIdealSec = spanRows.reduce((total, row) => {
      if (!row.isComputed || typeof row.durationSec !== "number") {
        return total;
      }

      return row.label?.toLowerCase().includes("ideal")
        ? total + row.durationSec
        : total;
    }, 0);
    const totalDurationSec =
      details?.duration ??
      Math.max(
        0,
        Math.round(
          (spanEndRow.logTime.getTime() - startRow.logTime.getTime()) / 1000,
        ),
      );
    const cuttingSec =
      computedCuttingSec > 0
        ? computedCuttingSec
        : totalDurationSec -
          (details?.load_time ?? 0) -
          (details?.idle_time ?? 0);
    const loadingSec =
      computedLoadingSec > 0
        ? computedLoadingSec
        : (details?.load_time ?? undefined);
    const pauseSec =
      computedPauseSec > 0
        ? computedPauseSec
        : (details?.idle_time ?? undefined);
    const idealSec =
      computedIdealSec > 0
        ? computedIdealSec
        : (details?.target_duration ?? details?.pcl ?? undefined);

    spans.set(startRow.rowId, {
      startRowId: startRow.rowId,
      woId: startWoId,
      rows: spanRows,
      startRow,
      stopRow,
      machineLabel: resolveRowMachineLabel(startRow, woDetailsByWoIdStr),
      operatorName:
        startRow.operatorName ?? details?.start_name ?? stopRow?.operatorName,
      jobType:
        startRow.jobType && startRow.jobType !== "Unknown"
          ? String(startRow.jobType)
          : stopRow?.jobType
            ? String(stopRow.jobType)
            : undefined,
      partNo:
        startRow.startRowData?.partNo ??
        (typeof startRow.originalLog?.part_no === "string"
          ? startRow.originalLog.part_no
          : undefined) ??
        details?.part_no,
      setting:
        (typeof startRow.originalLog?.setting === "string"
          ? startRow.originalLog.setting
          : undefined) ?? details?.setting,
      startComment:
        startRow.startRowData?.comment ||
        (typeof startRow.originalLog?.start_comment === "string"
          ? startRow.originalLog.start_comment
          : undefined) ||
        details?.start_comment,
      stopComment:
        stopRow?.stopRowData?.reason ||
        (typeof stopRow?.originalLog?.stop_comment === "string"
          ? stopRow.originalLog.stop_comment
          : undefined) ||
        details?.stop_comment,
      allottedQty:
        startRow.startRowData?.allotted ??
        startRow.woSpecs?.allotted ??
        details?.alloted_qty,
      okQty: stopRow?.stopRowData?.ok ?? details?.ok_qty,
      rejectQty: stopRow?.stopRowData?.reject ?? details?.reject_qty,
      logCount: spanRows.filter((row) => row.logId != null || row.originalLog)
        .length,
      startTime: startRow.logTime,
      endTime: spanEndRow.logTime,
      totalDurationText: formatDurationValue(totalDurationSec),
      cuttingText: formatDurationValue(cuttingSec > 0 ? cuttingSec : undefined),
      loadingText: formatDurationValue(loadingSec),
      pauseText: formatDurationValue(pauseSec),
      idealText:
        typeof idealSec === "number" && Number.isFinite(idealSec)
          ? formatDurationValue(idealSec)
          : (startRow.woSpecs?.pclText ?? "—"),
      timelineText: buildTimelineText(spanRows),
    });
  }

  return spans;
}

function MachineCell({ label }: { label: string }) {
  if (!label || label === "—") {
    return <span className="text-slate-300 text-xs">—</span>;
  }

  return (
    <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-[4px] text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700 whitespace-nowrap">
      {label}
    </span>
  );
}

function WorkOrderSummaryPanel({ span }: { span: WorkOrderSpan }) {
  return (
    <div className="mx-4 mb-4 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.98)_100%)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_28px_-18px_rgba(15,23,42,0.35)]">
      <div className="flex flex-wrap items-center gap-2.5">
        <ActionBadge action="WO_START" />
        {span.machineLabel !== "—" ? (
          <MachineCell label={span.machineLabel} />
        ) : null}
        <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
          WO #{fmt(span.woId)}
        </span>
        <JobTypeBadge jobType={span.jobType} />
        {span.operatorName ? <OperatorCell name={span.operatorName} /> : null}
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
            span.stopRow
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {span.stopRow ? "Closed" : "Open"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Total Duration",
            value: span.totalDurationText,
            tone: "text-slate-800",
          },
          {
            label: "Cutting Time",
            value: span.cuttingText,
            tone: "text-emerald-700",
          },
          {
            label: "Loading Time",
            value: span.loadingText,
            tone: "text-blue-700",
          },
          {
            label: "Pause Time",
            value: span.pauseText,
            tone: "text-amber-700",
          },
          {
            label: "Ideal Time",
            value: span.idealText,
            tone: "text-violet-700",
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {metric.label}
            </div>
            <div
              className={cn("mt-1 font-mono text-sm font-bold", metric.tone)}
            >
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      <Separator className="my-4 bg-slate-200" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Work Order Window
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="font-mono">{fmtTime(span.startTime)}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              <span className="font-mono">{fmtTime(span.endTime)}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {span.logCount} logs included from WO_START to{" "}
              {span.stopRow ? "WO_STOP" : "the latest row"}.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Timeline
            </div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700">
              {span.timelineText}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Summary / Notes
            </div>
            <div className="mt-2 flex flex-col gap-2 text-xs text-slate-600">
              <div>
                <span className="font-bold uppercase tracking-[0.12em] text-slate-400">
                  Start
                </span>
                <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  {fmt(span.startComment)}
                </div>
              </div>
              <div>
                <span className="font-bold uppercase tracking-[0.12em] text-slate-400">
                  Stop
                </span>
                <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  {fmt(span.stopComment)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            WO Context
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              { label: "WO ID", value: fmt(span.woId) },
              { label: "Part No", value: fmt(span.partNo) },
              { label: "Setting", value: fmt(span.setting) },
              { label: "Allotted Qty", value: fmt(span.allottedQty) },
              { label: "OK Qty", value: fmt(span.okQty) },
              { label: "Reject Qty", value: fmt(span.rejectQty) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {item.label}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-700">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Action Badge ───────────────────────────────────────────────────────── */

type ActionCfg = { icon: React.ReactNode; label: string; cls: string };

function getActionCfg(action?: string): ActionCfg {
  switch (action) {
    case "M30_CHANGED":
      return {
        icon: <CheckCircle2 className="h-3 w-3" />,
        label: "M30 Changed",
        cls: "bg-emerald-600 text-white border-emerald-700 ring-emerald-400/30 shadow-sm shadow-emerald-200",
      };
    case "WO_START":
      return {
        icon: <Play className="h-3 w-3" />,
        label: "WO Start",
        cls: "bg-emerald-500 text-white border-emerald-600 ring-emerald-400/30 shadow-sm shadow-emerald-200",
      };
    case "WO_STOP":
      return {
        icon: <Square className="h-3 w-3" />,
        label: "WO Stop",
        cls: "bg-rose-500 text-white border-rose-600 ring-rose-400/30 shadow-sm shadow-rose-200",
      };
    case "WO_PAUSE":
      return {
        icon: <PauseCircle className="h-3 w-3" />,
        label: "Paused",
        cls: "bg-amber-400 text-amber-950 border-amber-500 ring-amber-300/30 shadow-sm shadow-amber-200",
      };
    case "WO_RESUME":
      return {
        icon: <Play className="h-3 w-3" />,
        label: "Resumed",
        cls: "bg-blue-500 text-white border-blue-600 ring-blue-400/30 shadow-sm shadow-blue-200",
      };
    case "SPINDLE_ON":
      return {
        icon: <Zap className="h-3 w-3" />,
        label: "Spindle On",
        cls: "bg-teal-500 text-white border-teal-600 ring-teal-400/30 shadow-sm shadow-teal-200",
      };
    case "SPINDLE_OFF":
      return {
        icon: <ZapOff className="h-3 w-3" />,
        label: "Spindle Off",
        cls: "bg-slate-700 text-white border-slate-800 ring-slate-500/30 shadow-sm shadow-slate-300",
      };
    case "MTR_ON":
      return {
        icon: <Play className="h-3 w-3" />,
        label: "Maint. On",
        cls: "bg-orange-500 text-white border-orange-600 ring-orange-400/30 shadow-sm shadow-orange-200",
      };
    case "MTR_OFF":
      return {
        icon: <Square className="h-3 w-3" />,
        label: "Maint. Off",
        cls: "bg-orange-700 text-white border-orange-800 ring-orange-500/30 shadow-sm shadow-orange-300",
      };
    case "KEY_ON":
      return {
        icon: <Key className="h-3 w-3" />,
        label: "Key On",
        cls: "bg-cyan-500 text-white border-cyan-600 ring-cyan-400/30 shadow-sm shadow-cyan-200",
      };
    case "KEY_OFF":
      return {
        icon: <Key className="h-3 w-3" />,
        label: "Key Off",
        cls: "bg-purple-600 text-white border-purple-700 ring-purple-400/30 shadow-sm shadow-purple-200",
      };
    default:
      return {
        icon: <Cpu className="h-3 w-3" />,
        label: action || "—",
        cls: "bg-slate-600 text-white border-slate-700 ring-slate-400/30",
      };
  }
}

function getRowDisplayAction(row: ReportRow): string | undefined {
  return row.displayAction ?? row.action ?? undefined;
}

function ActionBadge({ action }: { action?: string | undefined }) {
  if (!action) return <span className="text-slate-400 text-xs">—</span>;
  const { icon, label, cls } = getActionCfg(action);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full",
        "text-[11px] font-semibold border ring-1 ring-inset",
        "select-none whitespace-nowrap",
        cls,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

/* ─── Status Pill (Done / In Process / Paused) ───────────────────────────── */

function StatusPill({ action }: { action?: string | undefined }) {
  if (!action) return null;
  const done = ["WO_STOP", "SPINDLE_OFF", "KEY_OFF"];
  const active = ["WO_START", "SPINDLE_ON", "WO_RESUME", "KEY_ON"];
  const paused = ["WO_PAUSE"];

  if (done.includes(action))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
        <CheckCircle2 className="h-2.5 w-2.5 flex-shrink-0" />
        Done
      </span>
    );
  if (active.includes(action))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap">
        <Loader2 className="h-2.5 w-2.5 flex-shrink-0 animate-spin" />
        In Process
      </span>
    );
  if (paused.includes(action))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
        <PauseCircle className="h-2.5 w-2.5 flex-shrink-0" />
        Paused
      </span>
    );
  return null;
}

/* ─── Label Badge ────────────────────────────────────────────────────────── */

function LabelBadge({
  label,
  jobBlockLabel,
  isFirstInBlock,
}: {
  label?: string | undefined;
  jobBlockLabel?: string | undefined;
  isFirstInBlock?: boolean | undefined;
}) {
  /* ── First row of a job block — filled emerald pill ── */
  if (isFirstInBlock && jobBlockLabel) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-bold bg-emerald-500 text-white whitespace-nowrap tracking-wide border border-emerald-600"
        style={{ boxShadow: "0 2px 8px rgba(5,150,105,0.35)" }}
      >
        <ChevronRight className="h-3 w-3" />
        {jobBlockLabel}
      </span>
    );
  }

  /* ── Subsequent rows in a job block — muted outline pill ── */
  if (jobBlockLabel) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
        {jobBlockLabel}
      </span>
    );
  }

  if (!label) return <span className="text-slate-300 text-xs">—</span>;
  const lo = label.toLowerCase();
  if (lo.includes("idle"))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600 border border-slate-300 whitespace-nowrap">
        <TimerOff className="h-2.5 w-2.5 flex-shrink-0" />
        {label}
      </span>
    );
  if (lo.includes("load"))
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-[4px] rounded-full text-[10px] font-semibold bg-blue-500 text-white border border-blue-600 whitespace-nowrap"
        style={{ boxShadow: "0 1px 4px rgba(59,130,246,0.3)" }}
      >
        <Package className="h-2.5 w-2.5 flex-shrink-0" />
        {label}
      </span>
    );
  if (lo.includes("ideal"))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold bg-violet-100 text-violet-800 border border-violet-300 whitespace-nowrap">
        <Clock className="h-2.5 w-2.5 flex-shrink-0" />
        {label}
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-[3px] rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700 border border-slate-300 whitespace-nowrap">
      {label}
    </span>
  );
}

/* ─── Duration Chip ──────────────────────────────────────────────────────── */

function DurationChip({
  durationText,
  varianceColor,
  className,
}: {
  durationText?: string | undefined;
  varianceColor?: "red" | "green" | "neutral" | undefined;
  className?: string | undefined;
}) {
  if (!durationText) return <span className="text-slate-300 text-xs">—</span>;
  const cls =
    varianceColor === "red"
      ? "text-white bg-rose-500 border-rose-600 shadow-sm shadow-rose-200"
      : varianceColor === "green"
        ? "text-white bg-emerald-500 border-emerald-600 shadow-sm shadow-emerald-200"
        : "text-slate-700 bg-slate-100 border-slate-300 shadow-sm";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-[4px] rounded-full font-mono text-[11px] font-semibold border",
        cls,
        className,
      )}
    >
      <Clock className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
      {durationText}
    </span>
  );
}

/* ─── Job Type Badge ─────────────────────────────────────────────────────── */

const JT_COLORS: Record<string, string> = {
  Production: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Setting: "bg-orange-100 text-orange-800 border-orange-300",
  Calibration: "bg-violet-100 text-violet-800 border-violet-300",
  Maintenance: "bg-red-100 text-red-800 border-red-300",
  Man: "bg-slate-200 text-slate-700 border-slate-300",
  Training: "bg-sky-100 text-sky-800 border-sky-300",
  RD: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
  "Man Production": "bg-teal-100 text-teal-800 border-teal-300",
  "Man Setting": "bg-pink-100 text-pink-800 border-pink-300",
  "Manual Input": "bg-yellow-100 text-yellow-800 border-yellow-300",
};

function JobTypeBadge({ jobType }: { jobType?: string | undefined }) {
  if (!jobType || jobType === "Unknown")
    return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-[3px] rounded-full text-[10px] font-bold border whitespace-nowrap",
        JT_COLORS[jobType] ?? "bg-slate-200 text-slate-700 border-slate-300",
      )}
    >
      {jobType}
    </span>
  );
}

/* ─── Operator Avatar ────────────────────────────────────────────────────── */

const AV_COLORS = [
  "bg-indigo-500 text-white",
  "bg-violet-500 text-white",
  "bg-emerald-500 text-white",
  "bg-sky-500 text-white",
  "bg-orange-500 text-white",
  "bg-pink-500 text-white",
  "bg-teal-500 text-white",
  "bg-rose-500 text-white",
  "bg-cyan-600 text-white",
  "bg-amber-500 text-white",
];

function OperatorCell({ name }: { name?: string | undefined }) {
  if (!name) return <span className="text-slate-300 text-xs">—</span>;
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const colorCls =
    AV_COLORS[
      name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length
    ];
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className={cn(
          "flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold shadow-sm",
          colorCls,
        )}
      >
        {initials}
      </span>
      <span
        className="text-xs font-semibold text-slate-700 truncate max-w-[80px]"
        title={name}
      >
        {name}
      </span>
    </div>
  );
}

/* ─── WO Specs Cell ──────────────────────────────────────────────────────── */

function WoSpecsCell({
  woSpecs,
}: {
  woSpecs?: { woId: string; pclText: string; allotted: number } | undefined;
}) {
  if (!woSpecs) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-extrabold text-indigo-600 text-[12px] font-mono leading-tight tracking-tight">
        #{woSpecs.woId}
      </span>
      <span className="text-[10px] text-slate-400 leading-tight">
        PCL: <span className="font-bold text-slate-600">{woSpecs.pclText}</span>
      </span>
      <span className="text-[10px] text-slate-400 leading-tight">
        Allot:{" "}
        <span className="font-bold text-slate-600">{woSpecs.allotted}</span>
      </span>
    </div>
  );
}

/* ─── Summary / Notes Cell ───────────────────────────────────────────────── */

function SummaryCell({ row }: { row: ReportRow }) {
  /* WO_START */
  if (row.startRowData) {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          <span className="font-bold uppercase tracking-widest text-slate-400">
            Part No
          </span>
          <span className="font-mono font-bold text-slate-800">
            {fmt(row.startRowData.partNo)}
          </span>
          <span className="text-slate-300">·</span>
          <span className="font-bold uppercase tracking-widest text-slate-400">
            Allotted
          </span>
          <span className="font-bold text-blue-700">
            {row.startRowData.allotted}
          </span>
        </div>
        {row.startRowData.comment && (
          <div className="flex items-center gap-1 text-[10px]">
            <span className="font-bold uppercase tracking-widest text-slate-400 flex-shrink-0">
              Note
            </span>
            <span className="italic text-slate-500 truncate max-w-[200px]">
              {fmt(row.startRowData.comment)}
            </span>
          </div>
        )}
        {row.durationText && (
          <DurationChip
            durationText={row.durationText ?? undefined}
            varianceColor={row.varianceColor ?? undefined}
          />
        )}
      </div>
    );
  }

  /* WO_STOP */
  if (row.stopRowData) {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold">
            OK
          </span>
          <span className="font-bold text-emerald-700">
            {fmt(row.stopRowData.ok)}
          </span>
          <span className="text-slate-300">·</span>
          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 font-bold">
            Rej
          </span>
          <span className="font-bold text-rose-700">
            {fmt(row.stopRowData.reject)}
          </span>
        </div>
        {row.stopRowData.reason && (
          <div className="flex items-center gap-1 text-[10px]">
            <span className="font-bold uppercase tracking-widest text-slate-400 flex-shrink-0">
              Reason
            </span>
            <span className="font-medium text-slate-600 truncate max-w-[200px]">
              {fmt(row.stopRowData.reason)}
            </span>
          </div>
        )}
        {row.durationText && (
          <DurationChip
            durationText={row.durationText ?? undefined}
            varianceColor={row.varianceColor ?? undefined}
          />
        )}
      </div>
    );
  }

  /* Default */
  if (!row.durationText && !row.summary)
    return <span className="text-slate-300 text-xs">—</span>;

  return (
    <div className="flex flex-col gap-1.5 min-w-0 pr-4 mt-0.5">
      {row.summary && (
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-bold border w-fit",
            row.varianceColor === "red"
              ? "bg-rose-50 border-rose-200 text-rose-600"
              : row.varianceColor === "green"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-50 border-slate-200 text-slate-600",
          )}
        >
          {row.summary}
        </span>
      )}
      {row.durationText && (
        <DurationChip
          durationText={row.durationText ?? undefined}
          varianceColor={row.varianceColor ?? undefined}
          className="w-full max-w-[200px]"
        />
      )}
    </div>
  );
}

/* ─── WO Header Banner ───────────────────────────────────────────────────── */

function WoHeaderRow({ row }: { row: ReportRow }) {
  const h = row.woHeaderData!;
  const machineLabel = getMachineLabel(h.deviceId);
  return (
    <tr>
      <td colSpan={11} className="p-0">
        <div
          className="px-5 py-3.5"
          style={{
            background:
              "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #3b82f6 100%)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {/* WO badge */}
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/15 backdrop-blur-sm text-white text-xs font-bold border border-white/20">
              <span className="text-blue-200 text-[9px] font-bold uppercase tracking-widest">
                WO
              </span>
              #{h.woIdStr}
            </span>
            <span className="w-px h-4 bg-white/25" />
            <div className="flex items-center gap-1 text-xs">
              <Package className="h-3.5 w-3.5 text-blue-300" />
              <span className="text-blue-300 font-medium">Part:</span>
              <span className="text-white font-bold">{fmt(h.partNo)}</span>
            </div>
            <span className="w-px h-4 bg-white/20" />
            <div className="flex items-center gap-1 text-xs">
              <User className="h-3.5 w-3.5 text-blue-300" />
              <span className="text-blue-300 font-medium">Operator:</span>
              <span className="text-white font-bold">
                {fmt(h.operatorName)}
              </span>
            </div>
            <span className="w-px h-4 bg-white/20" />
            <div className="flex items-center gap-1 text-xs">
              <span className="text-blue-300 font-medium">PCL:</span>
              <span className="text-white font-bold">{fmt(h.pclText)}</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-blue-300 font-medium">Setting:</span>
              <span className="text-white font-bold">{fmt(h.setting)}</span>
            </div>
            <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-900/40 text-blue-200 text-[9px] font-semibold border border-blue-700/40">
              <Cpu className="h-2.5 w-2.5" />
              {machineLabel}
            </span>
            {h.startComment && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 text-blue-100 text-[10px] italic border border-white/15">
                📝 {h.startComment}
              </span>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ─── WO Summary Banner ──────────────────────────────────────────────────── */

function WoSummaryRow({ row }: { row: ReportRow }) {
  const s = row.woSummaryData!;
  const machineLabel = getMachineLabel(s.deviceId);
  return (
    <tr>
      <td colSpan={11} className="p-0">
        <div
          className="px-5 py-3"
          style={{
            background:
              "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)",
          }}
        >
          <div className="flex items-stretch gap-5">
            {/* Start */}
            <div className="flex flex-col min-w-[130px] pr-4 border-r border-slate-600/50">
              <span className="flex items-center gap-1 text-emerald-400 text-[9px] font-bold uppercase tracking-widest mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Start
              </span>
              <span className="font-mono text-slate-100 text-[11px] leading-snug">
                {s.startTime}
              </span>
              {s.startComment && (
                <span className="text-[9px] italic text-slate-500 mt-0.5 max-w-[120px] truncate">
                  {fmt(s.startComment)}
                </span>
              )}
            </div>

            {/* Centre */}
            <div className="flex-1 flex flex-col items-center justify-center gap-1.5">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em]">
                WO #{s.woIdStr} — Summary
              </div>
              <div className="rounded-full border border-cyan-700/40 bg-cyan-900/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                {machineLabel}
              </div>
              <div className="flex items-end gap-4 flex-wrap justify-center">
                {(
                  [
                    ["Duration", s.totalDuration, "text-slate-200"],
                    ["Cutting", s.totalCuttingTime, "text-emerald-300"],
                    ["Pause", s.totalPauseTime, "text-amber-300"],
                  ] as const
                ).map(([lbl, val, cls]) => (
                  <div key={lbl} className="flex flex-col items-center gap-0.5">
                    <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">
                      {lbl}
                    </span>
                    <span className={cn("font-mono text-xs font-bold", cls)}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/60 border border-slate-700/50 text-[10px] flex-wrap justify-center">
                <span className="text-slate-400">
                  Jobs: <b className="text-slate-200">{s.totalJobs}</b>
                </span>
                <span className="text-slate-700">·</span>
                <span className="text-slate-400">
                  Cyc: <b className="text-slate-200">{s.totalCycles}</b>
                </span>
                <span className="text-slate-700">·</span>
                <span className="text-slate-400">
                  Allot: <b className="text-slate-200">{s.allotedQty}</b>
                </span>
                <span className="text-slate-700">·</span>
                <span
                  className={
                    s.okQty > 0
                      ? "text-emerald-400 font-bold"
                      : "text-slate-500"
                  }
                >
                  OK: {s.okQty}
                </span>
                <span className="text-slate-700">·</span>
                <span
                  className={
                    s.rejectQty > 0
                      ? "text-rose-400 font-bold"
                      : "text-slate-500"
                  }
                >
                  Rej: {s.rejectQty}
                </span>
                {(s.keyEventsTotal ?? 0) > 0 && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span className="text-cyan-300 font-bold">
                      Key: {s.keyEventsTotal}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* End */}
            <div className="flex flex-col items-end min-w-[130px] pl-4 border-l border-slate-600/50">
              <span className="flex items-center gap-1 text-rose-400 text-[9px] font-bold uppercase tracking-widest mb-1">
                End
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              </span>
              <span className="font-mono text-slate-100 text-[11px] leading-snug text-right">
                {s.endTime}
              </span>
              {s.stopComment && (
                <span className="text-[9px] italic text-slate-500 mt-0.5 max-w-[120px] truncate text-right">
                  {fmt(s.stopComment)}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ─── Table Head ─────────────────────────────────────────────────────────── */

function TableHead() {
  const cols = [
    { label: "#", w: "w-10", align: "text-center" },
    { label: "Log ID", w: "w-16", align: "text-left" },
    { label: "Log Time", w: "w-44", align: "text-left" },
    { label: "Machine", w: "w-28", align: "text-left" },
    { label: "Action", w: "w-36", align: "text-left" },
    { label: "Duration", w: "w-32", align: "text-left" },
    { label: "Label", w: "w-36", align: "text-center" },
    { label: "Summary / Notes", w: "", align: "text-left" },
    { label: "WO Specs", w: "w-28", align: "text-left" },
    { label: "Job Type", w: "w-28", align: "text-left" },
    { label: "Operator", w: "w-32", align: "text-left" },
  ];
  return (
    <thead className="sticky top-0 z-10">
      <tr
        className="select-none"
        style={{
          background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
        }}
      >
        {cols.map(({ label, w, align }) => (
          <th
            key={label}
            className={cn(
              "px-3 py-3 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap border-b border-slate-700/80",
              w,
              align,
            )}
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function getRowVisualState(
  row: ReportRow,
  idx: number,
  visibleRows: ReportRow[],
) {
  const isFirstInBlock =
    !!row.jobBlockLabel &&
    (idx === 0 || visibleRows[idx - 1]?.jobBlockLabel !== row.jobBlockLabel);
  const isLastInBlock =
    !!row.jobBlockLabel &&
    (idx === visibleRows.length - 1 ||
      visibleRows[idx + 1]?.jobBlockLabel !== row.jobBlockLabel);
  const isInBlock = !!row.jobBlockLabel;
  const action = getRowDisplayAction(row);

  const accentBorder =
    action === "WO_START"
      ? "border-l-[3px] border-l-indigo-400"
      : action === "WO_STOP"
        ? "border-l-[3px] border-l-rose-400"
        : action === "WO_PAUSE"
          ? "border-l-[3px] border-l-amber-400"
          : action === "WO_RESUME"
            ? "border-l-[3px] border-l-blue-400"
            : action === "SPINDLE_ON"
              ? "border-l-[3px] border-l-teal-400"
              : action === "SPINDLE_OFF"
                ? "border-l-[3px] border-l-slate-400"
                : action === "M30_CHANGED"
                  ? "border-l-[3px] border-l-emerald-500"
                  : action === "MTR_ON"
                    ? "border-l-[3px] border-l-orange-400"
                    : action === "MTR_OFF"
                      ? "border-l-[3px] border-l-orange-600"
                      : action === "KEY_ON" || action === "KEY_OFF"
                        ? "border-l-[3px] border-l-cyan-400"
                        : row.isComputed
                          ? "border-l-[3px] border-l-slate-200"
                          : "";

  const rowBg = isInBlock
    ? undefined
    : action === "WO_START"
      ? "bg-indigo-50/60"
      : action === "WO_STOP"
        ? "bg-rose-50/40"
        : action === "WO_PAUSE" || action === "WO_RESUME"
          ? "bg-amber-50/50"
          : action === "M30_CHANGED"
            ? "bg-emerald-50/40"
            : action === "MTR_ON" || action === "MTR_OFF"
              ? "bg-orange-50/40"
              : action === "KEY_ON" || action === "KEY_OFF"
                ? "bg-cyan-50/40"
                : row.isComputed
                  ? "bg-slate-50/80"
                  : idx % 2 === 0
                    ? "bg-white"
                    : "bg-slate-50/40";

  return {
    isFirstInBlock,
    isLastInBlock,
    isInBlock,
    accentBorder,
    rowBg,
  };
}

function CompareLaneHeader({
  machineLabel,
  woIdLabel,
  jobType,
  startTime,
  endTime,
}: {
  machineLabel: string;
  woIdLabel: string;
  jobType: string;
  startTime: string;
  endTime: string;
}) {
  return (
    <div className="border-l border-slate-700/80 bg-[linear-gradient(180deg,#1e293b_0%,#0f172a_100%)] px-4 py-3 text-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
          {machineLabel}
        </span>
        <span className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-100">
          WO #{woIdLabel}
        </span>
        <JobTypeBadge jobType={jobType} />
      </div>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
        {fmt(startTime)} → {fmt(endTime)}
      </p>
      <div
        className="mt-3 grid gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400"
        style={{ gridTemplateColumns: COMPARE_LANE_GRID_TEMPLATE }}
      >
        <span>#</span>
        <span>Log ID</span>
        <span>Machine</span>
        <span>Action</span>
        <span>Duration</span>
        <span>Label</span>
        <span>Summary / Notes</span>
        <span>WO Specs</span>
        <span>Job Type</span>
        <span>Operator</span>
      </div>
    </div>
  );
}

function CompareLaneRows({
  rows,
  laneRows,
  woDetailsByWoIdStr,
}: {
  rows: ReportRow[];
  laneRows: ReportRow[];
  woDetailsByWoIdStr: Map<string, WoDetails>;
}) {
  const laneVisibleRows = laneRows.filter(
    (row) => !row.isPauseBanner && !row.isWoHeader && !row.isWoSummary,
  );
  const rowIndexMap = new Map(
    laneVisibleRows.map((row, index) => [row.rowId, index] as const),
  );

  if (rows.length === 0) {
    return <span className="text-slate-300 text-xs">—</span>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const rowIndex = rowIndexMap.get(row.rowId) ?? 0;
        const {
          isFirstInBlock,
          isLastInBlock,
          isInBlock,
          accentBorder,
          rowBg,
        } = getRowVisualState(row, rowIndex, laneVisibleRows);

        return (
          <div
            key={row.rowId}
            className={cn(
              "rounded-2xl border border-slate-200/80 px-3 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.06)]",
              rowBg,
              accentBorder,
              isFirstInBlock && "border-t-2 border-t-emerald-400",
              isLastInBlock && "border-b-2 border-b-emerald-400",
              isInBlock &&
                "border-l-[3px] border-l-emerald-300 row-in-block-bg",
              row.isComputed && "opacity-90",
            )}
          >
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: COMPARE_LANE_GRID_TEMPLATE }}
            >
              <div className="flex items-start justify-center pt-0.5">
                {row.sNo != null ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 tabular-nums">
                    {row.sNo}
                  </span>
                ) : (
                  <span className="text-slate-200 text-xs select-none">·</span>
                )}
              </div>

              <div className="pt-1">
                <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                  {row.logId ?? <span className="text-slate-300">—</span>}
                </span>
              </div>

              <div className="pt-0.5">
                <MachineCell
                  label={resolveRowMachineLabel(row, woDetailsByWoIdStr)}
                />
              </div>

              <div className="pt-0.5">
                <ActionBadge action={getRowDisplayAction(row)} />
              </div>

              <div className="pt-0.5">
                {row.startRowData ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      Part No
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-700">
                      {fmt(row.startRowData.partNo)}
                    </span>
                  </div>
                ) : row.stopRowData ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">
                      OK Qty
                    </span>
                    <span className="font-mono text-[11px] font-bold text-emerald-700">
                      {fmt(row.stopRowData.ok)}
                    </span>
                  </div>
                ) : row.durationText ? (
                  <DurationChip
                    durationText={row.durationText ?? undefined}
                    varianceColor={row.varianceColor ?? undefined}
                  />
                ) : (
                  <span className="text-slate-200 text-xs select-none">—</span>
                )}
              </div>

              <div className="flex items-start justify-center pt-0.5">
                {row.startRowData ? (
                  <div className="flex flex-col gap-0.5 items-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      Allotted
                    </span>
                    <span className="text-[11px] font-bold text-blue-700">
                      {row.startRowData.allotted}
                    </span>
                  </div>
                ) : row.stopRowData ? (
                  <div className="flex flex-col gap-0.5 items-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-rose-500">
                      Rej Qty
                    </span>
                    <span className="text-[11px] font-bold text-rose-700">
                      {fmt(row.stopRowData.reject)}
                    </span>
                  </div>
                ) : (
                  <LabelBadge
                    label={row.label ?? undefined}
                    jobBlockLabel={row.jobBlockLabel ?? undefined}
                    isFirstInBlock={isFirstInBlock ?? undefined}
                  />
                )}
              </div>

              <div className="pt-0.5">
                <SummaryCell row={row} />
              </div>

              <div className="pt-0.5">
                <WoSpecsCell woSpecs={row.woSpecs ?? undefined} />
              </div>

              <div className="pt-0.5">
                <JobTypeBadge jobType={String(row.jobType ?? "")} />
              </div>

              <div className="pt-0.5">
                <OperatorCell name={row.operatorName ?? undefined} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ReportCompareMatrixProps {
  windows: PersonnelOverlapCompareWindow[];
  woDetailsMap?: Map<number, WoDetails>;
}

export function ReportCompareMatrix({
  windows,
  woDetailsMap,
}: ReportCompareMatrixProps) {
  const woDetailsByWoIdStr = React.useMemo(
    () => buildWoDetailsByWoIdStr(woDetailsMap),
    [woDetailsMap],
  );

  if (windows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-5">
      {windows.map((window) => {
        const gridTemplateColumns = `132px repeat(${window.lanes.length}, minmax(900px, 1fr))`;

        return (
          <div
            key={window.id}
            className="rounded-2xl overflow-hidden border border-slate-200/80"
            style={{
              boxShadow:
                "0 16px 48px -8px rgba(15,23,42,0.14), 0 4px 16px -4px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.04)",
            }}
          >
            <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400" />
            <div className="overflow-x-auto thin-scrollbar">
              <div className="min-w-max">
                <div className="grid" style={{ gridTemplateColumns }}>
                  <div className="bg-[linear-gradient(180deg,#1e293b_0%,#0f172a_100%)] px-3 py-3 text-center text-slate-300 border-r border-slate-700/80">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em]">
                      Time
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-slate-100">
                      {fmtTime(new Date(window.startTime))}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-100">
                      {fmtTime(new Date(window.endTime))}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">
                      {formatDuration(window.durationSec)} overlap
                    </p>
                  </div>
                  {window.lanes.map((lane) => (
                    <CompareLaneHeader
                      key={lane.key}
                      machineLabel={getMachineLabel(lane.deviceId)}
                      woIdLabel={lane.woIdLabel}
                      jobType={lane.jobType}
                      startTime={lane.startTime}
                      endTime={lane.endTime}
                    />
                  ))}
                </div>

                {window.slots.map((slot) => (
                  <div
                    key={`${window.id}-${slot.timestamp}`}
                    className="grid border-t border-slate-200/80"
                    style={{ gridTemplateColumns }}
                  >
                    <div className="border-r border-slate-200/80 bg-slate-50 px-3 py-4 text-center">
                      <p className="font-mono text-[12px] font-semibold text-slate-700">
                        {fmtTime(new Date(slot.timestamp))}
                      </p>
                    </div>
                    {window.lanes.map((lane) => (
                      <div
                        key={`${window.id}-${slot.timestamp}-${lane.key}`}
                        className="border-l border-slate-200/80 bg-white px-3 py-3"
                      >
                        <CompareLaneRows
                          rows={slot.laneRows[lane.key] ?? []}
                          laneRows={window.slots.flatMap(
                            (windowSlot) => windowSlot.laneRows[lane.key] ?? [],
                          )}
                          woDetailsByWoIdStr={woDetailsByWoIdStr}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

interface ReportTableProps {
  rows: ReportRow[];
  loading?: boolean;
  isFiltered?: boolean;
  woDetailsMap?: Map<number, WoDetails>;
}

export function ReportTable({
  rows,
  loading,
  isFiltered,
  woDetailsMap,
}: ReportTableProps) {
  const [openWoStartRowId, setOpenWoStartRowId] = React.useState<string | null>(
    null,
  );
  const woDetailsByWoIdStr = React.useMemo(
    () => buildWoDetailsByWoIdStr(woDetailsMap),
    [woDetailsMap],
  );
  const visibleRows = rows.filter((row) => !row.isPauseBanner);
  const workOrderSpansByStartRowId = React.useMemo(
    () => buildWorkOrderSpans(visibleRows, woDetailsByWoIdStr),
    [visibleRows, woDetailsByWoIdStr],
  );

  if (visibleRows.length === 0) {
    if (isFiltered)
      return (
        <div className="w-full h-24 flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 text-sm text-slate-400">
          No matching records found.
        </div>
      );
    return null;
  }

  return (
    <div
      className="rounded-2xl overflow-hidden border border-slate-200/80 animate-fade-in-up dark:border-slate-700"
      style={{
        boxShadow:
          "0 16px 48px -8px rgba(15,23,42,0.14), 0 4px 16px -4px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.04)",
      }}
    >
      {/* Top accent bar */}
      <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400" />
      <div className="overflow-x-auto thin-scrollbar">
        <table className="w-full min-w-[1160px] text-sm text-left border-collapse">
          <TableHead />
          <tbody>
            {visibleRows.map((row, idx) => {
              /* ── WO Header ── */
              if (row.isWoHeader && row.woHeaderData)
                return <WoHeaderRow key={row.rowId} row={row} />;

              /* ── WO Summary ── */
              if (row.isWoSummary && row.woSummaryData)
                return <WoSummaryRow key={row.rowId} row={row} />;

              /* ── Regular Data Row ── */
              const displayAction = getRowDisplayAction(row);
              const {
                isFirstInBlock,
                isLastInBlock,
                isInBlock,
                accentBorder,
                rowBg,
              } = getRowVisualState(row, idx, visibleRows);
              const workOrderSpan =
                displayAction === "WO_START"
                  ? workOrderSpansByStartRowId.get(row.rowId)
                  : undefined;
              const isWorkOrderExpandable = !!workOrderSpan;
              const isWorkOrderOpen = openWoStartRowId === row.rowId;
              const toggleWorkOrderRow = () => {
                if (!isWorkOrderExpandable) {
                  return;
                }

                setOpenWoStartRowId((current) =>
                  current === row.rowId ? null : row.rowId,
                );
              };

              return (
                <React.Fragment key={row.rowId}>
                  <tr
                    className={cn(
                      "border-b border-slate-100 last:border-0 transition-all duration-100",
                      !isInBlock && rowBg,
                      !isInBlock && accentBorder,
                      !isInBlock &&
                        "hover:bg-indigo-50/30 hover:border-l-indigo-400 hover:border-l-[3px]",
                      isFirstInBlock && "border-t-2 border-t-emerald-400",
                      isLastInBlock && "border-b-2 border-b-emerald-400",
                      isInBlock && "border-l-[3px] border-l-emerald-300",
                      row.isComputed && "opacity-90",
                      isInBlock && "row-in-block-bg",
                      isWorkOrderExpandable && "cursor-pointer",
                    )}
                    onClick={
                      isWorkOrderExpandable ? toggleWorkOrderRow : undefined
                    }
                  >
                    {/* S.No */}
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {isWorkOrderExpandable ? (
                          <button
                            type="button"
                            aria-expanded={isWorkOrderOpen}
                            aria-label={`${
                              isWorkOrderOpen ? "Collapse" : "Expand"
                            } work order details`}
                            className="inline-flex size-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleWorkOrderRow();
                            }}
                          >
                            {isWorkOrderOpen ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </button>
                        ) : null}
                        {row.sNo != null ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 tabular-nums">
                            {row.sNo}
                          </span>
                        ) : (
                          <span className="text-slate-200 text-xs select-none">
                            ·
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Log ID */}
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                        {row.logId ?? <span className="text-slate-300">—</span>}
                      </span>
                    </td>

                    {/* Log Time */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] text-slate-700 font-medium tabular-nums">
                        {fmtTime(row.logTime)}
                      </span>
                    </td>

                    {/* Machine */}
                    <td className="px-3 py-2.5 align-top">
                      <MachineCell
                        label={resolveRowMachineLabel(row, woDetailsByWoIdStr)}
                      />
                    </td>

                    {/* Action */}
                    <td className="px-3 py-2.5">
                      <ActionBadge action={displayAction} />
                    </td>

                    {/* Duration */}
                    <td className="px-3 py-2.5 align-top">
                      {row.startRowData ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            Part No
                          </span>
                          <span className="font-mono text-[11px] font-bold text-slate-700">
                            {fmt(row.startRowData.partNo)}
                          </span>
                        </div>
                      ) : row.stopRowData ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">
                            OK Qty
                          </span>
                          <span className="font-mono text-[11px] font-bold text-emerald-700">
                            {fmt(row.stopRowData.ok)}
                          </span>
                        </div>
                      ) : row.durationText ? (
                        <DurationChip
                          durationText={row.durationText ?? undefined}
                          varianceColor={row.varianceColor ?? undefined}
                        />
                      ) : (
                        <span className="text-slate-200 text-xs select-none">
                          —
                        </span>
                      )}
                    </td>

                    {/* Label */}
                    <td className="px-3 py-2.5 text-center align-top">
                      {row.startRowData ? (
                        <div className="flex flex-col gap-0.5 items-center">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            Allotted
                          </span>
                          <span className="text-[11px] font-bold text-blue-700">
                            {row.startRowData.allotted}
                          </span>
                        </div>
                      ) : row.stopRowData ? (
                        <div className="flex flex-col gap-0.5 items-center">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-rose-500">
                            Rej Qty
                          </span>
                          <span className="text-[11px] font-bold text-rose-700">
                            {fmt(row.stopRowData.reject)}
                          </span>
                        </div>
                      ) : (
                        <LabelBadge
                          label={row.label ?? undefined}
                          jobBlockLabel={row.jobBlockLabel ?? undefined}
                          isFirstInBlock={isFirstInBlock ?? undefined}
                        />
                      )}
                    </td>

                    {/* Summary / Notes */}
                    <td className="px-3 py-2.5 align-top">
                      <SummaryCell row={row} />
                    </td>

                    {/* WO Specs */}
                    <td className="px-3 py-2.5 align-top">
                      <WoSpecsCell woSpecs={row.woSpecs ?? undefined} />
                    </td>

                    {/* Job Type */}
                    <td className="px-3 py-2.5 align-top">
                      <JobTypeBadge jobType={String(row.jobType ?? "")} />
                    </td>

                    {/* Operator */}
                    <td className="px-3 py-2.5 align-top">
                      <OperatorCell name={row.operatorName ?? undefined} />
                    </td>
                  </tr>

                  {isWorkOrderExpandable && isWorkOrderOpen && workOrderSpan ? (
                    <tr className="bg-slate-50/60">
                      <td colSpan={11} className="p-0">
                        <Collapsible
                          open={isWorkOrderOpen}
                          onOpenChange={(open) =>
                            setOpenWoStartRowId(open ? row.rowId : null)
                          }
                        >
                          <CollapsibleContent
                            forceMount
                            className="overflow-hidden"
                          >
                            <WorkOrderSummaryPanel span={workOrderSpan} />
                          </CollapsibleContent>
                        </Collapsible>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
