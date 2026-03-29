import React from "react";
import { Activity, Gauge, PauseCircle, TimerReset } from "lucide-react";
import { formatDuration } from "../report/format-utils";
import { getMachineLabel } from "../report/machine-config";
import type { ReportRow, WoDetails } from "../report/report-types";
import { WoTimelineChart } from "./WoTimelineChart";

interface WoChartWorkspaceProps {
  woDisplayId: string;
  machineId: number | null;
  operatorName: string;
  jobType: string;
  executionStatus: string;
  executionStatusClassName: string;
  jobTypeClassName: string;
  rows: ReportRow[];
  woDetails: WoDetails | null;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon aria-hidden="true" className="h-4 w-4" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </p>
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export function WoChartWorkspace({
  woDisplayId,
  machineId,
  operatorName,
  jobType,
  executionStatus,
  executionStatusClassName,
  jobTypeClassName,
  rows,
  woDetails,
}: WoChartWorkspaceProps) {
  return (
    <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Separate Chart Section
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            WO-{woDisplayId} Timeline Workspace
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {`${machineId != null ? getMachineLabel(machineId) : "Machine -"} · ${operatorName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 font-semibold ring-1 ${jobTypeClassName}`}
          >
            {jobType}
          </span>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 font-semibold ring-1 ${executionStatusClassName}`}
          >
            {executionStatus}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Output"
          value={`${woDetails?.ok_qty ?? 0}/${woDetails?.alloted_qty ?? 0}`}
          icon={Activity}
        />
        <StatCard
          label="Load Time"
          value={formatDuration(woDetails?.load_time ?? 0)}
          icon={Gauge}
        />
        <StatCard
          label="Idle Time"
          value={formatDuration(woDetails?.idle_time ?? 0)}
          icon={PauseCircle}
        />
        <StatCard
          label="Saved Time"
          value={formatDuration(woDetails?.time_saved ?? 0)}
          icon={TimerReset}
        />
      </div>

      <div className="mt-5">
        <WoTimelineChart
          woDisplayId={woDisplayId}
          woDetails={woDetails}
          rows={rows}
        />
      </div>
    </section>
  );
}
