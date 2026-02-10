import React, { useState } from 'react';
import { ArrowLeft, FileText, Download, Play, Activity, Users, Package, Timer, Coffee, Loader2, BarChart3, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReportTable } from './ReportTable';
import { ReportConfig, ReportRow, ReportStats } from './report-types';
import { fetchDeviceLogs, fetchAllWoDetails, formatDateForApi } from './api-client';
import { buildReport } from './report-builder';
import { extractWoIds } from './log-normalizer';

const TOKEN = import.meta.env.VITE_API_TOKEN;

function fmtDur(sec: number): string {
    if (sec <= 0) return "0s";
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
}

export default function ReportPage() {
    const [config, setConfig] = useState<ReportConfig>({
        deviceId: 15,
        startDate: "09-02-2026 11:00",
        endDate: "09-02-2026 17:00",
        toleranceSec: 10
    });

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<any[]>([]);
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setRows([]);
        setStats(null);

        try {
            const logs = await fetchDeviceLogs(config, TOKEN);

            if (logs.length === 0) {
                setError("No logs found for this period.");
                setLoading(false);
                return;
            }

            const woIds = extractWoIds(logs);
            const detailsMap = await fetchAllWoDetails(woIds, TOKEN);
            const { rows: reportRows, stats: reportStats } = buildReport(logs, detailsMap, config);

            setRows(reportRows);
            setStats(reportStats);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "An unknown error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/50 p-6 space-y-6">
            <header className="flex items-center justify-between pb-4 border-b bg-white p-4 rounded-xl shadow-sm">
                <div className="flex items-center gap-4">
                    <Link to="/" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <FileText className="h-6 w-6 text-indigo-600" />
                            Device Logs Report
                        </h1>
                        <p className="text-sm text-slate-500">Generate Job Block analysis from raw device logs</p>
                    </div>
                </div>
            </header>

            {/* Controls */}
            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Device ID</label>
                        <input
                            type="number"
                            value={config.deviceId}
                            onChange={e => setConfig({ ...config, deviceId: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Start Date (DD-MM-YYYY HH:MM)</label>
                        <input
                            type="text"
                            value={config.startDate}
                            onChange={e => setConfig({ ...config, startDate: e.target.value })}
                            placeholder="DD-MM-YYYY HH:MM"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">End Date (DD-MM-YYYY HH:MM)</label>
                        <input
                            type="text"
                            value={config.endDate}
                            onChange={e => setConfig({ ...config, endDate: e.target.value })}
                            placeholder="DD-MM-YYYY HH:MM"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
                    >
                        {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play className="h-4 w-4" />}
                        Generate Report
                    </button>
                </div>

                {error && (
                    <div className="text-red-600 bg-red-50 p-3 rounded-lg text-sm border border-red-100">
                        {error}
                    </div>
                )}
            </div>

            {stats && (
                <div className="space-y-5">
                    {/* Section Header + Export Buttons */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-indigo-600" />
                            Results Analysis
                        </h2>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={async () => {
                                    const { exportToExcel } = await import('./export-utils');
                                    exportToExcel(rows);
                                }}
                                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                            >
                                <Download className="h-4 w-4" />
                                Export Excel
                            </button>
                            <button
                                onClick={async () => {
                                    const { exportToPDF } = await import('./export-utils');
                                    exportToPDF(rows);
                                }}
                                className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium"
                            >
                                <Download className="h-4 w-4" />
                                Export PDF
                            </button>
                        </div>
                    </div>

                    {/* Panel A: KPI Cards — Row 1 */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <KpiCard
                            icon={<Activity className="h-4 w-4" />}
                            label="Total Jobs"
                            value={String(stats.totalJobs)}
                            color="emerald"
                        />
                        <KpiCard
                            icon={<Zap className="h-4 w-4" />}
                            label="Total Cycles"
                            value={String(stats.totalCycles)}
                            color="indigo"
                        />
                        <KpiCard
                            icon={<Timer className="h-4 w-4" />}
                            label="Cutting Time"
                            value={fmtDur(stats.totalCuttingSec)}
                            color="blue"
                        />
                        <KpiCard
                            icon={<Coffee className="h-4 w-4" />}
                            label="Pause / Break"
                            value={fmtDur(stats.totalPauseSec)}
                            color="amber"
                        />
                        <KpiCard
                            icon={<Loader2 className="h-4 w-4" />}
                            label="Loading Time"
                            value={fmtDur(stats.totalLoadingUnloadingSec)}
                            color="slate"
                        />
                        <UtilizationCard utilization={stats.machineUtilization} />
                    </div>

                    {/* Panel B: Production Quality */}
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                        <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                            <Package className="h-4 w-4 text-slate-500" />
                            Production Quality
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                                <div className="text-xs text-blue-500 font-medium uppercase tracking-wide">Allotted Qty</div>
                                <div className="text-2xl font-bold text-blue-700 mt-1">{stats.totalAllotedQty}</div>
                            </div>
                            <div className="text-center p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                                <div className="text-xs text-emerald-500 font-medium uppercase tracking-wide">OK Qty</div>
                                <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.totalOkQty}</div>
                            </div>
                            <div className={`text-center p-3 rounded-lg border ${stats.totalRejectQty > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                                <div className={`text-xs font-medium uppercase tracking-wide ${stats.totalRejectQty > 0 ? 'text-red-500' : 'text-slate-500'}`}>Reject Qty</div>
                                <div className={`text-2xl font-bold mt-1 ${stats.totalRejectQty > 0 ? 'text-red-700' : 'text-slate-700'}`}>{stats.totalRejectQty}</div>
                            </div>
                        </div>
                    </div>

                    {/* Panel C: WO Breakdown Table */}
                    {stats.woBreakdowns.length > 0 && (
                        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b bg-slate-50">
                                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-indigo-500" />
                                    Work Order Breakdown
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-600">
                                            <th className="px-3 py-2 text-left font-semibold">WO ID</th>
                                            <th className="px-3 py-2 text-left font-semibold">Part No</th>
                                            <th className="px-3 py-2 text-left font-semibold">Operator</th>
                                            <th className="px-3 py-2 text-left font-semibold">Setting</th>
                                            <th className="px-3 py-2 text-center font-semibold">Jobs</th>
                                            <th className="px-3 py-2 text-center font-semibold">Cycles</th>
                                            <th className="px-3 py-2 text-right font-semibold">Cutting</th>
                                            <th className="px-3 py-2 text-right font-semibold">Pause</th>
                                            <th className="px-3 py-2 text-right font-semibold">Loading</th>
                                            <th className="px-3 py-2 text-center font-semibold">PCL</th>
                                            <th className="px-3 py-2 text-right font-semibold">Avg Cycle</th>
                                            <th className="px-3 py-2 text-center font-semibold">Allot</th>
                                            <th className="px-3 py-2 text-center font-semibold">OK</th>
                                            <th className="px-3 py-2 text-center font-semibold">Reject</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.woBreakdowns.map((wo, i) => (
                                            <tr key={wo.woId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                <td className="px-3 py-2 font-semibold text-indigo-700">{wo.woId}</td>
                                                <td className="px-3 py-2 text-slate-700">{wo.partNo || '—'}</td>
                                                <td className="px-3 py-2 text-slate-700">{wo.operator}</td>
                                                <td className="px-3 py-2 text-slate-500">{wo.setting || '—'}</td>
                                                <td className="px-3 py-2 text-center font-medium text-slate-800">{wo.jobs}</td>
                                                <td className="px-3 py-2 text-center font-medium text-slate-800">{wo.cycles}</td>
                                                <td className="px-3 py-2 text-right font-mono text-blue-700">{fmtDur(wo.cuttingSec)}</td>
                                                <td className="px-3 py-2 text-right font-mono text-amber-700">{fmtDur(wo.pauseSec)}</td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-600">{fmtDur(wo.loadingSec)}</td>
                                                <td className="px-3 py-2 text-center text-slate-600">{wo.pcl ? fmtDur(wo.pcl) : '—'}</td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-600">{fmtDur(wo.avgCycleSec)}</td>
                                                <td className="px-3 py-2 text-center text-blue-700 font-medium">{wo.allotedQty}</td>
                                                <td className="px-3 py-2 text-center text-emerald-700 font-medium">{wo.okQty}</td>
                                                <td className={`px-3 py-2 text-center font-medium ${wo.rejectQty > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{wo.rejectQty}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Panel D: Operator Summary */}
                    {stats.operatorSummaries.length > 0 && (
                        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b bg-slate-50">
                                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                    <Users className="h-4 w-4 text-violet-500" />
                                    Operator Summary
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-600">
                                            <th className="px-3 py-2 text-left font-semibold">Operator</th>
                                            <th className="px-3 py-2 text-center font-semibold">WOs Handled</th>
                                            <th className="px-3 py-2 text-center font-semibold">Jobs</th>
                                            <th className="px-3 py-2 text-center font-semibold">Cycles</th>
                                            <th className="px-3 py-2 text-right font-semibold">Cutting Time</th>
                                            <th className="px-3 py-2 text-right font-semibold">Pause Time</th>
                                            <th className="px-3 py-2 text-right font-semibold">Avg Cycle</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.operatorSummaries.map((op, i) => (
                                            <tr key={op.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                <td className="px-3 py-2 font-semibold text-violet-700">{op.name}</td>
                                                <td className="px-3 py-2 text-center font-medium text-slate-800">{op.woCount}</td>
                                                <td className="px-3 py-2 text-center font-medium text-slate-800">{op.totalJobs}</td>
                                                <td className="px-3 py-2 text-center font-medium text-slate-800">{op.totalCycles}</td>
                                                <td className="px-3 py-2 text-right font-mono text-blue-700">{fmtDur(op.totalCuttingSec)}</td>
                                                <td className="px-3 py-2 text-right font-mono text-amber-700">{fmtDur(op.totalPauseSec)}</td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-600">{fmtDur(op.avgCycleSec)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Report Table */}
            <ReportTable rows={rows} loading={loading} />
        </div>
    );
}

// --- Sub-components ---

function KpiCard({ icon, label, value, color }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    color: "emerald" | "indigo" | "blue" | "amber" | "slate" | "violet";
}) {
    const colorMap = {
        emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', label: 'text-emerald-600', icon: 'text-emerald-500' },
        indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', label: 'text-indigo-600', icon: 'text-indigo-500' },
        blue: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', label: 'text-blue-600', icon: 'text-blue-500' },
        amber: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', label: 'text-amber-600', icon: 'text-amber-500' },
        slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', label: 'text-slate-600', icon: 'text-slate-500' },
        violet: { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700', label: 'text-violet-600', icon: 'text-violet-500' },
    };
    const c = colorMap[color];
    return (
        <div className={`${c.bg} border ${c.border} p-3 rounded-xl`}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${c.label}`}>
                <span className={c.icon}>{icon}</span>
                {label}
            </div>
            <div className={`text-xl font-bold ${c.text} mt-1`}>{value}</div>
        </div>
    );
}

function UtilizationCard({ utilization }: { utilization: number }) {
    const barColor = utilization >= 70 ? 'bg-emerald-500' : utilization >= 40 ? 'bg-amber-500' : 'bg-red-500';
    const textColor = utilization >= 70 ? 'text-emerald-700' : utilization >= 40 ? 'text-amber-700' : 'text-red-700';
    const bgColor = utilization >= 70 ? 'bg-emerald-50 border-emerald-100' : utilization >= 40 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100';
    const labelColor = utilization >= 70 ? 'text-emerald-600' : utilization >= 40 ? 'text-amber-600' : 'text-red-600';

    return (
        <div className={`${bgColor} border p-3 rounded-xl`}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${labelColor}`}>
                <BarChart3 className="h-3.5 w-3.5" />
                Utilization
            </div>
            <div className={`text-xl font-bold ${textColor} mt-1`}>{utilization}%</div>
            <div className="w-full bg-white/60 rounded-full h-1.5 mt-1.5">
                <div
                    className={`${barColor} h-1.5 rounded-full transition-all duration-500`}
                    style={{ width: `${Math.min(utilization, 100)}%` }}
                />
            </div>
        </div>
    );
}
