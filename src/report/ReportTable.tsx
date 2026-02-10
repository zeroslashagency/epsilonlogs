import React from 'react';
import { ReportRow } from "./report-types";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ReportTableProps {
    rows: ReportRow[];
    loading?: boolean;
}

export function ReportTable({ rows, loading }: ReportTableProps) {
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
                No data generated. Select a valid range and device.
            </div>
        );
    }

    return (
        <div className="border rounded-xl overflow-hidden shadow-lg bg-white">
            <table className="w-full text-sm text-left border-collapse">
                <thead>
                    <tr className="bg-slate-800 text-white">
                        <th className="px-3 py-3 font-semibold w-14 text-center">S.No</th>
                        <th className="px-3 py-3 font-semibold w-20">Log ID</th>
                        <th className="px-3 py-3 font-semibold w-44">Log Time</th>
                        <th className="px-3 py-3 font-semibold w-28">Action</th>
                        <th className="px-3 py-3 font-semibold w-32">Duration</th>
                        <th className="px-3 py-3 font-semibold text-center">Label</th>
                        <th className="px-3 py-3 font-semibold">Summary / Notes</th>
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
                                    <td colSpan={9} className="px-4 py-3">
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
                                    <td colSpan={9} className="px-4 py-3">
                                        <div className="text-xs font-semibold mb-1 text-slate-300">
                                            📊 WO #{s.woIdStr} Summary
                                        </div>
                                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                                            <span>Device: <strong>{s.deviceId}</strong></span>
                                            <span>Setting: <strong>{s.setting}</strong></span>
                                            <span>Start: <strong>{s.startTime}</strong></span>
                                            <span>End: <strong>{s.endTime}</strong></span>
                                            <span>Total: <strong>{s.totalDuration}</strong></span>
                                        </div>
                                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm mt-1">
                                            <span className="text-emerald-300">{s.totalJobs} Jobs</span>
                                            <span className="text-emerald-300">{s.totalCycles} Cycles</span>
                                            <span className="text-emerald-300">Cutting: {s.totalCuttingTime}</span>
                                            <span>Alloted: <strong>{s.allotedQty}</strong></span>
                                            <span className="text-emerald-300">OK: {s.okQty}</span>
                                            {s.rejectQty > 0 && <span className="text-rose-300">Reject: {s.rejectQty}</span>}
                                            <span className="text-amber-300">Pause: {s.totalPauseTime}</span>
                                            {s.pauseReasons.length > 0 && (
                                                <span className="text-amber-200">({s.pauseReasons.join(', ')})</span>
                                            )}
                                        </div>
                                        {s.stopComment && (
                                            <div className="mt-2 text-xs italic text-slate-400 border-t border-slate-700 pt-1">
                                                📝 Stop Reason: {s.stopComment}
                                            </div>
                                        )}
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
                                    <td colSpan={9} className="px-4 py-2">
                                        <div className={cn(
                                            "flex items-center gap-3 font-semibold text-sm",
                                            p.isShiftBreak ? "text-rose-700" : "text-amber-800"
                                        )}>
                                            <span>{p.isShiftBreak ? '🔴' : '⚠️'}</span>
                                            <span>{p.isShiftBreak ? 'SHIFT BREAK' : 'WO_PAUSE'}</span>
                                            <span className="text-xs font-normal">Reason:</span>
                                            <span className="underline">{p.reason}</span>
                                            <span className="ml-auto font-mono">{p.durationText}</span>
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

                                {/* Duration */}
                                <td className="px-3 py-2 font-mono text-slate-700">
                                    {row.durationText || ''}
                                </td>

                                {/* Label */}
                                <td className="px-3 py-2 text-center font-bold text-slate-700">
                                    {isFirstInBlock && row.jobBlockLabel ? (
                                        <span className="inline-block bg-emerald-600 text-white text-xs px-2 py-0.5 rounded">
                                            {row.jobBlockLabel}
                                        </span>
                                    ) : (
                                        <span>{row.label || ''}</span>
                                    )}
                                </td>

                                {/* Summary */}
                                <td className="px-3 py-2">
                                    <span className={cn(
                                        "font-medium",
                                        row.varianceColor === 'red' ? "text-rose-600" :
                                            row.varianceColor === 'green' ? "text-emerald-600" : "text-slate-600"
                                    )}>
                                        {row.summary || ''}
                                    </span>
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
    );
}
