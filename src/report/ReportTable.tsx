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
}: {
  durationText?: string | undefined;
  varianceColor?: "red" | "green" | "neutral" | undefined;
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
        "inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full font-mono text-[11px] font-semibold border",
        cls,
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
    { label: "#", w: "w-10", align: "text-center" },
    { label: "Log ID", w: "w-16", align: "text-left" },
    { label: "Log Time", w: "w-44", align: "text-left" },
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
      className="rounded-2xl overflow-hidden border border-slate-200/80 animate-fade-in-up dark:border-slate-700"
      style={{
        boxShadow:
          "0 16px 48px -8px rgba(15,23,42,0.14), 0 4px 16px -4px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.04)",
      }}
    >
      {/* Top accent bar */}
      <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400" />
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

              /* ── Per-action left accent colour ── */
              const accentBorder =
                row.action === "WO_START"
                  ? "border-l-[3px] border-l-indigo-400"
                  : row.action === "WO_STOP"
                    ? "border-l-[3px] border-l-rose-400"
                    : row.action === "WO_PAUSE"
                      ? "border-l-[3px] border-l-amber-400"
                      : row.action === "WO_RESUME"
                        ? "border-l-[3px] border-l-blue-400"
                        : row.action === "SPINDLE_ON"
                          ? "border-l-[3px] border-l-teal-400"
                          : row.action === "SPINDLE_OFF"
                            ? "border-l-[3px] border-l-slate-400"
                            : row.action === "KEY_ON" ||
                              row.action === "KEY_OFF"
                              ? "border-l-[3px] border-l-cyan-400"
                              : row.isComputed
                                ? "border-l-[3px] border-l-slate-200"
                                : "";

              /* ── Row background ── */
              const rowBg = isInBlock
                ? undefined
                : row.action === "WO_START"
                  ? "bg-indigo-50/60"
                  : row.action === "WO_STOP"
                    ? "bg-rose-50/40"
                    : row.action === "WO_PAUSE" || row.action === "WO_RESUME"
                      ? "bg-amber-50/50"
                      : row.action === "KEY_ON" || row.action === "KEY_OFF"
                        ? "bg-cyan-50/40"
                        : row.isComputed
                          ? "bg-slate-50/80"
                          : idx % 2 === 0
                            ? "bg-white"
                            : "bg-slate-50/40";

              return (
                <tr
                  key={row.rowId}
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
                  )}
                >
                  {/* S.No */}
                  <td className="px-3 py-2.5 text-center">
                    {row.sNo != null ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 tabular-nums">
                        {row.sNo}
                      </span>
                    ) : (
                      <span className="text-slate-200 text-xs select-none">
                        ·
                      </span>
                    )}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
