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
    // Additional fields for UI
    wo_id_str: string;      // e.g. "2893"
    part_no: string;
    start_name: string;
    stop_name: string;
    start_comment: string;
    stop_comment: string;
    setting: string;
    alloted_qty: number;
    ok_qty: number;
    reject_qty: number;
    device_id: number;
    duration: number;       // total WO duration in seconds
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

export interface WoHeaderData {
    woIdStr: string;
    partNo: string;
    operatorName: string;
    pclText: string;
    setting: string;
    deviceId: number;
    startComment: string;
}

export interface WoSummaryData {
    woIdStr: string;
    partNo: string;
    operatorName: string;
    setting: string;
    deviceId: number;
    startTime: string;
    endTime: string;
    totalDuration: string;
    totalJobs: number;
    totalCycles: number;
    totalCuttingTime: string;
    allotedQty: number;
    okQty: number;
    rejectQty: number;
    totalPauseTime: string;
    pauseReasons: string[];
    stopComment: string;
}

export interface PauseBannerData {
    reason: string;
    durationText: string;
    isShiftBreak: boolean;
}

export interface ReportRow {
    rowId: string;
    sNo?: number;

    // Columns
    logId?: number;
    logTime: Date;
    action?: string;
    durationText?: string | undefined;
    label?: string | undefined;
    summary?: string | undefined;
    jobType: "Production" | "Unknown";
    operatorName?: string;

    // Styling hints
    isJobBlock?: boolean | undefined;
    varianceColor?: "red" | "green" | "neutral" | undefined;
    isComputed?: boolean | undefined;       // Ideal Time, Loading, Idle — skip S.No

    // Special row types
    isWoHeader?: boolean;
    woHeaderData?: WoHeaderData;
    isWoSummary?: boolean;
    woSummaryData?: WoSummaryData;
    isPauseBanner?: boolean;
    pauseBannerData?: PauseBannerData;

    // Job grouping key for visual boxing
    jobBlockLabel?: string | undefined;     // "JOB - 01" etc
    woSpecs?: {
        woId: string;
        pclText: string;
        allotted: number;
    } | undefined;

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
