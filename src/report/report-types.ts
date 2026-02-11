// --- API Types ---

export interface DeviceLogEntry {
    log_id: number;       // API returns log_id, not id
    id?: number;          // Compatibility for payloads that send id instead of log_id
    log_time: string;     // ISO string from API
    action: "SPINDLE_ON" | "SPINDLE_OFF" | "WO_START" | "WO_STOP" | "WO_PAUSE" | "WO_RESUME" | string;
    wo_id: number;
    device_id: number;
    // Rich inline fields from the API
    wo_name?: string;     // WO ID string e.g. "2893"
    setting?: string;
    part_no?: string;
    alloted_qty?: number;
    ok_qty?: number;
    reject_qty?: number;
    pcl?: string;         // PCL as string from inline data
    start_name?: string;
    start_time?: string;
    end_time?: string;
    start_comment?: string;
    stop_comment?: string;
    status?: string;
    duration?: number;
    uid?: number;
    job_type?: string;
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
    start_uid: number | null;
    stop_uid: number | null;
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
    job_type?: number;      // 1=Production, 2=Setting, etc.
    target_duration?: number; // Used for Job Type 2 instead of PCL
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
    startComment: string;
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
    durationSec?: number | undefined;
    label?: string | undefined;
    summary?: string | undefined;
    jobType: "Production" | "Unknown";
    operatorName?: string;
    classification?: "GOOD" | "WARNING" | "BAD" | "UNKNOWN";
    reasonCode?: string;
    reasonText?: string;

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

    // Rich data for WO_START / WO_STOP rows
    startRowData?: {
        partNo: string;
        allotted: number;
        comment: string;
    };
    stopRowData?: {
        ok: number;
        reject: number;
        reason: string;
    };

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

export interface WoBreakdown {
    woId: string;
    partNo: string;
    operator: string;
    setting: string;
    jobs: number;
    cycles: number;
    cuttingSec: number;
    pauseSec: number;
    loadingSec: number;
    allotedQty: number;
    okQty: number;
    rejectQty: number;
    pcl: number | null;
    avgCycleSec: number;
    startTime: string;
    endTime: string;
    durationSec: number;
}

export interface OperatorSummary {
    name: string;
    woCount: number;
    totalJobs: number;
    totalCycles: number;
    totalCuttingSec: number;
    totalPauseSec: number;
    avgCycleSec: number;
}

export interface ReportStats {
    totalJobs: number;
    totalCycles: number;
    totalCuttingSec: number;

    // Time breakdown
    totalPauseSec: number;
    totalLoadingUnloadingSec: number;
    totalIdleSec: number;
    totalWoDurationSec: number;
    machineUtilization: number;     // percentage

    // Production quality
    totalAllotedQty: number;
    totalOkQty: number;
    totalRejectQty: number;
    totalLogs: number;

    // Detailed breakdowns
    woBreakdowns: WoBreakdown[];
    operatorSummaries: OperatorSummary[];
}
