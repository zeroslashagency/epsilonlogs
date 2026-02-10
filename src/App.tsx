import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import {
    Activity,
    CheckCircle2,
    AlertCircle,
    XCircle,
    HelpCircle,
    Filter,
    RefreshCw,
    Clock,
    Settings,
    FileText
} from 'lucide-react';
import { classifyApiPayload } from './classifier';
import { WoApiResponse, ClassifiedRow, FilterState } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReportPage from './report/ReportPage';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const DEFAULT_FILTER_STATE: FilterState = {
    goodOnly: true,
    includeWarning: false,
    includeBad: false,
    includeUnknown: false,
    includeBreak: false,
};

function Dashboard() {
    const [data, setData] = useState<ClassifiedRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
    const [stats, setStats] = useState({ total: 0, good: 0, warning: 0, bad: 0, unknown: 0 });

    const token = import.meta.env.VITE_API_TOKEN;

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch multiple records to show a meaningful dashboard
            const ids = [306, 307, 308, 309, 310];
            const allRows: ClassifiedRow[] = [];

            for (const id of ids) {
                const response = await fetch(`/api/v2/wo/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const resJson: WoApiResponse = await response.json();
                if (resJson.success && resJson.result) {
                    allRows.push(...classifyApiPayload(resJson));
                }
            }
            setData(allRows);
        } catch (error) {
            console.error('Fetch error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredData = useMemo(() => {
        return data.filter(row => {
            if (row.rowKind === 'EXTENSION' && !filters.includeBreak) return false;
            if (row.classification === 'GOOD') return true;
            if (row.classification === 'WARNING' && (filters.includeWarning || !filters.goodOnly)) return true;
            if (row.classification === 'BAD' && (filters.includeBad || !filters.goodOnly)) return true;
            if (row.classification === 'UNKNOWN' && (filters.includeUnknown || !filters.goodOnly)) return true;
            return !filters.goodOnly;
        });
    }, [data, filters]);

    useEffect(() => {
        const s = { total: 0, good: 0, warning: 0, bad: 0, unknown: 0 };
        data.forEach(row => {
            if (row.rowKind === 'WO') {
                s.total++;
                if (row.classification === 'GOOD') s.good++;
                if (row.classification === 'WARNING') s.warning++;
                if (row.classification === 'BAD') s.bad++;
                if (row.classification === 'UNKNOWN') s.unknown++;
            }
        });
        setStats(s);
    }, [data]);

    return (
        <div className="min-h-screen p-6 space-y-8 bg-slate-50/50">
            {/* Header */}
            <header className="flex items-center justify-between pb-4 border-b bg-white p-4 rounded-xl shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                        <Activity className="text-indigo-600 h-7 w-7" />
                        WO Production Hub
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">Live performance analytics & green threshold filtering</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link to="/report" className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors font-medium border border-transparent hover:border-slate-200">
                        <FileText className="h-4 w-4" />
                        Device Logs Report
                    </Link>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all font-medium shadow-sm active:scale-95"
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        {loading ? "Syncing..." : "Refresh Data"}
                    </button>
                </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { label: 'Total WOs', value: stats.total, color: 'text-slate-600', icon: Activity, bg: 'bg-white' },
                    { label: 'Good Cycles', value: stats.good, color: 'text-emerald-600', icon: CheckCircle2, bg: 'bg-emerald-50/50 border-emerald-100' },
                    { label: 'Warnings', value: stats.warning, color: 'text-amber-600', icon: AlertCircle, bg: 'bg-amber-50/50 border-amber-100' },
                    { label: 'Bad Cycles', value: stats.bad, color: 'text-rose-600', icon: XCircle, bg: 'bg-rose-50/50 border-rose-100' },
                    { label: 'Unknown', value: stats.unknown, color: 'text-slate-400', icon: HelpCircle, bg: 'bg-slate-50/50 border-slate-100' },
                ].map((stat, i) => (
                    <div key={i} className={cn("p-6 rounded-2xl border flex flex-col gap-2 shadow-sm transition-all hover:shadow-md", stat.bg)}>
                        <div className="flex justify-between items-start">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</span>
                            <stat.icon className={cn("h-5 w-5", stat.color)} />
                        </div>
                        <span className={cn("text-3xl font-bold", stat.color)}>{stat.value}</span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Filters Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-2xl p-6 border shadow-sm">
                        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-slate-800">
                            <Filter className="h-5 w-5 text-indigo-500" />
                            Smart Filters
                        </h3>

                        <div className="space-y-4">
                            <label className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200 group">
                                <span className="font-medium text-slate-700 group-hover:text-indigo-700">Good Only (Green)</span>
                                <input
                                    type="checkbox"
                                    checked={filters.goodOnly}
                                    onChange={e => setFilters({ ...filters, goodOnly: e.target.checked })}
                                    className="w-5 h-5 accent-emerald-500 rounded focus:ring-emerald-500"
                                />
                            </label>

                            {!filters.goodOnly && (
                                <div className="pt-4 border-t space-y-3 animate-in fade-in slide-in-from-top-2">
                                    {[
                                        { id: 'includeWarning', label: 'Include Warning', color: 'accent-amber-500' },
                                        { id: 'includeBad', label: 'Include Bad', color: 'accent-rose-500' },
                                        { id: 'includeUnknown', label: 'Include Unknown', color: 'accent-slate-400' },
                                        { id: 'includeBreak', label: 'Include Break/Extensions', color: 'accent-indigo-500' },
                                    ].map(f => (
                                        <label key={f.id} className="flex items-center justify-between p-2 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-sm">
                                            <span className="text-slate-600 font-medium">{f.label}</span>
                                            <input
                                                type="checkbox"
                                                checked={(filters as any)[f.id]}
                                                onChange={e => setFilters({ ...filters, [f.id]: e.target.checked })}
                                                className={cn("w-4 h-4 rounded", f.color)}
                                            />
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
                        <h4 className="font-semibold text-indigo-700 flex items-center gap-2 mb-2">
                            <Settings className="h-4 w-4" />
                            Threshold Config
                        </h4>
                        <p className="text-xs text-indigo-600/80 leading-relaxed font-medium">
                            Green Lower: Ideal - 10% (min 5s)<br />
                            Green Upper: Ideal + 10% (min 5s)<br />
                            Warning: Within ±25%
                        </p>
                    </div>
                </div>

                {/* Data Table */}
                <div className="lg:col-span-3">
                    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b">
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Work Order / Comment</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={5} className="px-6 py-8">
                                                <div className="h-4 bg-slate-100 rounded w-full"></div>
                                            </td>
                                        </tr>
                                    ))
                                ) : filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                            No records found matching filters
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((row, i) => (
                                        <tr key={i} className={cn(
                                            "transition-colors group",
                                            row.classification === 'GOOD' ? "hover:bg-emerald-50/30" :
                                                row.classification === 'WARNING' ? "hover:bg-amber-50/30" :
                                                    row.classification === 'BAD' ? "hover:bg-rose-50/30" : "hover:bg-slate-50/50"
                                        )}>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                    row.rowKind === 'WO' ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-slate-100 text-slate-500"
                                                )}>
                                                    {row.rowKind}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-slate-900">
                                                    {row.rowKind === 'WO' ? `ID: ${row.workOrder.id}` : row.extension?.comment || 'N/A'}
                                                </div>
                                                {row.rowKind === 'WO' && (
                                                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                                        <Clock className="h-3 w-3" />
                                                        Target: {row.workOrder.targetDurationSec}s
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-mono text-sm text-slate-600">
                                                {row.rowKind === 'WO' ? `${row.workOrder.durationSec}s` : row.extension ? `${row.extension.durationSec}s` : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={cn(
                                                    "inline-flex items-center gap-1.5 font-semibold text-sm",
                                                    row.classification === 'GOOD' ? "text-emerald-600" :
                                                        row.classification === 'WARNING' ? "text-amber-600" :
                                                            row.classification === 'BAD' ? "text-rose-600" : "text-slate-400"
                                                )}>
                                                    {row.classification === 'GOOD' && <CheckCircle2 className="h-4 w-4" />}
                                                    {row.classification === 'WARNING' && <AlertCircle className="h-4 w-4" />}
                                                    {row.classification === 'BAD' && <XCircle className="h-4 w-4" />}
                                                    {row.classification === 'UNKNOWN' && <HelpCircle className="h-4 w-4" />}
                                                    {row.classification}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded-md border border-slate-200">
                                                    {row.reasonCode}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/report" element={<ReportPage />} />
            </Routes>
        </Router>
    );
}
