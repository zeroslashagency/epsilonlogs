import React from "react";
import { ReportRow } from "./report-types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
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
} from "lucide-react";

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

/* ─── Action Badge ───────────────────────────────────────────────────────── */

type ActionCfg = { icon: React.ReactNode; label: string; cls: string };

function getActionCfg(action?: string): ActionCfg {
  switch (action) {
    case "WO_START":
      return {
        icon: <Play className="h-3 w-3" />,
        label: "WO Start",
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-200/50",
      };
    case "WO_STOP":
      return {
        icon: <Square className="h-3 w-3" />,
        label: "WO Stop",
        cls: "bg-rose-50 text-rose-700 border-rose-200 ring-rose-200/50",
      };
    case "WO_PAUSE":
      return {
        icon: <PauseCircle className="h-3 w-3" />,
        label: "Paused",
        cls: "bg-amber-50 text-amber-700 border-amber-200 ring-amber-200/50",
      };
    case "WO_RESUME":
      return {
        icon: <Play className="h-3 w-3" />,
        label: "Resumed",
        cls: "bg-blue-50 text-blue-700 border-blue-200 ring-blue-200/50",
      };
    case "SPINDLE_ON":
      return {
        icon: <Zap className="h-3 w-3" />,
        label: "Spindle On",
        cls: "bg-teal-50 text-teal-700 border-teal-200 ring-teal-200/50",
      };
    case "SPINDLE_OFF":
      return {
        icon: <ZapOff className="h-3 w-3" />,
        label: "Spindle Off",
        cls: "bg-slate-100 text-slate-600 border-slate-200 ring-slate-200/50",
      };
    case "KEY_ON":
      return {
        icon: <Key className="h-3 w-3" />,
        label: "Key On",
        cls: "bg-cyan-50 text-cyan-700 border-cyan-200 ring-cyan-200/50",
      };
    case "KEY_OFF":
      return {
        icon: <Key className="h-3 w-3" />,
        label: "Key Off",
        cls: "bg-purple-50 text-purple-700 border-purple-200 ring-purple-200/50",
      };
    default:
      return {
        icon: <Cpu className="h-3 w-3" />,
        label: action || "—",
        cls: "bg-slate-100 text-slate-600 border-slate-200 ring-slate-200/50",
      };
  }
}

function ActionBadge({ action }: { action?: string | undefined }) {
  if (!action) return <span className="text-slate-300 text-xs">—</span>;
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
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
        <CheckCircle2 className="h-2.5 w-2.5 flex-shrink-0" />
        Done
      </span>
    );
  if (active.includes(action))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">
        <Loader2 className="h-2.5 w-2.5 flex-shrink-0 animate-spin" />
        In Process
      </span>
    );
  if (paused.includes(action))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
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
  if (isFirstInBlock && jobBlockLabel) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-bold bg-emerald-600 text-white whitespace-nowrap tracking-wide"
        style={{ boxShadow: "0 1px 5px rgba(5,150,105,0.4)" }}
      >
        <ChevronRight className="h-3 w-3" />
        {jobBlockLabel}
      </span>
    );
  }
  if (!label) return <span className="text-slate-300 text-xs">—</span>;
  const lo = label.toLowerCase();
  if (lo.includes("idle"))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
        <TimerOff className="h-2.5 w-2.5 flex-shrink-0" />
        {label}
      </span>
    );
  if (lo.includes("load"))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">
        <Package className="h-2.5 w-2.5 flex-shrink-0" />
        {label}
      </span>
    );
  if (lo.includes("ideal"))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap">
        <Clock className="h-2.5 w-2.5 flex-shrink-0" />
        {label}
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-[3px] rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
      {label}
    </span>
  );
}

/* ─── Duration Chip ──────────────────────────────────────────────────────── */

function DurationChip({
  durationText,
  varianceColor,
}: {
  durationText?: string | undefined;
  varianceColor?: "red" | "green" | "neutral" | undefined;
}) {
  if (!durationText) return <span className="text-slate-300 text-xs">—</span>;
  const cls =
    varianceColor === "red"
      ? "text-rose-700 bg-rose-50 border-rose-200"
      : varianceColor === "green"
        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
        : "text-slate-700 bg-slate-50 border-slate-200";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-[3px] rounded-md font-mono text-[11px] font-semibold border",
        cls,
      )}
    >
      <Clock className="h-2.5 w-2.5 opacity-50 flex-shrink-0" />
      {durationText}
    </span>
  );
}

/* ─── Job Type Badge ─────────────────────────────────────────────────────── */

const JT_COLORS: Record<string, string> = {
  Production: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Setting: "bg-orange-50 text-orange-700 border-orange-200",
  Calibration: "bg-violet-50 text-violet-700 border-violet-200",
  Maintenance: "bg-red-50 text-red-700 border-red-200",
  Man: "bg-slate-100 text-slate-600 border-slate-200",
  Training: "bg-sky-50 text-sky-700 border-sky-200",
  RD: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "Man Production": "bg-teal-50 text-teal-700 border-teal-200",
  "Man Setting": "bg-pink-50 text-pink-700 border-pink-200",
  "Manual Input": "bg-yellow-50 text-yellow-700 border-yellow-200",
};

function JobTypeBadge({ jobType }: { jobType?: string | undefined }) {
  if (!jobType || jobType === "Unknown")
    return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-[3px] rounded-full text-[10px] font-semibold border whitespace-nowrap",
        JT_COLORS[jobType] ?? "bg-slate-100 text-slate-600 border-slate-200",
      )}
    >
      {jobType}
    </span>
  );
}

/* ─── Operator Avatar ────────────────────────────────────────────────────── */

const AV_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
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
          "flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold",
          colorCls,
        )}
      >
        {initials}
      </span>
      <span
        className="text-xs font-medium text-slate-700 truncate max-w-[80px]"
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
      <span className="font-bold text-indigo-600 text-[11px] font-mono leading-tight">
        #{woSpecs.woId}
      </span>
      <span className="text-[10px] text-slate-500 leading-tight">
        PCL:{" "}
        <span className="font-semibold text-slate-700">{woSpecs.pclText}</span>
      </span>
      <span className="text-[10px] text-slate-500 leading-tight">
        Allot:{" "}
        <span className="font-semibold text-slate-700">{woSpecs.allotted}</span>
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
    <div className="flex flex-col gap-1 min-w-0">
      {row.durationText && (
        <DurationChip
          durationText={row.durationText ?? undefined}
          varianceColor={row.varianceColor ?? undefined}
        />
      )}
      {row.summary && (
        <span
          className={cn(
            "text-xs font-medium leading-snug",
            row.varianceColor === "red"
              ? "text-rose-600"
              : row.varianceColor === "green"
                ? "text-emerald-700"
                : "text-slate-600",
          )}
        >
          {row.summary}
        </span>
      )}
    </div>
  );
}

/* ─── WO Header Banner ───────────────────────────────────────────────────── */

function WoHeaderRow({ row }: { row: ReportRow }) {
  const h = row.woHeaderData!;
  return (
    <tr>
      <td colSpan={10} className="p-0">
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
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-200 text-[9px] font-semibold border border-blue-700/40">
              <Cpu className="h-2.5 w-2.5" />
              Device {h.deviceId}
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
  return (
    <tr>
      <td colSpan={10} className="p-0">
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

/* ─── Pause Banner ───────────────────────────────────────────────────────── */

function PauseBannerRow({ row }: { row: ReportRow }) {
  const p = row.pauseBannerData!;
  const isBreak = p.isShiftBreak;
  return (
    <tr>
      <td colSpan={10} className="p-0">
        <div
          className={cn(
            "flex items-center gap-3 px-5 py-2.5 border-y",
            isBreak
              ? "bg-rose-50 border-rose-200"
              : "bg-amber-50 border-amber-200",
          )}
        >
          <span
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-full text-sm flex-shrink-0",
              isBreak ? "bg-rose-100" : "bg-amber-100",
            )}
          >
            {isBreak ? "🔴" : "⚠️"}
          </span>
          <div>
            <div
              className={cn(
                "text-[10px] font-bold uppercase tracking-widest",
                isBreak ? "text-rose-700" : "text-amber-800",
              )}
            >
              {isBreak ? "Shift Break" : "WO Pause"}
            </div>
            <div className="flex items-center gap-2 text-[11px] mt-0.5">
              <span
                className={cn(
                  "font-medium",
                  isBreak ? "text-rose-600" : "text-amber-700",
                )}
              >
                {fmt(p.reason)}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-mono font-bold text-slate-700">
                ⏲ {p.durationText}
              </span>
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
    { label: "S.No", w: "w-12", align: "text-center" },
    { label: "Log ID", w: "w-16", align: "text-left" },
    { label: "Log Time", w: "w-44", align: "text-left" },
    { label: "Action", w: "w-36", align: "text-left" },
    { label: "Duration", w: "w-32", align: "text-left" },
    { label: "Label", w: "w-32", align: "text-center" },
    { label: "Summary / Notes", w: "", align: "text-left" },
    { label: "WO Specs", w: "w-28", align: "text-left" },
    { label: "Job Type", w: "w-28", align: "text-left" },
    { label: "Operator", w: "w-28", align: "text-left" },
  ];
  return (
    <thead>
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
              "px-3 py-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap",
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

/* ─── Main Component ─────────────────────────────────────────────────────── */

interface ReportTableProps {
  rows: ReportRow[];
  loading?: boolean;
  isFiltered?: boolean;
}

export function ReportTable({ rows, loading, isFiltered }: ReportTableProps) {
  if (rows.length === 0) {
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
      className="rounded-xl overflow-hidden border border-slate-200/80 animate-fade-in-up"
      style={{
        boxShadow:
          "0 8px 32px -4px rgba(0,0,0,0.09), 0 2px 8px -2px rgba(0,0,0,0.06)",
      }}
    >
      <div className="overflow-x-auto thin-scrollbar">
        <table className="w-full min-w-[1060px] text-sm text-left border-collapse">
          <TableHead />
          <tbody>
            {rows.map((row, idx) => {
              /* ── WO Header ── */
              if (row.isWoHeader && row.woHeaderData)
                return <WoHeaderRow key={row.rowId} row={row} />;

              /* ── WO Summary ── */
              if (row.isWoSummary && row.woSummaryData)
                return <WoSummaryRow key={row.rowId} row={row} />;

              /* ── Pause Banner ── */
              if (row.isPauseBanner && row.pauseBannerData)
                return <PauseBannerRow key={row.rowId} row={row} />;

              /* ── Regular Data Row ── */
              const isFirstInBlock =
                !!row.jobBlockLabel &&
                (idx === 0 ||
                  rows[idx - 1]?.jobBlockLabel !== row.jobBlockLabel);
              const isLastInBlock =
                !!row.jobBlockLabel &&
                (idx === rows.length - 1 ||
                  rows[idx + 1]?.jobBlockLabel !== row.jobBlockLabel);
              const isInBlock = !!row.jobBlockLabel;

              const rowBg = isInBlock
                ? undefined
                : row.action === "WO_START" || row.action === "WO_STOP"
                  ? "bg-indigo-50/30"
                  : row.action === "WO_PAUSE" || row.action === "WO_RESUME"
                    ? "bg-amber-50/40"
                    : row.action === "KEY_ON" || row.action === "KEY_OFF"
                      ? "bg-cyan-50/30"
                      : row.isComputed
                        ? "bg-slate-50/60"
                        : "bg-white";

              return (
                <tr
                  key={row.rowId}
                  className={cn(
                    "border-b border-slate-100 last:border-0 transition-colors duration-100",
                    !isInBlock && rowBg,
                    !isInBlock && "hover:bg-indigo-50/25",
                    isFirstInBlock && "border-t-2 border-t-emerald-400",
                    isLastInBlock && "border-b-2 border-b-emerald-400",
                    row.isComputed && "italic opacity-80",
                  )}
                  style={
                    isInBlock
                      ? { backgroundColor: "rgb(236,253,245)" }
                      : undefined
                  }
                >
                  {/* S.No */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-center",
                      isInBlock && "border-l-4 border-l-emerald-500",
                    )}
                  >
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {row.sNo ?? ""}
                    </span>
                  </td>

                  {/* Log ID */}
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {row.logId ?? "—"}
                    </span>
                  </td>

                  {/* Log Time */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-[11px] text-slate-600">
                      {fmtTime(row.logTime)}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="px-3 py-2.5">
                    <ActionBadge action={row.action ?? undefined} />
                  </td>

                  {/* Duration */}
                  <td className="px-3 py-2.5 align-top">
                    {row.startRowData ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                          Part No
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-800">
                          {fmt(row.startRowData.partNo)}
                        </span>
                      </div>
                    ) : row.stopRowData ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">
                          OK Qty
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-800">
                          {fmt(row.stopRowData.ok)}
                        </span>
                      </div>
                    ) : row.durationText ? (
                      <DurationChip
                        durationText={row.durationText ?? undefined}
                        varianceColor={row.varianceColor ?? undefined}
                      />
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
