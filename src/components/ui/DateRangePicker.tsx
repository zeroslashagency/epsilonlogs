import React from 'react';
import { Calendar, Clock } from 'lucide-react';

interface DateRangePickerProps {
    startDate: string; // DD-MM-YYYY HH:MM
    endDate: string;   // DD-MM-YYYY HH:MM
    onChangeStruct: (start: string, end: string) => void;
}

// Helper: Convert "DD-MM-YYYY HH:MM" -> "YYYY-MM-DDTHH:MM" for input
const toNative = (appDate: string) => {
    if (!appDate) return "";
    const [datePart, timePart] = appDate.split(" ");
    const [d, m, y] = datePart.split("-");
    return `${y}-${m}-${d}T${timePart}`;
};

// Helper: Convert "YYYY-MM-DDTHH:MM" -> "DD-MM-YYYY HH:MM" for app
const fromNative = (nativeDate: string) => {
    if (!nativeDate) return "";
    const dateObj = new Date(nativeDate);
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${d}-${m}-${y} ${h}:${min}`;
};

export function DateRangePicker({ startDate, endDate, onChangeStruct }: DateRangePickerProps) {
    const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        if (!newVal) return;
        onChangeStruct(fromNative(newVal), endDate);
    };

    const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        if (!newVal) return;
        onChangeStruct(startDate, fromNative(newVal));
    };

    return (
        <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
            {/* Start Date */}
            <div className="w-full sm:w-auto">
                <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Start Time
                </label>
                <div className="relative">
                    <input
                        type="datetime-local"
                        value={toNative(startDate)}
                        onChange={handleStartChange}
                        className="w-full pl-8 pr-3 py-2 text-sm border rounded hover:border-indigo-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none transition-all cursor-pointer font-mono"
                    />
                    <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
            </div>

            {/* Separator */}
            <div className="hidden sm:block text-slate-400 font-medium">→</div>

            {/* End Date */}
            <div className="w-full sm:w-auto">
                <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> End Time
                </label>
                <div className="relative">
                    <input
                        type="datetime-local"
                        value={toNative(endDate)}
                        onChange={handleEndChange}
                        className="w-full pl-8 pr-3 py-2 text-sm border rounded hover:border-indigo-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none transition-all cursor-pointer font-mono"
                    />
                    <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
            </div>
        </div>
    );
}
