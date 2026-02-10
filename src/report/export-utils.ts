import type { Font, Row, Workbook, Worksheet } from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDuration } from './format-utils.js';
import { ReportConfig, ReportRow, ReportStats, WoDetails } from './report-types.js';

export const LOG_SHEET_HEADERS = [
    'S.No',
    'Log Time',
    'Action',
    'Job Tag',
    'Summary / Notes',
    'Job Type',
    'Device Name',
    'WO Name',
    'UID ID',
    'UID Name',
    'Setting',
    'Part No',
    'Alloted Qty',
    'Start Comment',
    'PCL',
] as const;

export const LOG_STYLE_COLORS = {
    headerBg: 'FF1E293B',
    headerText: 'FFFFFFFF',
    woHeaderBg: 'FF2563EB',
    woSummaryBg: 'FF1E293B',
    pauseShiftBg: 'FFFEE2E2',
    pauseBg: 'FFFEF3C7',
    jobBlockBg: 'FFC7FFD8',
    jobTagChipBg: 'FF059669',
    groupBorder: 'FF34D399',
    woActionBg: 'FFEFF6FF',
    pauseActionBg: 'FFFEF3C7',
    computedBg: 'FFF8FAFC',
    unknownBg: 'FFF1F5F9',
    defaultBg: 'FFFFFFFF',
    darkText: 'FF0F172A',
    mutedText: 'FF64748B',
    whiteText: 'FFFFFFFF',
    gridLine: 'FFE2E8F0',
    sectionHeader: 'FFE2E8F0',
    tableHeader: 'FFE0E7FF',
    rejectText: 'FFDC2626',
} as const;

export interface LogsSheetRow {
    'S.No': number | '';
    'Log Time': string;
    Action: string;
    'Job Tag': string;
    'Summary / Notes': string;
    'Job Type': string;
    'Device Name': string;
    'WO Name': string;
    'UID ID': number | '';
    'UID Name': string;
    Setting: string;
    'Part No': string;
    'Alloted Qty': number | '';
    'Start Comment': string;
    PCL: string;
}

export interface ExcelExportInput {
    rows: ReportRow[];
    stats: ReportStats;
    woDetailsMap: Map<number, WoDetails>;
    deviceNameMap: Map<number, string>;
    filename?: string;
    reportConfig?: Pick<ReportConfig, 'deviceId' | 'startDate' | 'endDate'>;
}

const LOG_SHEET_COLUMN_WIDTHS = [
    8,   // S.No
    22,  // Log Time
    16,  // Action
    14,  // Job Tag
    44,  // Summary / Notes
    14,  // Job Type
    18,  // Device Name
    14,  // WO Name
    10,  // UID ID
    18,  // UID Name
    18,  // Setting
    16,  // Part No
    12,  // Alloted Qty
    40,  // Start Comment
    10,  // PCL
] as const;

interface ExportRowVisual {
    fillColor: string;
    fontColor: string;
    bold?: boolean;
    italic?: boolean;
}

interface JobGroupMeta {
    groupKey: string | null;
    isInGroup: boolean;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
}

const LOG_COLUMN_INDEX = {
    serialNo: 1,
    logTime: 2,
    action: 3,
    jobTag: 4,
    summaryNotes: 5,
    jobType: 6,
    deviceName: 7,
    woName: 8,
    uidId: 9,
    uidName: 10,
    setting: 11,
    partNo: 12,
    allotedQty: 13,
    startComment: 14,
    pcl: 15,
} as const;

type ExcelJSImport = typeof import('exceljs');
type WorkbookCtor = new () => Workbook;

let excelJsModulePromise: Promise<ExcelJSImport> | null = null;
let excelJsMinModulePromise: Promise<unknown> | null = null;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOptimizeDepError(error: unknown): boolean {
    const text = error instanceof Error ? error.message : String(error);
    const lower = text.toLowerCase();
    return lower.includes('outdated optimize dep') || lower.includes('failed to fetch dynamically imported module');
}

async function loadExcelJsModule(): Promise<ExcelJSImport> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            return await import('exceljs');
        } catch (error) {
            lastError = error;
            try {
                return await import('exceljs/dist/exceljs.min.js') as unknown as ExcelJSImport;
            } catch (fallbackError) {
                lastError = fallbackError;
            }
            if (attempt < 2) {
                await delay(250);
            }
        }
    }

    if (isOptimizeDepError(lastError)) {
        throw new Error('Excel exporter dependency cache is stale. Restart Vite (`npm run dev -- --force`) and retry export.');
    }

    throw new Error('Unable to load Excel export dependency.');
}

async function getExcelJsModule(): Promise<ExcelJSImport> {
    if (!excelJsModulePromise) {
        excelJsModulePromise = loadExcelJsModule().catch((error) => {
            excelJsModulePromise = null;
            throw error;
        });
    }

    return excelJsModulePromise;
}

async function getExcelJsMinModule(): Promise<unknown> {
    if (!excelJsMinModulePromise) {
        excelJsMinModulePromise = import('exceljs/dist/exceljs.min.js').catch((error) => {
            excelJsMinModulePromise = null;
            throw error;
        });
    }
    return excelJsMinModulePromise;
}

function isWorkbookInstance(value: unknown): value is Workbook {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { addWorksheet?: unknown; getWorksheet?: unknown };
    return typeof candidate.addWorksheet === 'function'
        && typeof candidate.getWorksheet === 'function';
}

function asWorkbookCtor(value: unknown): WorkbookCtor | null {
    if (typeof value !== 'function') return null;
    try {
        const instance = new (value as new () => unknown)();
        if (isWorkbookInstance(instance)) {
            return value as WorkbookCtor;
        }
    } catch {
        return null;
    }
    return null;
}

function getGlobalExcelJs(): unknown {
    return (globalThis as unknown as { ExcelJS?: unknown }).ExcelJS;
}

function describeExcelModuleShape(moduleLike: unknown): string {
    try {
        if (!moduleLike || (typeof moduleLike !== 'object' && typeof moduleLike !== 'function')) {
            return `shape:${typeof moduleLike}`;
        }
        const keys = Object.keys(moduleLike as Record<string, unknown>).slice(0, 20);
        return `keys:${keys.join(',')}`;
    } catch {
        return 'shape:uninspectable';
    }
}

function findWorkbookCtorDeep(root: unknown): WorkbookCtor | null {
    const visited = new Set<unknown>();
    const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
    const maxDepth = 5;
    const maxNodes = 250;
    let seenNodes = 0;

    while (queue.length > 0 && seenNodes < maxNodes) {
        const current = queue.shift();
        if (!current) break;
        seenNodes += 1;

        const { value, depth } = current;
        const directCtor = asWorkbookCtor(value);
        if (directCtor) {
            return directCtor;
        }

        if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
            continue;
        }

        if (visited.has(value)) {
            continue;
        }
        visited.add(value);

        if (depth >= maxDepth) {
            continue;
        }

        let keys: string[] = [];
        try {
            keys = Object.keys(value as Record<string, unknown>);
        } catch {
            continue;
        }

        for (const key of keys) {
            let next: unknown;
            try {
                next = (value as Record<string, unknown>)[key];
            } catch {
                continue;
            }
            if (key === 'Workbook') {
                const workbookCtor = asWorkbookCtor(next);
                if (workbookCtor) {
                    return workbookCtor;
                }
            }
            queue.push({ value: next, depth: depth + 1 });
        }
    }

    return null;
}

function resolveWorkbookCtor(excelJs: ExcelJSImport): WorkbookCtor {
    const fromNamed = asWorkbookCtor((excelJs as unknown as { Workbook?: unknown }).Workbook);
    if (fromNamed) {
        return fromNamed;
    }

    const fromDefault = asWorkbookCtor((excelJs as unknown as { default?: { Workbook?: unknown } }).default?.Workbook);
    if (fromDefault) {
        return fromDefault;
    }

    const fromModuleExports = asWorkbookCtor((excelJs as unknown as { 'module.exports'?: { Workbook?: unknown } })['module.exports']?.Workbook);
    if (fromModuleExports) {
        return fromModuleExports;
    }

    const fromGlobal = asWorkbookCtor((getGlobalExcelJs() as { Workbook?: unknown } | undefined)?.Workbook);
    if (fromGlobal) {
        return fromGlobal;
    }

    const deepResolved = findWorkbookCtorDeep(excelJs);
    if (deepResolved) {
        return deepResolved;
    }

    const globalShape = describeExcelModuleShape(getGlobalExcelJs());
    const moduleShape = describeExcelModuleShape(excelJs);
    throw new Error(`Unable to resolve ExcelJS Workbook constructor. module(${moduleShape}) global(${globalShape})`);
}

async function getWorkbookCtor(): Promise<WorkbookCtor> {
    await getExcelJsMinModule().catch(() => {
        // continue with other module paths if min bundle import fails
    });

    try {
        const globalCtor = asWorkbookCtor((getGlobalExcelJs() as { Workbook?: unknown } | undefined)?.Workbook);
        if (globalCtor) {
            return globalCtor;
        }

        const excelJs = await getExcelJsModule();
        return resolveWorkbookCtor(excelJs);
    } catch (primaryError) {
        try {
            const fallbackModule = await import('exceljs/dist/exceljs.min.js') as unknown as ExcelJSImport;
            return resolveWorkbookCtor(fallbackModule);
        } catch {
            throw primaryError;
        }
    }
}

function toInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
    }
    return null;
}

function toStringValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function formatLogDateTime(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}:${sec}`;
}

function resolveWoDetails(row: ReportRow, woDetailsMap: Map<number, WoDetails>): WoDetails | undefined {
    const candidates: Array<number | null> = [
        toInt(row.originalLog?.wo_id),
        toInt(row.woHeaderData?.woIdStr),
        toInt(row.woSummaryData?.woIdStr),
        toInt(row.woSpecs?.woId),
    ];

    for (const woId of candidates) {
        if (typeof woId === 'number') {
            const details = woDetailsMap.get(woId);
            if (details) {
                return details;
            }
        }
    }

    const woNameCandidates = [
        toStringValue(row.originalLog?.wo_name),
        row.woHeaderData?.woIdStr || '',
        row.woSummaryData?.woIdStr || '',
        row.woSpecs?.woId || '',
    ].filter((value) => value !== '');

    if (woNameCandidates.length > 0) {
        for (const details of woDetailsMap.values()) {
            if (woNameCandidates.includes(details.wo_id_str)) {
                return details;
            }
        }
    }

    return undefined;
}

function resolveExportAction(row: ReportRow): string {
    if (typeof row.action === 'string' && row.action.trim()) {
        return row.action;
    }
    if (row.isWoHeader) return 'WO_HEADER';
    if (row.isWoSummary) return 'WO_SUMMARY';
    if (row.isPauseBanner) return 'PAUSE_BANNER';
    return '';
}

function isLoadingSeparatorLabel(label: string | undefined): boolean {
    if (!label) return false;
    return label.trim().toLowerCase() === 'loading /unloading time';
}

function isJobGroupRow(row: ReportRow): boolean {
    if (!row.jobBlockLabel) return false;
    if (row.isWoHeader || row.isWoSummary || row.isPauseBanner) return false;
    if (row.isComputed) {
        return isLoadingSeparatorLabel(row.label);
    }
    return true;
}

function buildJobGroupMeta(rows: ReportRow[]): JobGroupMeta[] {
    const groupKeys = rows.map((row) => (isJobGroupRow(row) ? row.jobBlockLabel || null : null));

    return rows.map((_, index) => {
        const key = groupKeys[index];
        if (!key) {
            return {
                groupKey: null,
                isInGroup: false,
                isFirstInGroup: false,
                isLastInGroup: false,
            };
        }

        const prevKey = index > 0 ? groupKeys[index - 1] : null;
        const nextKey = index < rows.length - 1 ? groupKeys[index + 1] : null;

        return {
            groupKey: key,
            isInGroup: true,
            isFirstInGroup: prevKey !== key,
            isLastInGroup: nextKey !== key,
        };
    });
}

function resolveJobTag(row: ReportRow): string {
    if (!isJobGroupRow(row)) return '';
    if (row.isComputed && isLoadingSeparatorLabel(row.label)) return '';
    return row.jobBlockLabel || '';
}

function resolveDeviceId(row: ReportRow, woDetails?: WoDetails): number | null {
    const candidates: Array<number | null> = [
        toInt(row.originalLog?.device_id),
        toInt(row.woHeaderData?.deviceId),
        toInt(row.woSummaryData?.deviceId),
        toInt(woDetails?.device_id),
    ];

    for (const id of candidates) {
        if (typeof id === 'number') {
            return id;
        }
    }

    return null;
}

function resolveDeviceName(row: ReportRow, woDetails: WoDetails | undefined, deviceNameMap: Map<number, string>): string {
    const deviceId = resolveDeviceId(row, woDetails);
    if (deviceId === null) return '';
    return deviceNameMap.get(deviceId) || `Device ${deviceId}`;
}

function resolveWoName(row: ReportRow, woDetails?: WoDetails): string {
    return toStringValue(row.originalLog?.wo_name) || woDetails?.wo_id_str || row.woSpecs?.woId || '';
}

function resolveUidId(row: ReportRow, woDetails?: WoDetails): number | null {
    const candidates: Array<number | null> = [
        toInt(row.originalLog?.uid),
        toInt(woDetails?.start_uid),
    ];

    for (const uid of candidates) {
        if (typeof uid === 'number') {
            return uid;
        }
    }

    return null;
}

function resolveUidName(row: ReportRow, uidId: number | null, woDetails?: WoDetails): string {
    if (uidId !== null && woDetails) {
        if (typeof woDetails.start_uid === 'number' && uidId === woDetails.start_uid && woDetails.start_name) {
            return woDetails.start_name;
        }
        if (typeof woDetails.stop_uid === 'number' && uidId === woDetails.stop_uid && woDetails.stop_name) {
            return woDetails.stop_name;
        }
    }

    return toStringValue(row.originalLog?.start_name) || row.operatorName || '';
}

function resolveSetting(row: ReportRow, woDetails?: WoDetails): string {
    return toStringValue(row.originalLog?.setting) || woDetails?.setting || '';
}

function resolvePartNo(row: ReportRow, woDetails?: WoDetails): string {
    return toStringValue(row.originalLog?.part_no) || woDetails?.part_no || '';
}

function resolveAllotedQty(row: ReportRow, woDetails?: WoDetails): number | '' {
    const fromLog = toInt(row.originalLog?.alloted_qty);
    if (fromLog !== null) return fromLog;

    const fromWo = toInt(woDetails?.alloted_qty);
    if (fromWo !== null) return fromWo;

    const fromSpecs = toInt(row.woSpecs?.allotted);
    return fromSpecs !== null ? fromSpecs : '';
}

function resolveStartComment(row: ReportRow, woDetails?: WoDetails): string {
    return toStringValue(row.originalLog?.start_comment)
        || woDetails?.start_comment
        || row.woHeaderData?.startComment
        || '';
}

function resolvePcl(row: ReportRow, woDetails?: WoDetails): string {
    const raw = row.originalLog?.pcl;
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        return String(raw);
    }
    if (woDetails?.pcl !== null && woDetails?.pcl !== undefined) {
        return String(woDetails.pcl);
    }
    return '';
}

function formatSummaryDateTime(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}, ${hh}:${min}:${sec}`;
}

function quoteOrDash(value: string): string {
    return value ? `"${value}"` : '"—"';
}

function resolvePclTextForSummary(row: ReportRow, woDetails?: WoDetails): string {
    if (row.woSpecs?.pclText) return row.woSpecs.pclText;
    if (woDetails?.pcl !== null && woDetails?.pcl !== undefined) return formatDuration(woDetails.pcl);
    return '—';
}

function resolveSummaryNotes(row: ReportRow, woDetails?: WoDetails): string {
    const action = resolveExportAction(row);
    const pclText = resolvePclTextForSummary(row, woDetails);
    const lines: string[] = [];

    if (row.isWoSummary && row.woSummaryData) {
        const summary = row.woSummaryData;
        const pauseReasonsText = summary.pauseReasons.length > 0 ? summary.pauseReasons.join(', ') : '—';
        lines.push('1) WO INFO');
        lines.push(`Part: ${summary.partNo}`);
        lines.push(`Operator: ${summary.operatorName}`);
        lines.push(`Device: ${summary.deviceId}`);
        lines.push(`Setting: ${summary.setting}`);
        lines.push(`WO: ${summary.woIdStr}`);
        lines.push(`PCL: ${pclText}`);
        lines.push('');
        lines.push('2) TIME / KPI');
        lines.push(`Start: ${summary.startTime || '—'}`);
        lines.push(`End: ${summary.endTime || '—'}`);
        lines.push(`Duration: ${summary.totalDuration}`);
        lines.push(`Jobs: ${summary.totalJobs} | Cycles: ${summary.totalCycles}`);
        lines.push(`Cutting: ${summary.totalCuttingTime}`);
        lines.push(`Pause: ${summary.totalPauseTime}`);
        lines.push('');
        lines.push('3) OUTPUT + COMMENTS');
        lines.push(`Allot: ${summary.allotedQty} | OK: ${summary.okQty} | Reject: ${summary.rejectQty}`);
        lines.push(`Start Comment: ${quoteOrDash(summary.startComment || '')}`);
        lines.push(`Stop Comment: ${quoteOrDash(summary.stopComment || '')}`);
        lines.push(`Pause Reasons: ${pauseReasonsText}`);
        return lines.join('\n');
    }

    if (row.isPauseBanner && row.pauseBannerData) {
        lines.push(`Pause: ${row.pauseBannerData.durationText || '—'}`);
        lines.push(`Reason: ${row.pauseBannerData.reason || 'Paused'}`);
        return lines.join('\n');
    }

    if (isLoadingSeparatorLabel(row.label)) {
        lines.push(`Gap Time: ${row.durationText || row.summary || '—'}`);
        lines.push('Type: Loading/Unloading');
        return lines.join('\n');
    }

    switch (action) {
        case 'SPINDLE_OFF': {
            lines.push(`Actual Cycle: ${row.durationText || '—'}`);
            lines.push(`Target PCL: ${pclText}`);
            return lines.join('\n');
        }
        case 'SPINDLE_ON': {
            lines.push(`Variance: ${row.summary || '—'}`);
            lines.push(`Ref PCL: ${pclText}`);
            return lines.join('\n');
        }
        case 'WO_START': {
            const startComment = row.startRowData?.comment
                || toStringValue(row.originalLog?.start_comment)
                || woDetails?.start_comment
                || '';
            lines.push(`Start: ${formatSummaryDateTime(row.logTime)}`);
            lines.push(`Comment: ${quoteOrDash(startComment)}`);
            return lines.join('\n');
        }
        case 'WO_PAUSE': {
            const pauseReason = toStringValue(row.originalLog?.stop_comment)
                || toStringValue(row.originalLog?.start_comment)
                || 'Paused';
            lines.push(`Pause: ${row.durationText || '—'}`);
            lines.push(`Reason: ${pauseReason}`);
            return lines.join('\n');
        }
        case 'WO_RESUME': {
            const resumeNote = row.summary
                || toStringValue(row.originalLog?.stop_comment)
                || toStringValue(row.originalLog?.start_comment)
                || '—';
            lines.push(`Resume After: ${row.durationText || '—'}`);
            lines.push(`Note: ${resumeNote}`);
            return lines.join('\n');
        }
        case 'WO_STOP': {
            const stopReason = row.stopRowData?.reason
                || toStringValue(row.originalLog?.stop_comment)
                || woDetails?.stop_comment
                || '—';
            lines.push(`Stop: ${formatSummaryDateTime(row.logTime)}`);
            lines.push(`Reason: ${stopReason}`);
            return lines.join('\n');
        }
        default: {
            if (row.summary) {
                lines.push(row.summary);
            }
            if (row.durationText) {
                lines.push(`Duration: ${row.durationText}`);
            }
            return lines.join('\n');
        }
    }
}

export function mapReportRowToLogsSheetRow(
    row: ReportRow,
    woDetailsMap: Map<number, WoDetails>,
    deviceNameMap: Map<number, string>
): LogsSheetRow {
    const woDetails = resolveWoDetails(row, woDetailsMap);
    const uidId = resolveUidId(row, woDetails);
    const isWoSummaryRow = !!row.isWoSummary;

    return {
        'S.No': row.sNo ?? '',
        'Log Time': formatLogDateTime(row.logTime),
        Action: resolveExportAction(row),
        'Job Tag': resolveJobTag(row),
        'Summary / Notes': resolveSummaryNotes(row, woDetails),
        'Job Type': isWoSummaryRow ? '' : row.jobType || '',
        'Device Name': isWoSummaryRow ? '' : resolveDeviceName(row, woDetails, deviceNameMap),
        'WO Name': isWoSummaryRow ? '' : resolveWoName(row, woDetails),
        'UID ID': isWoSummaryRow ? '' : uidId ?? '',
        'UID Name': isWoSummaryRow ? '' : resolveUidName(row, uidId, woDetails),
        Setting: isWoSummaryRow ? '' : resolveSetting(row, woDetails),
        'Part No': isWoSummaryRow ? '' : resolvePartNo(row, woDetails),
        'Alloted Qty': isWoSummaryRow ? '' : resolveAllotedQty(row, woDetails),
        'Start Comment': isWoSummaryRow ? '' : resolveStartComment(row, woDetails),
        PCL: isWoSummaryRow ? '' : resolvePcl(row, woDetails),
    };
}

export function buildLogsSheetRows(
    rows: ReportRow[],
    woDetailsMap: Map<number, WoDetails>,
    deviceNameMap: Map<number, string>
): LogsSheetRow[] {
    return rows.map((row) => mapReportRowToLogsSheetRow(row, woDetailsMap, deviceNameMap));
}

function resolveRowVisual(row: ReportRow, groupMeta: JobGroupMeta): ExportRowVisual {
    if (row.isWoHeader) {
        return {
            fillColor: LOG_STYLE_COLORS.woHeaderBg,
            fontColor: LOG_STYLE_COLORS.whiteText,
            bold: true,
        };
    }

    if (row.isWoSummary) {
        return {
            fillColor: LOG_STYLE_COLORS.woSummaryBg,
            fontColor: LOG_STYLE_COLORS.whiteText,
        };
    }

    if (row.isPauseBanner) {
        return {
            fillColor: row.pauseBannerData?.isShiftBreak ? LOG_STYLE_COLORS.pauseShiftBg : LOG_STYLE_COLORS.pauseBg,
            fontColor: LOG_STYLE_COLORS.darkText,
            bold: true,
        };
    }

    if (groupMeta.isInGroup) {
        return {
            fillColor: LOG_STYLE_COLORS.jobBlockBg,
            fontColor: LOG_STYLE_COLORS.darkText,
        };
    }

    if (row.action === 'WO_START' || row.action === 'WO_STOP') {
        return {
            fillColor: LOG_STYLE_COLORS.woActionBg,
            fontColor: LOG_STYLE_COLORS.darkText,
            bold: true,
        };
    }

    if (row.action === 'WO_PAUSE' || row.action === 'WO_RESUME') {
        return {
            fillColor: LOG_STYLE_COLORS.pauseActionBg,
            fontColor: LOG_STYLE_COLORS.darkText,
        };
    }

    if (row.isComputed) {
        return {
            fillColor: LOG_STYLE_COLORS.computedBg,
            fontColor: LOG_STYLE_COLORS.mutedText,
            italic: true,
        };
    }

    if (row.jobType === 'Unknown') {
        return {
            fillColor: LOG_STYLE_COLORS.unknownBg,
            fontColor: LOG_STYLE_COLORS.darkText,
        };
    }

    return {
        fillColor: LOG_STYLE_COLORS.defaultBg,
        fontColor: LOG_STYLE_COLORS.darkText,
    };
}

function toExcelColumnName(columnNumber: number): string {
    let dividend = columnNumber;
    let columnName = '';

    while (dividend > 0) {
        const modulo = (dividend - 1) % 26;
        columnName = String.fromCharCode(65 + modulo) + columnName;
        dividend = Math.floor((dividend - modulo) / 26);
    }

    return columnName;
}

function applyDataRowStyle(row: Row, visual: ExportRowVisual, groupMeta: JobGroupMeta): void {
    for (let col = 1; col <= LOG_SHEET_HEADERS.length; col += 1) {
        const cell = row.getCell(col);
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: visual.fillColor },
        };

        const font: Partial<Font> = {
            color: { argb: visual.fontColor },
        };
        if (visual.bold) font.bold = true;
        if (visual.italic) font.italic = true;
        cell.font = font;

        const thinBorder = { style: 'thin' as const, color: { argb: LOG_STYLE_COLORS.gridLine } };
        const thickGroupBorder = { style: 'thick' as const, color: { argb: LOG_STYLE_COLORS.groupBorder } };
        const topBorder = groupMeta.isInGroup && groupMeta.isFirstInGroup ? thickGroupBorder : thinBorder;
        const leftBorder = groupMeta.isInGroup && col === LOG_COLUMN_INDEX.serialNo ? thickGroupBorder : thinBorder;
        const bottomBorder = groupMeta.isInGroup && groupMeta.isLastInGroup ? thickGroupBorder : thinBorder;

        cell.border = {
            top: topBorder,
            left: leftBorder,
            bottom: bottomBorder,
            right: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
        };

        const horizontal = col === LOG_COLUMN_INDEX.serialNo
            || col === LOG_COLUMN_INDEX.jobTag
            || col === LOG_COLUMN_INDEX.uidId
            ? 'center'
            : col === LOG_COLUMN_INDEX.allotedQty || col === LOG_COLUMN_INDEX.pcl
                ? 'right'
                : 'left';

        cell.alignment = {
            vertical: 'top',
            horizontal,
            wrapText: col === LOG_COLUMN_INDEX.summaryNotes || col === LOG_COLUMN_INDEX.startComment,
        };
    }

    if (groupMeta.isInGroup) {
        const jobTagCell = row.getCell(LOG_COLUMN_INDEX.jobTag);
        const jobTagText = String(jobTagCell.value ?? '').trim();
        if (jobTagText && groupMeta.isFirstInGroup) {
            jobTagCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: LOG_STYLE_COLORS.jobTagChipBg },
            };
            jobTagCell.font = {
                color: { argb: LOG_STYLE_COLORS.whiteText },
                bold: true,
            };
        } else if (jobTagText) {
            jobTagCell.font = {
                color: { argb: LOG_STYLE_COLORS.darkText },
                bold: true,
            };
        }
        jobTagCell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: false,
        };
    }
}

function addLogsSheet(workbook: Workbook, input: ExcelExportInput): void {
    const worksheet = workbook.addWorksheet('Logs');
    worksheet.columns = LOG_SHEET_HEADERS.map((header, index) => ({
        header,
        key: header,
        width: LOG_SHEET_COLUMN_WIDTHS[index] ?? 14,
    }));

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
        from: 'A1',
        to: `${toExcelColumnName(LOG_SHEET_HEADERS.length)}1`,
    };

    const headerRow = worksheet.getRow(1);
    for (let col = 1; col <= LOG_SHEET_HEADERS.length; col += 1) {
        const cell = headerRow.getCell(col);
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: LOG_STYLE_COLORS.headerBg },
        };
        cell.font = {
            color: { argb: LOG_STYLE_COLORS.headerText },
            bold: true,
        };
        cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
        };
        cell.border = {
            top: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            left: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            bottom: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            right: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
        };
    }
    headerRow.height = 24;

    const logRows = buildLogsSheetRows(input.rows, input.woDetailsMap, input.deviceNameMap);
    const groupMetaByIndex = buildJobGroupMeta(input.rows);

    input.rows.forEach((rawRow, index) => {
        const outputRow = logRows[index];
        if (!outputRow) {
            return;
        }
        const worksheetRow = worksheet.addRow(outputRow);
        const groupMeta = groupMetaByIndex[index] ?? {
            groupKey: null,
            isInGroup: false,
            isFirstInGroup: false,
            isLastInGroup: false,
        };
        applyDataRowStyle(worksheetRow, resolveRowVisual(rawRow, groupMeta), groupMeta);
        const notes = String(outputRow['Summary / Notes'] ?? '');
        const lineCount = notes ? notes.split('\n').length : 1;
        if (lineCount > 1) {
            worksheetRow.height = Math.max(22, lineCount * 13);
        }
    });
}

function styleSectionHeader(worksheet: Worksheet, rowNumber: number, title: string): void {
    worksheet.getCell(`A${rowNumber}`).value = title;
    worksheet.mergeCells(`A${rowNumber}:D${rowNumber}`);
    const cell = worksheet.getCell(`A${rowNumber}`);
    cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: LOG_STYLE_COLORS.sectionHeader },
    };
    cell.font = {
        bold: true,
        color: { argb: LOG_STYLE_COLORS.darkText },
    };
    cell.alignment = {
        horizontal: 'left',
        vertical: 'middle',
    };
}

function styleTableHeader(row: Row): void {
    row.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: LOG_STYLE_COLORS.tableHeader },
        };
        cell.font = { bold: true, color: { argb: LOG_STYLE_COLORS.darkText } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            left: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            bottom: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            right: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
        };
    });
}

function styleTableBodyRow(row: Row, rightAlignedColumns: number[]): void {
    row.eachCell((cell, colNumber) => {
        cell.border = {
            top: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            left: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            bottom: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            right: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
        };
        cell.alignment = {
            vertical: 'middle',
            horizontal: rightAlignedColumns.includes(colNumber) ? 'right' : 'left',
        };
    });
}

function resolveDevicesLabel(input: ExcelExportInput): string {
    if (typeof input.reportConfig?.deviceId === 'number') {
        const deviceName = input.deviceNameMap.get(input.reportConfig.deviceId);
        return deviceName
            ? `${deviceName} (${input.reportConfig.deviceId})`
            : `Device ${input.reportConfig.deviceId}`;
    }

    const deviceLabels = new Set<string>();
    for (const row of input.rows) {
        const woDetails = resolveWoDetails(row, input.woDetailsMap);
        const deviceName = resolveDeviceName(row, woDetails, input.deviceNameMap);
        if (deviceName) {
            deviceLabels.add(deviceName);
        }
    }

    return Array.from(deviceLabels).join(', ');
}

function addAnalysisSheet(workbook: Workbook, input: ExcelExportInput): void {
    const worksheet = workbook.addWorksheet('Analysis');
    worksheet.columns = [
        { width: 30 },
        { width: 30 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 14 },
        { width: 14 },
    ];

    worksheet.getCell('A1').value = 'Device Logs Analysis';
    worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: LOG_STYLE_COLORS.darkText } };

    worksheet.getCell('A3').value = 'Generated On';
    worksheet.getCell('B3').value = formatLogDateTime(new Date());
    worksheet.getCell('A4').value = 'Device(s)';
    worksheet.getCell('B4').value = resolveDevicesLabel(input);
    worksheet.getCell('A5').value = 'Date Range';
    const startText = input.reportConfig?.startDate || '';
    const endText = input.reportConfig?.endDate || '';
    worksheet.getCell('B5').value = startText && endText ? `${startText} to ${endText}` : '';

    ['A3', 'A4', 'A5'].forEach((address) => {
        worksheet.getCell(address).font = { bold: true };
    });

    let rowCursor = 7;
    styleSectionHeader(worksheet, rowCursor, 'KPI Summary');
    rowCursor += 1;

    const kpiRows: Array<[string, string | number]> = [
        ['Total Logs', input.stats.totalLogs],
        ['Total Jobs', input.stats.totalJobs],
        ['Total Cycles', input.stats.totalCycles],
        ['Cutting Time', formatDuration(input.stats.totalCuttingSec)],
        ['Pause Time', formatDuration(input.stats.totalPauseSec)],
        ['Loading/Unloading Time', formatDuration(input.stats.totalLoadingUnloadingSec)],
        ['Idle Time', formatDuration(input.stats.totalIdleSec)],
        ['WO Duration', formatDuration(input.stats.totalWoDurationSec)],
        ['Machine Utilization %', `${input.stats.machineUtilization}%`],
        ['Alloted Qty', input.stats.totalAllotedQty],
        ['OK Qty', input.stats.totalOkQty],
        ['Reject Qty', input.stats.totalRejectQty],
    ];

    for (const [label, value] of kpiRows) {
        const row = worksheet.getRow(rowCursor);
        row.getCell(1).value = label;
        row.getCell(2).value = value;
        row.getCell(1).font = { bold: true };
        styleTableBodyRow(row, [2]);
        if (label === 'Reject Qty' && typeof value === 'number' && value > 0) {
            row.getCell(2).font = { color: { argb: LOG_STYLE_COLORS.rejectText }, bold: true };
        }
        rowCursor += 1;
    }

    rowCursor += 1;
    styleSectionHeader(worksheet, rowCursor, 'WO Breakdown');
    rowCursor += 1;

    const woHeaders = [
        'WO ID',
        'Part No',
        'Operator',
        'Setting',
        'Jobs',
        'Cycles',
        'Cutting',
        'Pause',
        'Loading',
        'PCL',
        'Avg Cycle',
        'Allot',
        'OK',
        'Reject',
    ];

    const woHeaderRow = worksheet.getRow(rowCursor);
    woHeaderRow.values = woHeaders;
    styleTableHeader(woHeaderRow);
    rowCursor += 1;

    for (const wo of input.stats.woBreakdowns) {
        const row = worksheet.getRow(rowCursor);
        row.values = [
            wo.woId,
            wo.partNo,
            wo.operator,
            wo.setting,
            wo.jobs,
            wo.cycles,
            formatDuration(wo.cuttingSec),
            formatDuration(wo.pauseSec),
            formatDuration(wo.loadingSec),
            wo.pcl !== null ? String(wo.pcl) : '',
            formatDuration(wo.avgCycleSec),
            wo.allotedQty,
            wo.okQty,
            wo.rejectQty,
        ];
        styleTableBodyRow(row, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
        if (wo.rejectQty > 0) {
            row.getCell(14).font = { color: { argb: LOG_STYLE_COLORS.rejectText }, bold: true };
        }
        rowCursor += 1;
    }

    rowCursor += 1;
    styleSectionHeader(worksheet, rowCursor, 'Operator Summary');
    rowCursor += 1;

    const operatorHeaders = [
        'Operator',
        'WO Count',
        'Jobs',
        'Cycles',
        'Cutting',
        'Pause',
        'Avg Cycle',
    ];

    const operatorHeaderRow = worksheet.getRow(rowCursor);
    operatorHeaderRow.values = operatorHeaders;
    styleTableHeader(operatorHeaderRow);
    rowCursor += 1;

    for (const operator of input.stats.operatorSummaries) {
        const row = worksheet.getRow(rowCursor);
        row.values = [
            operator.name,
            operator.woCount,
            operator.totalJobs,
            operator.totalCycles,
            formatDuration(operator.totalCuttingSec),
            formatDuration(operator.totalPauseSec),
            formatDuration(operator.avgCycleSec),
        ];
        styleTableBodyRow(row, [2, 3, 4, 5, 6, 7]);
        rowCursor += 1;
    }
}

export async function buildExcelWorkbook(input: ExcelExportInput): Promise<Workbook> {
    const WorkbookClass = await getWorkbookCtor();
    const workbook = new WorkbookClass();
    workbook.created = new Date();
    workbook.modified = new Date();

    addLogsSheet(workbook, input);
    addAnalysisSheet(workbook, input);

    return workbook;
}

export async function exportToExcel(input: ExcelExportInput): Promise<void> {
    const filename = input.filename || 'device_report.xlsx';
    const workbook = await buildExcelWorkbook(input);
    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Existing PDF export kept unchanged.
 */
function preparePdfExportData(rows: ReportRow[]) {
    return rows.map(row => {
        let woSpecsStr = '';
        if (row.woSpecs) {
            woSpecsStr = `WO: ${row.woSpecs.woId}\nPCL: ${row.woSpecs.pclText}\nAllot: ${row.woSpecs.allotted}`;
        }

        let summaryText = row.summary || '';
        if (row.isWoHeader && row.woHeaderData) {
            summaryText = `🔧 WO #${row.woHeaderData.woIdStr} - Part: ${row.woHeaderData.partNo} - Op: ${row.woHeaderData.operatorName}`;
        } else if (row.isWoSummary && row.woSummaryData) {
            summaryText = `📊 WO #${row.woSummaryData.woIdStr} Summary - Jobs: ${row.woSummaryData.totalJobs}, Cycles: ${row.woSummaryData.totalCycles}`;
        } else if (row.isPauseBanner && row.pauseBannerData) {
            summaryText = `⚠️ ${row.pauseBannerData.isShiftBreak ? 'SHIFT BREAK' : 'PAUSE'}: ${row.pauseBannerData.reason} (${row.pauseBannerData.durationText})`;
        }

        return {
            'S.No': row.sNo || '',
            'Log ID': row.logId || '',
            'Log Time': row.logTime.toLocaleString('en-GB'),
            'Action': row.action || '',
            'Duration': row.durationText || '',
            'Label': row.jobBlockLabel || row.label || '',
            'Summary / Notes': summaryText,
            'WO Specs': woSpecsStr,
            'Job Type': row.jobType || '',
            'Operator': row.operatorName || ''
        };
    });
}

export function exportToPDF(rows: ReportRow[], filename: string = 'device_report.pdf') {
    const doc = new jsPDF('l', 'mm', 'a4');
    const data = preparePdfExportData(rows);
    const applyAutoTable = autoTable as unknown as (doc: jsPDF, options: Record<string, unknown>) => void;

    const headers = [['S.No', 'Log ID', 'Log Time', 'Action', 'Duration', 'Label', 'WO Specs', 'Summary / Notes', 'Job Type', 'Operator']];
    const body = data.map(item => [
        item['S.No'],
        item['Log ID'],
        item['Log Time'],
        item['Action'],
        item['Duration'],
        item['Label'],
        item['WO Specs'],
        item['Summary / Notes'],
        item['Job Type'],
        item['Operator']
    ]);

    doc.setFontSize(18);
    doc.text('Device Logs Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    applyAutoTable(doc, {
        head: headers,
        body,
        startY: 25,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillStyle: 'F', fillColor: [30, 41, 59] },
        columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 15 },
            2: { cellWidth: 35 },
            3: { cellWidth: 20 },
            4: { cellWidth: 20 },
            5: { cellWidth: 20 },
            6: { cellWidth: 30 },
            7: { cellWidth: 'auto' },
            8: { cellWidth: 20 },
            9: { cellWidth: 25 },
        },
    });

    doc.save(filename);
}
