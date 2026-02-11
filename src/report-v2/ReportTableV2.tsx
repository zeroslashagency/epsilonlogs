import React from "react";
import { ReportRow } from "../report/report-types";
import { formatDuration } from "../report/format-utils";
import { RowClassification } from "../report/report-builder-v2";

type BadgeTone = {
    chip: string;
    text: string;
    ring: string;
};

const toneMap: Record<RowClassification, BadgeTone> = {
    GOOD: {
        chip: "bg-emerald-500/15",
        text: "text-emerald-300",
        ring: "ring-emerald-500/40",
    },
    WARNING: {
        chip: "bg-amber-500/15",
        text: "text-amber-300",
        ring: "ring-amber-500/40",
    },
    BAD: {
        chip: "bg-rose-500/15",
        text: "text-rose-300",
        ring: "ring-rose-500/40",
    },
    UNKNOWN: {
        chip: "bg-slate-500/15",
        text: "text-slate-300",
        ring: "ring-slate-500/40",
    },
};

const getClassification = (row: ReportRow): RowClassification => row.classification || "UNKNOWN";

const getDurationText = (row: ReportRow): string => {
    if (row.durationText) return row.durationText;
    if (typeof row.durationSec === "number") return formatDuration(row.durationSec);
    return "-";
};

const getWoLabel = (row: ReportRow): string => {
    if (row.woSpecs?.woId) return `WO ${row.woSpecs.woId}`;
    if (typeof row.originalLog?.wo_id === "number") return `WO ${row.originalLog.wo_id}`;
    return "-";
};

export function ReportTableV2({ rows, loading = false }: { rows: ReportRow[]; loading?: boolean }) {
    if (loading) {
        return (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-8 text-center text-slate-300">
                Loading V2 report timeline...
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-8 text-center text-slate-400">
                No rows match current filters.
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-700 bg-slate-950/90 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.9)]">
            <div className="md:hidden space-y-3 p-3">
                {rows.map((row) => {
                    const classification = getClassification(row);
                    const tone = toneMap[classification];

                    return (
                        <article key={row.rowId} className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-mono text-[11px] text-slate-300">
                                    {row.logTime.toLocaleString("en-GB")}
                                </p>
                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${tone.chip} ${tone.text} ${tone.ring}`}>
                                    {classification}
                                </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Action</p>
                                    <p className="text-slate-100">{row.action || "-"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Duration</p>
                                    <p className="font-mono text-slate-100">{getDurationText(row)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">WO/Job</p>
                                    <p className="text-slate-200">{`${getWoLabel(row)}${row.label ? ` • ${row.label}` : ""}`}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Operator</p>
                                    <p className="text-slate-200">{row.operatorName || "-"}</p>
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-slate-300">{row.reasonText || row.summary || "No classification reason"}</p>
                        </article>
                    );
                })}
            </div>

            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-[1080px] w-full border-collapse text-xs text-slate-200">
                    <thead className="sticky top-0 z-10 bg-slate-900/95">
                        <tr className="border-b border-slate-700 text-slate-400 uppercase tracking-wide">
                            <th className="px-3 py-3 text-left font-semibold">Time</th>
                            <th className="px-3 py-3 text-left font-semibold">Action</th>
                            <th className="px-3 py-3 text-left font-semibold">Duration</th>
                            <th className="px-3 py-3 text-left font-semibold">Classification</th>
                            <th className="px-3 py-3 text-left font-semibold">Reason</th>
                            <th className="px-3 py-3 text-left font-semibold">WO / Job</th>
                            <th className="px-3 py-3 text-left font-semibold">Operator</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const classification = getClassification(row);
                            const tone = toneMap[classification];

                            return (
                                <tr key={row.rowId} className="border-b border-slate-800/80 hover:bg-slate-900/70">
                                    <td className="px-3 py-2 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                                        {row.logTime.toLocaleString("en-GB")}
                                    </td>
                                    <td className="px-3 py-2 text-slate-100 whitespace-nowrap">{row.action || "-"}</td>
                                    <td className="px-3 py-2 font-mono text-slate-100 whitespace-nowrap">{getDurationText(row)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${tone.chip} ${tone.text} ${tone.ring}`}>
                                            {classification}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-300 max-w-[340px]">{row.reasonText || row.summary || "-"}</td>
                                    <td className="px-3 py-2 text-slate-200 whitespace-nowrap">
                                        {`${getWoLabel(row)}${row.label ? ` • ${row.label}` : ""}`}
                                    </td>
                                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{row.operatorName || "-"}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
