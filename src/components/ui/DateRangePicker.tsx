import React from 'react';
import { Calendar, Clock } from 'lucide-react';

interface DateRangePickerProps {
    startDate: string; // DD-MM-YYYY HH:MM
    endDate: string;   // DD-MM-YYYY HH:MM
    onChangeStruct: (start: string, end: string) => void;
    variant?: "light" | "dark";
}

const APP_DATE_REGEX = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/;
const NATIVE_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// "DD-MM-YYYY HH:MM" -> "YYYY-MM-DDTHH:MM"
const toNative = (appDate: string): string => {
    if (!appDate) return "";
    const match = APP_DATE_REGEX.exec(appDate.trim());
    if (!match) return "";
    const [, dd, mm, yyyy, hh, min] = match;
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

// "YYYY-MM-DDTHH:MM" -> "DD-MM-YYYY HH:MM"
const fromNative = (nativeDate: string): string => {
    if (!nativeDate) return "";
    const match = NATIVE_DATE_REGEX.exec(nativeDate.trim());
    if (!match) return "";
    const [, yyyy, mm, dd, hh, min] = match;
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
};

export function DateRangePicker({
    startDate,
    endDate,
    onChangeStruct,
    variant = "light",
}: DateRangePickerProps) {
    const isDark = variant === "dark";
    const containerClass = isDark
        ? "bg-slate-950/70 border-slate-700"
        : "bg-slate-50 border-slate-200";
    const labelClass = isDark ? "text-slate-300" : "text-slate-500";
    const inputClass = isDark
        ? "bg-slate-900 border-slate-700 text-slate-100 [color-scheme:dark] hover:border-indigo-400 focus:border-indigo-400 focus:ring-indigo-500"
        : "bg-white border-slate-300 text-slate-900 [color-scheme:light] hover:border-indigo-400 focus:border-indigo-600 focus:ring-indigo-600";
    const iconClass = isDark ? "text-slate-400" : "text-slate-400";
    const arrowClass = isDark ? "text-slate-500" : "text-slate-400";

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
        <div className={`flex flex-col sm:flex-row gap-4 items-end sm:items-center p-2 rounded-lg border ${containerClass}`}>
            {/* Start Date */}
            <div className="w-full sm:w-auto">
                <label className={`block text-xs font-semibold mb-1 flex items-center gap-1 ${labelClass}`}>
                    <Calendar className="h-3 w-3" /> Start Time
                </label>
                <div className="relative">
                    <input
                        type="datetime-local"
                        value={toNative(startDate)}
                        onChange={handleStartChange}
                        className={`w-full pl-8 pr-3 py-2 text-sm border rounded focus:ring-1 outline-none transition-all cursor-pointer font-mono ${inputClass}`}
                    />
                    <Clock className={`absolute left-2.5 top-2.5 h-4 w-4 pointer-events-none ${iconClass}`} />
                </div>
            </div>

            {/* Separator */}
            <div className={`hidden sm:block font-medium ${arrowClass}`}>→</div>

            {/* End Date */}
            <div className="w-full sm:w-auto">
                <label className={`block text-xs font-semibold mb-1 flex items-center gap-1 ${labelClass}`}>
                    <Calendar className="h-3 w-3" /> End Time
                </label>
                <div className="relative">
                    <input
                        type="datetime-local"
                        value={toNative(endDate)}
                        onChange={handleEndChange}
                        className={`w-full pl-8 pr-3 py-2 text-sm border rounded focus:ring-1 outline-none transition-all cursor-pointer font-mono ${inputClass}`}
                    />
                    <Clock className={`absolute left-2.5 top-2.5 h-4 w-4 pointer-events-none ${iconClass}`} />
                </div>
            </div>
        </div>
    );
}
