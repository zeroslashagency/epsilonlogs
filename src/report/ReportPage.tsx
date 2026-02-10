import React, { useState } from 'react';
import { ArrowLeft, FileText, Download, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReportTable } from './ReportTable';
import { ReportConfig, ReportRow, ReportStats } from './report-types';
import { fetchDeviceLogs, fetchAllWoDetails, formatDateForApi } from './api-client';
import { buildReport } from './report-builder';
import { extractWoIds } from './log-normalizer';

const TOKEN = import.meta.env.VITE_API_TOKEN;

export default function ReportPage() {
    const [config, setConfig] = useState<ReportConfig>({
        deviceId: 15,
        startDate: "09-02-2026 11:00",
        endDate: "09-02-2026 17:00",
        toleranceSec: 10
    });

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<any[]>([]); // Typed as any[] temporarily to avoid strict import loop issues in types? No, just use type.
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setRows([]);
        setStats(null);

        try {
            // 1. Fetch Logs
            const logs = await fetchDeviceLogs(config, TOKEN);

            if (logs.length === 0) {
                setError("No logs found for this period.");
                setLoading(false);
                return;
            }

            // 2. Extract WOs and Fetch Details
            const woIds = extractWoIds(logs);
            const detailsMap = await fetchAllWoDetails(woIds, TOKEN);

            // 3. Build Report
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
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                        <div className="text-sm text-emerald-600 font-medium">Total Jobs</div>
                        <div className="text-2xl font-bold text-emerald-700">{stats.totalJobs}</div>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                        <div className="text-sm text-indigo-600 font-medium">Total Cycles</div>
                        <div className="text-2xl font-bold text-indigo-700">{stats.totalCycles}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                        <div className="text-sm text-slate-600 font-medium">Total Cutting Time</div>
                        <div className="text-2xl font-bold text-slate-700">
                            {Math.floor(stats.totalCuttingSec / 60)}m {Math.round(stats.totalCuttingSec % 60)}s
                        </div>
                    </div>
                </div>
            )}

            {/* Table - Pass rows as any for now if type conflict, but ideally ReportRow */}
            <ReportTable rows={rows} loading={loading} />

        </div>
    );
}
