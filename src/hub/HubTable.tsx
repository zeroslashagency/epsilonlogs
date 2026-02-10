import React from 'react';
import { ProductionCycle } from './types.js';
import { MoreHorizontal } from 'lucide-react';

interface HubTableProps {
    cycles: ProductionCycle[];
}

const statusStyles = {
    Good: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Warning: "bg-amber-50 text-amber-700 border-amber-100",
    Bad: "bg-rose-50 text-rose-700 border-rose-100",
    Running: "bg-blue-50 text-blue-700 border-blue-100 animate-pulse",
};

export function HubTable({ cycles }: HubTableProps) {
    if (cycles.length === 0) {
        return (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm">
                <p className="text-slate-400">No production cycles found matching your criteria.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="text-left py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">WO / Part</th>
                            <th className="text-left py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Operator</th>
                            <th className="text-right py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cycle Time</th>
                            <th className="text-right py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Efficiency</th>
                            <th className="text-right py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Timestamp</th>
                            <th className="py-4 px-6"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {cycles.map((cycle) => (
                            <tr key={cycle.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-4 px-6">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusStyles[cycle.status]}`}>
                                        {cycle.status}
                                    </span>
                                </td>
                                <td className="py-4 px-6">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-slate-900">{cycle.wo_id}</span>
                                        <span className="text-xs text-slate-500">{cycle.part_no}</span>
                                    </div>
                                </td>
                                <td className="py-4 px-6 text-slate-600 text-sm">{cycle.operator}</td>
                                <td className="py-4 px-6 text-right font-mono text-sm text-slate-700">{cycle.cycleTime}</td>
                                <td className="py-4 px-6 text-right">
                                    <span className={`font-semibold text-sm ${cycle.efficiency >= 90 ? 'text-emerald-600' :
                                        cycle.efficiency >= 75 ? 'text-amber-600' : 'text-rose-600'
                                        }`}>
                                        {cycle.efficiency}%
                                    </span>
                                </td>
                                <td className="py-4 px-6 text-right text-slate-500 text-sm">
                                    {cycle.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-4 px-6 text-right">
                                    <button className="text-slate-400 hover:text-slate-600">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
