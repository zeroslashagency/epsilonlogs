import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { KpiCards } from './KpiCards.js';
import { FilterPanel } from './FilterPanel.js';
import { HubTable } from './HubTable.js';
import { HubKpi, ProductionCycle } from './types.js';
import { Layers, Activity, AlertTriangle, CheckCircle2, RotateCcw, FileText } from 'lucide-react';
import { fetchDeviceLogs, fetchAllWoDetails } from '../report/api-client.js';
import { normalizeLogs, extractWoIds } from '../report/log-normalizer.js';
import { DeviceLogEntry, ReportConfig } from '../report/report-types.js';

const REFRESH_INTERVAL_MS = 30000;
const DEVICE_ID = 15; // Default for now, could be prop or context

export default function ProductionHub() {
    const [loading, setLoading] = useState(true);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const [activeFilter, setActiveFilter] = useState('all');
    const [kpis, setKpis] = useState<HubKpi[]>([]);
    const [cycles, setCycles] = useState<ProductionCycle[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch logs for today (00:00 to now)
            const now = new Date();
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);

            // Format dates for API: DD-MM-YYYY HH:MM
            const formatDate = (d: Date) => {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
            };

            const config: ReportConfig = {
                deviceId: DEVICE_ID,
                startDate: formatDate(start),
                endDate: formatDate(now),
                toleranceSec: 0
            };

            // Using existing API client
            // TODO: Ensure we have the token available. Assuming it's in env like ReportPage.
            const token = import.meta.env.VITE_API_TOKEN;
            const logs = await fetchDeviceLogs(config, token);
            const normalized = normalizeLogs(logs);

            // Calculate KPIs and Cycles
            // This is a simplified version. In a real app we'd reuse the heavy buildReport logic 
            // from report-builder.ts, but for the "Hub" view we might want lighter, faster metrics.
            // For now, let's just count WOs and basic cycles.

            // Mocking some data transformation for the view
            const totalWos = new Set(normalized.map(l => l.wo_id)).size;
            const cycleLogs = normalized.filter(l => l.action === 'SPINDLE_OFF'); // Primitive cycle count
            const totalCycles = cycleLogs.length;
            const warnings = Math.floor(totalCycles * 0.1); // Mock 10% warnings
            const bad = Math.floor(totalCycles * 0.05); // Mock 5% bad

            setKpis([
                { id: 'wos', label: 'Active WOs', value: totalWos, icon: Layers, color: 'blue', trend: 'up', trendValue: '+2' },
                { id: 'cycles', label: 'Avg Efficiency', value: '87%', icon: Activity, color: 'emerald', trend: 'up', trendValue: '+5%' },
                { id: 'warnings', label: 'Warnings', value: warnings, icon: AlertTriangle, color: 'amber', trend: 'neutral' },
                { id: 'good', label: 'Good Cycles', value: totalCycles - warnings - bad, icon: CheckCircle2, color: 'slate' }, // Slate for neutral good
            ]);

            // Mock mapping logs to "ProductionCycles" for the table
            const mappedCycles: ProductionCycle[] = cycleLogs.slice(0, 20).map((log, i) => ({
                id: log.log_id,
                wo_id: `WO-${log.wo_id}`,
                part_no: log.part_no || 'Unknown',
                operator: log.start_name || 'Operator',
                status: i % 10 === 0 ? 'Bad' : i % 5 === 0 ? 'Warning' : 'Good',
                cycleTime: `${log.duration || 120}s`, // Mock or real duration
                efficiency: 95 - (i % 10),
                timestamp: new Date(log.log_time),
            }));

            setCycles(mappedCycles);
            setLastRefreshed(new Date());

        } catch (err) {
            console.error("Failed to fetch hub data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    // Filter Logic
    const filteredCycles = cycles.filter(c => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'good') return c.status === 'Good';
        if (activeFilter === 'warning') return c.status === 'Warning';
        if (activeFilter === 'bad') return c.status === 'Bad';
        return true;
    });

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">WO Production Hub</h1>
                        <p className="text-slate-500">Live performance analytics & green threshold filtering</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm text-xs font-medium text-slate-500">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Live Updates On
                        </div>
                        <Link to="/report" className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm border border-slate-200">
                            <FileText className="w-4 h-4" />
                            Device Logs Report
                        </Link>
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                        >
                            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh Data
                        </button>
                    </div>
                </div>

                {/* KPI Cards */}
                <KpiCards kpis={kpis} />

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Left Panel: Filters & Config */}
                    <div className="lg:col-span-4"> {/* Making full width for now based on SaaS mockup showing pills at top */}
                        <div className="bg-white rounded-2xl p-1 shadow-sm border border-slate-100 flex gap-1 mb-6 w-fit">
                            {['all', 'good', 'warning', 'bad'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setActiveFilter(f)}
                                    className={`
                                        px-6 py-2 rounded-xl text-sm font-medium transition-all
                                        ${activeFilter === f
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-50'}
                                    `}
                                >
                                    {f.charAt(0).toUpperCase() + f.slice(1)} Cycles
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right Panel: Table */}
                    <div className="lg:col-span-4">
                        <HubTable cycles={filteredCycles} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Reuse utility if not already in global scope, assuming we want this file self-contained or importable
