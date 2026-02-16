import React from 'react';
import { ReportRow } from "./report-types";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

function formatHumanEntry(value: string | number | null | undefined, fallback = '—') {
    const normalized = value === null || value === undefined ? '' : String(value).trim();
    const display = normalized || fallback;
    return `" ${display} "`;
}

interface ReportTableProps {
    rows: ReportRow[];
    loading?: boolean;
    isFiltered?: boolean;
}

export function ReportTable({ rows, loading, isFiltered }: ReportTableProps) {
    if (loading) {
        return (
            <div className="w-full h-64 flex items-center justify-center text-slate-400">
                <span className="animate-pulse text-lg">⏳ Generating Report...</span>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="w-full h-64 flex items-center justify-center text-slate-400 border rounded-lg bg-slate-50">
                {isFiltered
                    ? "No matching records found."
                    : "No data generated. Select a valid range and device."}
            </div>
        );
    }

    return (
        <div className="border rounded-xl overflow-hidden shadow-lg bg-white">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-800 text-white">
                            <th className="px-3 py-3 font-semibold w-14 text-center">S.No</th>
                            <th className="px-3 py-3 font-semibold w-20">Log ID</th>
                            <th className="px-3 py-3 font-semibold w-44">Log Time</th>
                            <th className="px-3 py-3 font-semibold w-28">Action</th>
                            <th className="px-3 py-3 font-semibold w-32">Duration</th>
                            <th className="px-3 py-3 font-semibold text-center">Label</th>
                            <th className="px-3 py-3 font-semibold">Summary / Notes</th>
                            <th className="px-3 py-3 font-semibold w-32">WO Specs</th>
                            <th className="px-3 py-3 font-semibold w-24">Job Type</th>
                            <th className="px-3 py-3 font-semibold w-32">Operator</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => {
                            // --- WO Header Banner ---
                            if (row.isWoHeader && row.woHeaderData) {
                                const h = row.woHeaderData;
                                return (
                                    <tr key={row.rowId} className="bg-blue-600 text-white">
                                        <td colSpan={10} className="px-4 py-3">
                                            <div className="flex items-center gap-4 flex-wrap font-semibold text-sm">
                                                <span className="text-lg">🔧</span>
                                                <span className="bg-blue-500 px-2 py-0.5 rounded text-xs">WO #{h.woIdStr}</span>
                                                <span>Part: <strong>{h.partNo}</strong></span>
                                                <span>Operator: <strong>{h.operatorName}</strong></span>
                                                <span>PCL: <strong>{h.pclText}</strong></span>
                                                <span>Setting: <strong>{h.setting}</strong></span>
                                                <span className="text-blue-200 text-xs">Device {h.deviceId}</span>
                                                {h.startComment && <span className="bg-blue-700 px-2 py-0.5 rounded text-xs italic">📝 {h.startComment}</span>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }

                            // --- WO Summary Banner ---
                            if (row.isWoSummary && row.woSummaryData) {
                                const s = row.woSummaryData;
                                return (
                                    <tr key={row.rowId} className="bg-slate-800 text-white">
                                        <td colSpan={10} className="px-3 py-2 bg-slate-800/95 border-y border-slate-700">
                                            <div className="flex items-center justify-between gap-4">
                                                {/* Left: Start Info */}
                                                <div className="flex flex-col items-start min-w-[140px]">
                                                    <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                        Start
                                                    </div>
                                                    <div className="font-mono text-slate-100 text-xs">{s.startTime}</div>
                                                    {s.startComment && (
                                                        <div className="text-[10px] italic text-slate-400 mt-0.5 max-w-[150px] truncate" title={s.startComment}>
                                                            {formatHumanEntry(s.startComment)}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Center: Metrics & Main Info */}
                                                <div className="col-span-6 flex flex-col items-center justify-center text-center">
                                                    <div className="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-widest">
                                                        WO #{s.woIdStr} Summary
                                                    </div>

                                                    {/* Line 1: Times */}
                                                    <div className="flex items-center gap-3 text-sm text-slate-400">
                                                        <span>Dur: <b className="text-slate-200 font-mono">{s.totalDuration}</b></span>
                                                        <span className="text-slate-600">|</span>
                                                        <span>Cut: <b className="text-emerald-300 font-mono">{s.totalCuttingTime}</b></span>
                                                        <span className="text-slate-600">|</span>
                                                        <span>Pause: <b className="text-amber-300 font-mono">{s.totalPauseTime}</b></span>

                                                    </div>

                                                    {/* Line 2: Counts */}
                                                    <div className="flex items-center gap-3 text-sm text-slate-400 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700/50 mt-1">
                                                        <span>Jobs: <b className="text-slate-200">{s.totalJobs}</b></span>
                                                        <span className="text-slate-600">/</span>
                                                        <span>Cyc: <b className="text-slate-200">{s.totalCycles}</b></span>
                                                        {(s.keyEventsTotal || 0) > 0 && (
                                                            <>
                                                                <span className="text-slate-600 mx-1">|</span>
                                                                <span>Key: <b className="text-cyan-300">{s.keyEventsTotal}</b></span>
                                                                <span className="text-slate-600">({s.keyOnCount || 0}/{s.keyOffCount || 0})</span>
                                                            </>
                                                        )}
                                                        <span className="text-slate-600 mx-1">|</span>
                                                        <span>Allot: <b className="text-slate-200">{s.allotedQty}</b></span>
                                                        <span className="text-slate-600">→</span>
                                                        <span className={s.okQty > 0 ? "text-emerald-400 font-bold" : "text-slate-500"}>OK: {s.okQty}</span>
                                                        <span className="text-slate-600">/</span>
                                                        <span className={s.rejectQty > 0 ? "text-rose-400 font-bold" : "text-slate-500"}>Rej: {s.rejectQty}</span>
                                                    </div>
                                                </div>

                                                {/* Right: End Info */}
                                                <div className="flex flex-col items-end min-w-[140px] text-right">
                                                    <div className="flex items-center gap-1.5 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                                                        End
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                    </div>
                                                    <div className="font-mono text-slate-100 text-xs">{s.endTime}</div>
                                                    {s.stopComment && (
                                                        <div className="text-[10px] italic text-slate-400 mt-0.5 max-w-[150px] truncate" title={s.stopComment}>
                                                            {formatHumanEntry(s.stopComment)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }

                            // --- Pause Banner ---
                            if (row.isPauseBanner && row.pauseBannerData) {
                                const p = row.pauseBannerData;
                                return (
                                    <tr key={row.rowId} className={cn(
                                        p.isShiftBreak ? "bg-rose-100" : "bg-amber-100"
                                    )}>
                                        <td colSpan={10} className="px-4 py-2">
                                            <div className={cn(
                                                "flex items-center gap-3 font-semibold text-sm",
                                                p.isShiftBreak ? "text-rose-700" : "text-amber-800"
                                            )}>
                                                <span>{p.isShiftBreak ? '🔴' : '⚠️'}</span>
                                                <div className="flex flex-col">
                                                    <span>{p.isShiftBreak ? 'SHIFT BREAK' : 'WO_PAUSE'}</span>
                                                    <div className="flex flex-col mt-0.5 ml-0.5">
                                                        <div className="flex gap-1 text-xs font-normal text-slate-700">
                                                            <span className="opacity-70 uppercase tracking-wider text-[10px] font-bold">Reason:</span>
                                                            <span className="font-medium underline decoration-slate-400/50 underline-offset-2">{p.reason}</span>
                                                        </div>
                                                        <div className="mt-1 pt-0.5 border-t border-slate-300/50 w-fit">
                                                            <span className="font-mono font-bold text-slate-900 text-xs">⏲ {p.durationText}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }

                            // --- Regular Data Row ---
                            const isFirstInBlock = row.jobBlockLabel && (
                                idx === 0 || rows[idx - 1]?.jobBlockLabel !== row.jobBlockLabel
                            );
                            const isLastInBlock = row.jobBlockLabel && (
                                idx === rows.length - 1 || rows[idx + 1]?.jobBlockLabel !== row.jobBlockLabel
                            );
                            const isInBlock = !!row.jobBlockLabel;

                            return (
                                <tr
                                    key={row.rowId}
                                    className={cn(
                                        "border-b last:border-0 transition-colors",
                                        !isInBlock && "bg-white hover:bg-slate-50/50", // Only apply white/hover if NOT in block
                                        isFirstInBlock && "border-t-2 border-t-emerald-400",
                                        isLastInBlock && "border-b-2 border-b-emerald-400",
                                        row.isComputed && "text-slate-500 italic", // Removed bg-slate-50 to avoid conflict
                                        row.action === "WO_START" && "bg-blue-50 font-semibold",
                                        row.action === "WO_STOP" && "bg-blue-50 font-semibold",
                                        row.action === "WO_PAUSE" && "bg-amber-50",
                                        row.action === "WO_RESUME" && "bg-amber-50",
                                        (row.action === "KEY_ON" || row.action === "KEY_OFF") && "bg-cyan-50",
                                    )}
                                    style={isInBlock ? { backgroundColor: 'rgb(199, 255, 216)' } : undefined}
                                >
                                    {/* S.No */}
                                    <td className={cn(
                                        "px-3 py-2 text-center text-xs font-mono",
                                        isInBlock && "border-l-4 border-l-emerald-500",
                                    )}>
                                        {row.sNo ?? ''}
                                    </td>

                                    {/* Log ID */}
                                    <td className="px-3 py-2 text-slate-500 font-mono text-xs">
                                        {row.logId || '–'}
                                    </td>

                                    {/* Log Time */}
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-700 text-xs">
                                        {row.logTime.toLocaleString('en-GB')}
                                    </td>

                                    {/* Action */}
                                    <td className="px-3 py-2 font-medium text-slate-800">
                                        {row.action || ''}
                                    </td>

                                    {/* Duration / Part / OK */}
                                    <td className="px-3 py-2 font-mono text-slate-700 align-top min-w-[100px]">
                                        {row.startRowData ? (
                                            <div className="flex flex-col space-y-0.5">
                                                <span className="text-slate-500 font-medium uppercase text-[9px] tracking-wider">Part No</span>
                                                <span className="font-bold text-slate-800 text-[11px] leading-tight">{row.startRowData.partNo}</span>
                                            </div>
                                        ) : row.stopRowData ? (
                                            <div className="flex flex-col space-y-0.5">
                                                <span className="text-emerald-600 font-medium uppercase text-[9px] tracking-wider">OK Qty</span>
                                                <span className="font-bold text-slate-800 text-[11px] leading-tight">{formatHumanEntry(row.stopRowData.ok)}</span>
                                            </div>
                                        ) : null}
                                    </td>

                                    {/* Label / Allot / Reject */}
                                    <td className="px-3 py-2 text-center text-slate-700 align-top">
                                        {isFirstInBlock && row.jobBlockLabel ? (
                                            <span className="inline-block bg-emerald-600 text-white text-xs px-2 py-0.5 rounded">
                                                {row.jobBlockLabel}
                                            </span>
                                        ) : row.startRowData ? (
                                            <div className="flex flex-col space-y-0.5 text-xs text-left">
                                                <span className="text-slate-500 font-medium">Allot:</span>
                                                <span className="font-bold text-slate-800">{row.startRowData.allotted}</span>
                                            </div>
                                        ) : row.stopRowData ? (
                                            <div className="flex flex-col space-y-0.5 text-xs text-left">
                                                <span className="text-rose-600 font-medium">Reject Qty:</span>
                                                <span className="font-bold text-slate-800">{formatHumanEntry(row.stopRowData.reject)}</span>
                                            </div>
                                        ) : (
                                            <span className="font-bold">{row.label || ''}</span>
                                        )}
                                    </td>

                                    {/* Summary / Comments */}
                                    <td className="px-3 py-2 align-top text-sm">
                                        {row.startRowData ? (
                                            <div className="flex flex-col space-y-1">
                                                <div className="flex flex-col space-y-0.5">
                                                    <span className="text-slate-500 font-medium uppercase text-[9px] tracking-wider">Comment</span>
                                                    <span className="italic text-slate-700">{formatHumanEntry(row.startRowData.comment)}</span>
                                                </div>
                                                {row.durationText && (
                                                    <span className="font-mono font-bold text-slate-900 border-t border-slate-200 mt-1 pt-0.5 w-fit">⏲ {row.durationText}</span>
                                                )}
                                            </div>
                                        ) : row.stopRowData ? (
                                            <div className="flex flex-col space-y-1">
                                                <div className="flex flex-col space-y-0.5">
                                                    <span className="text-slate-500 font-medium uppercase text-[9px] tracking-wider">Stop Reason</span>
                                                    <span className="font-medium text-slate-800">{formatHumanEntry(row.stopRowData.reason)}</span>
                                                </div>
                                                {row.durationText && (
                                                    <span className="font-mono font-bold text-slate-900 border-t border-slate-200 mt-1 pt-0.5 w-fit">⏲ {row.durationText}</span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-0.5">
                                                {row.durationText && <span className="font-mono font-bold text-slate-900">{row.durationText}</span>}
                                                {row.summary && (
                                                    <span className={cn(
                                                        "font-medium",
                                                        row.varianceColor === 'red' ? "text-rose-600" :
                                                            row.varianceColor === 'green' ? "text-emerald-600" : "text-slate-600"
                                                    )}>
                                                        {row.summary}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    {/* WO Specs */}
                                    <td className="px-3 py-2 text-xs text-slate-600">
                                        {row.woSpecs && (
                                            <div className="flex flex-col space-y-0.5 whitespace-nowrap">
                                                <span className="font-semibold text-blue-700">WO: {row.woSpecs.woId}</span>
                                                <span className="text-slate-500">PCL: {row.woSpecs.pclText}</span>
                                                <span className="text-slate-500">Allot: {row.woSpecs.allotted}</span>
                                            </div>
                                        )}
                                    </td>

                                    {/* Job Type */}
                                    <td className="px-3 py-2 text-slate-500 text-xs">
                                        {row.jobType}
                                    </td>

                                    {/* Operator */}
                                    <td className="px-3 py-2 text-indigo-700 font-medium text-xs">
                                        {row.operatorName || ''}
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
