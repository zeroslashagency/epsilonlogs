// --- API Types ---

export interface DeviceLogEntry {
    id: number;
    log_time: string; // ISO string from API
    action: "SPINDLE_ON" | "SPINDLE_OFF" | "WO_START" | "WO_STOP" | "WO_PAUSE" | "WO_RESUME" | string;
    wo_id: number;
    device_id: number;
    [key: string]: unknown;
}

export interface DeviceLogApiResponse {
    success: boolean;
    result?: {
        logs: DeviceLogEntry[];
        pagination?: {
            total_items: number;
            total_pages: number;
            current_page: number;
        };
    };
    error?: {
        message: string;
    };
}

export interface WoExtension {
    id: number;
    wo_id: number;
    extension_time: string | null;
    extension_comment: string | null;
    extension_duration: number;
}

export interface WoDetails {
    id: number;
    pcl: number | null;
    start_time: string | null;
    end_time: string | null;
    extensions: WoExtension[];
}

// --- Internal Processing Types ---

export interface SpindleCycle {
    onLog: DeviceLogEntry;
    offLog: DeviceLogEntry;
    durationSec: number;
}

export interface PausePeriod {
    pauseLog: DeviceLogEntry;
    resumeLog: DeviceLogEntry;
    durationSec: number;
}

export interface WoSegment {
    woId: number;
    logs: DeviceLogEntry[];
    spindleCycles: SpindleCycle[];
    pausePeriods: PausePeriod[];
    jobType: "Production" | "Unknown";
}

export interface JobBlock {
    label: string; // "JOB - 01"
    cycles: SpindleCycle[];
    totalSec: number;
    varianceSec: number | null;
    pcl: number | null;
}

// --- Display / Report Types ---

export type ReportRowKind = "EVENT" | "COMPUTED_IDEAL" | "COMPUTED_LOADING" | "JOB_SUMMARY";

export interface ReportRow {
    rowId: string;
    sNo?: number;

    // Columns
    logId?: number;
    logTime: Date;
    action?: string;
    durationText?: string;
    label?: string;
    summary?: string;
    jobType: "Production" | "Unknown";

    // Styling hints
    isJobBlock?: boolean;
    varianceColor?: "red" | "green" | "neutral";

    // Metadata
    timestamp: number;
    originalLog?: DeviceLogEntry;
}

export interface ReportConfig {
    deviceId: number;
    startDate: string; // "DD-MM-YYYY HH:MM"
    endDate: string;
    toleranceSec: number;
}

export interface ReportStats {
    totalJobs: number;
    totalCycles: number;
    totalCuttingSec: number;
}
