import React from 'react';
import { Filter } from 'lucide-react';

interface FilterPanelProps {
    activeFilter: string;
    onFilterChange: (filter: string) => void;
}

export function FilterPanel({ activeFilter, onFilterChange }: FilterPanelProps) {
    const filters = [
        { id: 'all', label: 'All Cycles' },
        { id: 'good', label: 'Good Only', color: 'bg-emerald-100 text-emerald-700' },
        { id: 'warning', label: 'Warnings', color: 'bg-amber-100 text-amber-700' },
        { id: 'bad', label: 'Bad Cycles', color: 'bg-rose-100 text-rose-700' },
    ];

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                    <Filter className="w-5 h-5" />
                </div>
                <h3 className="text-slate-700 font-semibold">Smart Filters</h3>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto">
                {filters.map((filter) => (
                    <button
                        key={filter.id}
                        onClick={() => onFilterChange(filter.id)}
                        className={`
                            px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap
                            ${activeFilter === filter.id
                                ? (filter.color ? filter.color.replace('100', '200') : 'bg-slate-800 text-white')
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}
                        `}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
