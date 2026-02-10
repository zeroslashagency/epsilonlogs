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
                <span className="animate-pulse">Generating Report...</span>
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
        <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
            <table className="w-full text-sm text-left border-collapse">
                <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b">
                        <th className="px-4 py-3 border-r font-semibold w-16">S.No</th>
                        <th className="px-4 py-3 border-r font-semibold">Log ID</th>
                        <th className="px-4 py-3 border-r font-semibold">Log Time</th>
                        <th className="px-4 py-3 border-r font-semibold">Action</th>
                        <th className="px-4 py-3 border-r font-semibold">Duration / Value</th>
                        <th className="px-4 py-3 border-r font-semibold text-center">Label</th>
                        <th className="px-4 py-3 border-r font-semibold">Summary / Notes</th>
                        <th className="px-4 py-3 font-semibold w-24">Job Type</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={row.rowId}
                            className={cn(
                                "border-b last:border-0 hover:bg-slate-50/50 transition-colors",
                                row.isJobBlock ? "bg-emerald-50/40" : "bg-white",
                                // Ideal/Loading rows might want distinct styling? 
                                // Screenshot shows Loading rows as white/neutral.
                            )}
                        >
                            <td className="px-4 py-2 border-r text-slate-500 font-mono text-xs">{row.sNo}</td>
                            <td className="px-4 py-2 border-r text-slate-500 font-mono text-xs">{row.logId || '-'}</td>
                            <td className="px-4 py-2 border-r whitespace-nowrap text-slate-700">
                                {row.logTime.toLocaleString('en-GB')}
                            </td>
                            <td className="px-4 py-2 border-r font-medium text-slate-800">
                                {row.action || ''}
                            </td>
                            <td className="px-4 py-2 border-r font-mono text-slate-700">
                                {row.durationText || ''}
                            </td>
                            <td className="px-4 py-2 border-r text-center font-bold text-slate-700">
                                {row.label || ''}
                            </td>
                            <td className="px-4 py-2 border-r">
                                <span className={cn(
                                    "font-medium",
                                    row.varianceColor === 'red' ? "text-rose-600" :
                                        row.varianceColor === 'green' ? "text-emerald-600" : "text-slate-600"
                                )}>
                                    {row.summary || ''}
                                </span>
                            </td>
                            <td className="px-4 py-2 text-slate-500">
                                {row.jobType}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
