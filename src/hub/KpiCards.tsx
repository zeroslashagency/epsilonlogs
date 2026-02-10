import React from 'react';
import { HubKpi } from './types.js';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '../lib/utils.js'; // Assuming a utility exists, or I will use clsx/tailwind-merge inline if easier

const colorStyles = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-50 text-slate-600",
    indigo: "bg-indigo-50 text-indigo-600",
};

const iconStyles = {
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
    indigo: "bg-indigo-100 text-indigo-700",
};

interface KpiCardsProps {
    kpis: HubKpi[];
}

export function KpiCards({ kpis }: KpiCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {kpis.map((kpi) => {
                const Icon = kpi.icon;
                return (
                    <div
                        key={kpi.id}
                        className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${iconStyles[kpi.color]}`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            {kpi.trend && (
                                <div className={`flex items-center gap-1 text-sm font-medium ${kpi.trend === 'up' ? 'text-emerald-600' :
                                    kpi.trend === 'down' ? 'text-rose-600' : 'text-slate-500'
                                    }`}>
                                    {kpi.trend === 'up' && <ArrowUpRight className="w-4 h-4" />}
                                    {kpi.trend === 'down' && <ArrowDownRight className="w-4 h-4" />}
                                    {kpi.trend === 'neutral' && <Minus className="w-4 h-4" />}
                                    <span>{kpi.trendValue}</span>
                                </div>
                            )}
                        </div>
                        <div>
                            <p className="text-slate-500 text-sm font-medium mb-1">{kpi.label}</p>
                            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{kpi.value}</h3>
                            {kpi.subValue && (
                                <p className="text-slate-400 text-xs mt-2">{kpi.subValue}</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
