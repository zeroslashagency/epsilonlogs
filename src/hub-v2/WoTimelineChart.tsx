import React, { useMemo } from "react";
import { Gantt, type IScaleConfig } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import { Activity, PauseCircle, Milestone, TimerReset } from "lucide-react";
import { formatDuration } from "../report/format-utils";
import type { ReportRow, WoDetails } from "../report/report-types";
import { cn } from "../lib/utils";
import { buildWoTimelineModel } from "./wo-timeline-utils";

const timelineScales: IScaleConfig[] = [
  {
    unit: "day",
    step: 1,
    format: (value, next) => {
      const dayLabel = new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
      }).format(value);
      const yearLabel =
        next && value.getFullYear() === next.getFullYear()
          ? ""
          : ` ${value.getFullYear()}`;
      return `${dayLabel}${yearLabel}`;
    },
  },
  {
    unit: "hour",
    step: 1,
    format: (value) =>
      new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(value),
  },
];

const ganttColumns = [
  {
    id: "text",
    header: "Timeline",
    width: 240,
    flexgrow: 1,
    getter: (task: { text?: string }) => task.text ?? "",
  },
];

function formatWindowLabel(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(start)} to ${formatter.format(end)}`;
}

function StatChip({
  className,
  icon: Icon,
  label,
  value,
}: {
  className?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <span className="tabular-nums text-slate-700">{value}</span>
    </div>
  );
}

interface WoTimelineChartProps {
  woDisplayId: string;
  woDetails: WoDetails | null;
  rows: ReportRow[];
}

export function WoTimelineChart({
  woDisplayId,
  woDetails,
  rows,
}: WoTimelineChartProps) {
  const model = useMemo(
    () => buildWoTimelineModel(woDisplayId, woDetails, rows),
    [rows, woDetails, woDisplayId],
  );

  if (!model) {
    return (
      <section
        aria-labelledby="wo-timeline-heading"
        className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4"
      >
        <h3
          id="wo-timeline-heading"
          className="text-sm font-semibold text-slate-800"
        >
          WO Timeline
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Timeline data is not available for this work order yet.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="wo-timeline-heading"
      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="wo-timeline-heading"
            className="text-sm font-semibold text-slate-800"
          >
            WO Timeline
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Track runtime, pause windows, and extension events for WO-{woDisplayId}.
          </p>
        </div>
        <p className="text-right text-xs text-slate-500">
          <span className="block font-medium text-slate-700">Timeline Window</span>
          <span className="tabular-nums">{formatWindowLabel(model.windowStart, model.windowEnd)}</span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatChip
          className="border-emerald-200 bg-emerald-50 text-emerald-700"
          icon={Activity}
          label="Run Segments"
          value={model.activeSpanCount.toLocaleString()}
        />
        <StatChip
          className="border-amber-200 bg-amber-50 text-amber-700"
          icon={PauseCircle}
          label="Pause Windows"
          value={model.pauseCount.toLocaleString()}
        />
        <StatChip
          className="border-sky-200 bg-sky-50 text-sky-700"
          icon={Milestone}
          label="Extensions"
          value={model.extensionCount.toLocaleString()}
        />
        <StatChip
          className="border-slate-200 bg-white text-slate-600"
          icon={TimerReset}
          label="Idle Time"
          value={formatDuration(woDetails?.idle_time ?? 0)}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="h-[360px] min-w-0">
          <Gantt
            tasks={model.tasks}
            markers={model.markers}
            columns={ganttColumns}
            scales={timelineScales}
            readonly
            start={model.windowStart}
            end={model.windowEnd}
            zoom={false}
            cellHeight={40}
            scaleHeight={56}
            cellWidth={44}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="font-semibold uppercase tracking-[0.12em] text-slate-500">
            Status
          </p>
          <p className="mt-1 break-words text-sm text-slate-700">
            {woDetails?.status?.trim() || "Unknown"}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="font-semibold uppercase tracking-[0.12em] text-slate-500">
            Load Time
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {formatDuration(woDetails?.load_time ?? 0)}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="font-semibold uppercase tracking-[0.12em] text-slate-500">
            Battery
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {woDetails?.battery_level != null
              ? `${woDetails.battery_level.toLocaleString()}%`
              : "Not Reported"}
          </p>
        </div>
      </div>
    </section>
  );
}
