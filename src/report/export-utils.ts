import type { Font, Row, Workbook, Worksheet } from 'exceljs';
import jsPDF from 'jspdf';
import { formatDuration } from './format-utils.js';
import { ReportConfig, ReportRow, ReportStats, WoDetails, WoSummaryData } from './report-types.js';

export const LOG_SHEET_HEADERS = [
    'S.No',
    'Log Time',
    'Action',
    'Job Tag',
    'Summary / Notes',
    'WO Core',
    'Setup / Device',
    'Job Type',
    'Operator',
] as const;

export const GROUPED_LOG_SHEET_HEADERS = [
    'S.No',
    'Log ID',
    'Log Time',
    'Action',
    'TIME',
    'PLC',
    'JOB',
    'OP',
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
    groupedYellow: 'FFFFFF00',
    groupedGreen: 'FF92D050',
    groupedBeige: 'FFE8D695',
    groupedOrange: 'FFF4B183',
    groupedOutline: 'FF22C55E',
    groupedSummaryBg: 'FF1E3A8A',
} as const;

export interface LogsSheetRow {
    'S.No': number | '';
    'Log Time': string;
    Action: string;
    'Job Tag': string;
    'Summary / Notes': string;
    'WO Core': string;
    'Setup / Device': string;
    'Job Type': string;
    Operator: string;
}

export interface GroupedLogsSheetRow {
    'S.No': number | '';
    'Log ID': number | '';
    'Log Time': string;
    Action: string;
    TIME: string;
    PLC: string;
    JOB: string;
    OP: string;
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
    38,  // Summary / Notes
    22,  // WO Core
    28,  // Setup / Device
    14,  // Job Type
    20,  // Operator
] as const;

const GROUPED_LOG_SHEET_COLUMN_WIDTHS = [
    8,   // S.No
    10,  // Log ID
    26,  // Log Time
    18,  // Action
    14,  // TIME
    14,  // PLC
    20,  // JOB
    18,  // OP
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
    woCore: 6,
    setupDevice: 7,
    jobType: 8,
    operator: 9,
} as const;

type ExcelJSImport = typeof import('exceljs');
type WorkbookCtor = new () => Workbook;

let excelJsModulePromise: Promise<ExcelJSImport> | null = null;
let excelJsMinModulePromise: Promise<unknown> | null = null;

type GroupedRowStyle = 'default' | 'yellowAction' | 'spindlePair' | 'keyPair' | 'pausePair' | 'summary';

interface GroupedExportRow {
    row: GroupedLogsSheetRow;
    style: GroupedRowStyle;
    pairId?: string;
    mergePlc?: boolean;
    mergeJob?: boolean;
    jobGroupKey?: string | null;
    isGroupFirst?: boolean;
    isGroupLast?: boolean;
    rowNumber?: number;
}

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

function buildWoSummarySectionTexts(summary: WoSummaryData, pclText: string): { left: string; center: string; right: string } {
    const pauseReasonsText = summary.pauseReasons.length > 0 ? summary.pauseReasons.join(', ') : '—';

    const left = [
        '1) WO INFO',
        `Part: ${summary.partNo}`,
        `Operator: ${summary.operatorName}`,
        `Device: ${summary.deviceId}`,
        `Setting: ${summary.setting}`,
        `WO: ${summary.woIdStr}`,
        `PCL: ${pclText}`,
    ].join('\n');

    const center = [
        '2) TIME / KPI',
        `Start: ${summary.startTime || '—'}`,
        `End: ${summary.endTime || '—'}`,
        `Duration: ${summary.totalDuration}`,
        `Jobs: ${summary.totalJobs} | Cycles: ${summary.totalCycles}`,
        `Cutting: ${summary.totalCuttingTime}`,
        `Pause: ${summary.totalPauseTime}`,
    ].join('\n');

    const right = [
        '3) OUTPUT + COMMENTS',
        `Allot: ${summary.allotedQty} | OK: ${summary.okQty} | Reject: ${summary.rejectQty}`,
        `Start Comment: ${quoteOrDash(summary.startComment || '')}`,
        `Stop Comment: ${quoteOrDash(summary.stopComment || '')}`,
        `Pause Reasons: ${pauseReasonsText}`,
    ].join('\n');

    return { left, center, right };
}

function resolveOperator(row: ReportRow, woDetails?: WoDetails): string {
    const uidId = resolveUidId(row, woDetails);
    return resolveUidName(row, uidId, woDetails)
        || row.operatorName
        || woDetails?.start_name
        || '';
}

function normalizePclForSpecs(rawPcl: string): string {
    const trimmed = rawPcl.trim();
    if (!trimmed) return '—';
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
        return formatDuration(numeric);
    }
    return trimmed;
}

function resolveWoCoreBlock(
    row: ReportRow,
    woDetails: WoDetails | undefined,
): string {
    const woText = resolveWoName(row, woDetails) || '—';
    const pclText = row.woSpecs?.pclText
        || (woDetails?.pcl !== null && woDetails?.pcl !== undefined ? formatDuration(woDetails.pcl) : normalizePclForSpecs(resolvePcl(row, woDetails)));
    const alloted = resolveAllotedQty(row, woDetails);
    const allotText = alloted === '' ? '—' : String(alloted);

    return [
        `WO: ${woText}`,
        `PCL: ${pclText || '—'}`,
        `Allot: ${allotText}`,
    ].join('\n');
}

function resolveSetupDeviceBlock(
    row: ReportRow,
    woDetails: WoDetails | undefined,
    deviceNameMap: Map<number, string>
): string {
    const partText = resolvePartNo(row, woDetails) || '—';
    const settingText = resolveSetting(row, woDetails) || '—';
    const deviceText = resolveDeviceName(row, woDetails, deviceNameMap) || '—';

    return [
        `Part: ${partText}`,
        `Setting: ${settingText}`,
        `Device: ${deviceText}`,
    ].join('\n');
}

function formatGroupedLogDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

function formatGroupedTime24(date: Date): string {
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    return `${hh}:${min}:${sec}`;
}

function formatGroupedTime12(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

function formatSecondsToClock(seconds: number | undefined): string {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
        return '';
    }

    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSecondsToVerbose(seconds: number | undefined): string {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
        return '';
    }
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}min ${secs} sec`;
    }
    return `${minutes}min ${secs} sec`;
}

function normalizeGroupedJobLabel(label: string): string {
    const trimmed = label.trim();
    const matched = trimmed.match(/^job\s*-\s*0*(\d+)$/i);
    if (matched) {
        return `JOB ${matched[1]}`;
    }
    return trimmed.toUpperCase();
}

function normalizeCommentValue(value: unknown): string {
    return String(value ?? '').trim();
}

function resolveGroupedPauseReason(
    row: ReportRow,
    woDetailsMap: Map<number, WoDetails>,
    bannerReason?: string,
): string {
    const woDetails = resolveWoDetails(row, woDetailsMap);
    return normalizeCommentValue(bannerReason)
        || normalizeCommentValue(row.summary)
        || normalizeCommentValue(toStringValue(row.originalLog?.stop_comment))
        || normalizeCommentValue(toStringValue(row.originalLog?.start_comment))
        || normalizeCommentValue(woDetails?.stop_comment)
        || normalizeCommentValue(woDetails?.start_comment);
}

function resolveGroupedResumeNote(row: ReportRow): string {
    return normalizeCommentValue(row.summary)
        || normalizeCommentValue(toStringValue(row.originalLog?.stop_comment))
        || normalizeCommentValue(toStringValue(row.originalLog?.start_comment));
}

function resolveGroupedWoActionComment(
    row: ReportRow,
    woDetailsMap: Map<number, WoDetails>,
): string {
    const woDetails = resolveWoDetails(row, woDetailsMap);
    const action = resolveExportAction(row);

    if (action === 'WO_START') {
        const comment = normalizeCommentValue(row.startRowData?.comment)
            || normalizeCommentValue(toStringValue(row.originalLog?.start_comment))
            || normalizeCommentValue(woDetails?.start_comment)
            || normalizeCommentValue(row.summary);
        return `Comment - ${comment || '—'}`;
    }

    if (action === 'WO_PAUSE') {
        const reason = resolveGroupedPauseReason(row, woDetailsMap);
        return `Reason - ${reason || '—'}`;
    }

    if (action === 'WO_RESUME') {
        const note = resolveGroupedResumeNote(row);
        return `Note - ${note || '—'}`;
    }

    if (action === 'WO_STOP') {
        const reason = normalizeCommentValue(row.stopRowData?.reason)
            || normalizeCommentValue(toStringValue(row.originalLog?.stop_comment))
            || normalizeCommentValue(woDetails?.stop_comment)
            || normalizeCommentValue(row.summary);
        return `Reason - ${reason || '—'}`;
    }

    return '';
}

function buildGroupedBaseRow(
    row: ReportRow,
    serialNo: number | '',
    woDetailsMap: Map<number, WoDetails>,
): GroupedLogsSheetRow {
    const woDetails = resolveWoDetails(row, woDetailsMap);
    const operator = resolveOperator(row, woDetails);
    return {
        'S.No': serialNo,
        'Log ID': typeof row.logId === 'number' ? row.logId : '',
        'Log Time': formatGroupedLogDateTime(row.logTime),
        Action: resolveExportAction(row) || row.label || '',
        TIME: formatGroupedTime24(row.logTime),
        PLC: formatSecondsToClock(row.durationSec),
        JOB: '',
        OP: operator,
    };
}

function buildGroupedExportRows(
    rows: ReportRow[],
    woDetailsMap: Map<number, WoDetails>,
): GroupedExportRow[] {
    const sortedRows = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    const exportRows: GroupedExportRow[] = [];
    let serialNo = 1;

    for (let index = 0; index < sortedRows.length; index += 1) {
        const row = sortedRows[index];
        if (!row || row.isWoHeader || row.isPauseBanner) {
            continue;
        }
        if (row.isComputed && !row.isWoSummary) {
            continue;
        }
        if (!row.isWoSummary && !row.action) {
            continue;
        }

        const isLogRow = typeof row.logId === 'number';
        const serial = isLogRow ? serialNo++ : '';

        if (row.isWoSummary && row.woSummaryData) {
            const summary = row.woSummaryData;
            exportRows.push({
                row: {
                    'S.No': '',
                    'Log ID': '',
                    'Log Time': formatGroupedLogDateTime(row.logTime),
                    Action: `WO #${summary.woIdStr} SUMMARY`,
                    TIME: `Dur ${summary.totalDuration}`,
                    PLC: `Cut ${summary.totalCuttingTime} | Pause ${summary.totalPauseTime}`,
                    JOB: `Jobs ${summary.totalJobs} | Cyc ${summary.totalCycles} | OK ${summary.okQty} | Rej ${summary.rejectQty}`,
                    OP: summary.operatorName,
                },
                style: 'summary',
            });
            continue;
        }

        if (row.action === 'WO_PAUSE') {
            let resumeIndex = -1;
            for (let cursor = index + 1; cursor < sortedRows.length; cursor += 1) {
                const candidate = sortedRows[cursor];
                if (!candidate || candidate.isWoHeader || candidate.isWoSummary || candidate.isPauseBanner) {
                    continue;
                }
                if (candidate.action === 'WO_RESUME') {
                    resumeIndex = cursor;
                    break;
                }
                if (candidate.action === 'WO_STOP' || candidate.action === 'WO_START') {
                    break;
                }
            }

            if (resumeIndex > -1) {
                const resumeRow = sortedRows[resumeIndex]!;
                const banner = index > 0 && sortedRows[index - 1]?.isPauseBanner
                    ? sortedRows[index - 1]?.pauseBannerData
                    : undefined;
                const hasReasonBlock = Boolean(banner?.reason);
                const pairId = `pause-${row.rowId}-${resumeRow.rowId}`;
                const pairStyle: GroupedRowStyle = hasReasonBlock ? 'pausePair' : 'keyPair';
                const pauseDuration = row.durationSec ?? resumeRow.durationSec;
                const timeFormatter = hasReasonBlock ? formatGroupedTime12 : formatGroupedTime24;
                const firstAction = hasReasonBlock ? 'Pause ON' : 'Key OFF';
                const secondAction = hasReasonBlock ? 'Pause off' : 'Key On';
                const plcValue = hasReasonBlock
                    ? formatSecondsToVerbose(pauseDuration)
                    : formatSecondsToClock(pauseDuration);
                const pauseReason = resolveGroupedPauseReason(row, woDetailsMap, banner?.reason);
                const resumeNote = resolveGroupedResumeNote(resumeRow);
                const commentLines: string[] = [];
                commentLines.push(`Reason - ${pauseReason || '—'}`);
                commentLines.push(`Note - ${resumeNote || '—'}`);
                const jobValue = commentLines.join('\n');

                const pauseBase = buildGroupedBaseRow(row, serial, woDetailsMap);
                pauseBase.Action = firstAction;
                pauseBase.TIME = timeFormatter(row.logTime);
                pauseBase.PLC = plcValue;
                pauseBase.JOB = jobValue;

                const resumeSerial = typeof resumeRow.logId === 'number' ? serialNo++ : '';
                const resumeBase = buildGroupedBaseRow(resumeRow, resumeSerial, woDetailsMap);
                resumeBase.Action = secondAction;
                resumeBase.TIME = timeFormatter(resumeRow.logTime);
                resumeBase.PLC = '';
                resumeBase.JOB = '';

                exportRows.push({
                    row: pauseBase,
                    style: pairStyle,
                    pairId,
                    mergePlc: true,
                    mergeJob: true,
                });
                exportRows.push({
                    row: resumeBase,
                    style: pairStyle,
                    pairId,
                });

                index = resumeIndex;
                continue;
            }
        }

        if (row.action === 'SPINDLE_ON') {
            let offIndex = -1;
            for (let cursor = index + 1; cursor < sortedRows.length; cursor += 1) {
                const candidate = sortedRows[cursor];
                if (!candidate || candidate.isWoHeader || candidate.isWoSummary || candidate.isPauseBanner) {
                    continue;
                }
                if (candidate.action === 'SPINDLE_OFF') {
                    offIndex = cursor;
                    break;
                }
                if (candidate.action === 'WO_STOP' || candidate.action === 'WO_START') {
                    break;
                }
            }

            if (offIndex > -1) {
                const offRow = sortedRows[offIndex]!;
                const pairId = `spindle-${row.rowId}-${offRow.rowId}`;
                const groupKey = row.jobBlockLabel || offRow.jobBlockLabel || null;

                const onBase = buildGroupedBaseRow(row, serial, woDetailsMap);
                onBase.Action = 'SPINDLE_ON';
                onBase.TIME = formatGroupedTime24(row.logTime);
                onBase.PLC = formatSecondsToClock(offRow.durationSec);
                onBase.JOB = '';

                const offSerial = typeof offRow.logId === 'number' ? serialNo++ : '';
                const offBase = buildGroupedBaseRow(offRow, offSerial, woDetailsMap);
                offBase.Action = 'SPINDLE_OFF';
                offBase.TIME = formatGroupedTime24(offRow.logTime);
                offBase.PLC = '';
                offBase.JOB = '';

                exportRows.push({
                    row: onBase,
                    style: 'spindlePair',
                    pairId,
                    mergePlc: true,
                    mergeJob: true,
                    jobGroupKey: groupKey,
                });
                exportRows.push({
                    row: offBase,
                    style: 'spindlePair',
                    pairId,
                    jobGroupKey: groupKey,
                });

                index = offIndex;
                continue;
            }
        }

        const base = buildGroupedBaseRow(row, serial, woDetailsMap);
        const action = resolveExportAction(row);
        const style: GroupedRowStyle = action === 'WO_START'
            || action === 'WO_STOP'
            || action === 'WO_PAUSE'
            || action === 'WO_RESUME'
            ? 'yellowAction'
            : 'default';
        base.JOB = resolveGroupedWoActionComment(row, woDetailsMap);

        exportRows.push({
            row: base,
            style,
            jobGroupKey: row.jobBlockLabel || null,
        });
    }

    for (let index = 0; index < exportRows.length; index += 1) {
        const groupKey = exportRows[index]?.jobGroupKey?.trim();
        if (!groupKey) continue;

        let end = index;
        while (
            end + 1 < exportRows.length
            && exportRows[end + 1]?.jobGroupKey?.trim() === groupKey
        ) {
            end += 1;
        }

        exportRows[index]!.isGroupFirst = true;
        exportRows[end]!.isGroupLast = true;

        const normalizedJobLabel = normalizeGroupedJobLabel(groupKey);
        let labelIndex = -1;
        for (let cursor = index; cursor <= end; cursor += 1) {
            if (!String(exportRows[cursor]?.row.JOB ?? '').trim()) {
                labelIndex = cursor;
                break;
            }
        }
        if (labelIndex >= 0) {
            exportRows[labelIndex]!.row.JOB = normalizedJobLabel;
        }
        for (let cursor = index; cursor <= end; cursor += 1) {
            if (cursor !== labelIndex && exportRows[cursor]?.row.JOB === normalizedJobLabel) {
                exportRows[cursor]!.row.JOB = '';
            }
        }

        index = end;
    }

    return exportRows;
}

function applyGroupedHeaderStyle(row: Row): void {
    row.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: LOG_STYLE_COLORS.headerBg },
        };
        cell.font = {
            color: { argb: LOG_STYLE_COLORS.headerText },
            bold: true,
            size: 12,
        };
        cell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
        };
        cell.border = {
            top: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            left: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            bottom: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
            right: { style: 'thin', color: { argb: LOG_STYLE_COLORS.gridLine } },
        };
    });
}

function applyGroupedDataRowStyle(row: Row, exportRow: GroupedExportRow): void {
    for (let col = 1; col <= GROUPED_LOG_SHEET_HEADERS.length; col += 1) {
        const cell = row.getCell(col);
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: LOG_STYLE_COLORS.defaultBg },
        };
        cell.font = {
            color: { argb: LOG_STYLE_COLORS.darkText },
        };
        cell.alignment = {
            vertical: 'middle',
            horizontal: col === 3 || col === 8 ? 'left' : 'center',
            wrapText: col === 7,
        };

        const thinBorder = { style: 'thin' as const, color: { argb: LOG_STYLE_COLORS.gridLine } };
        const thickBorder = { style: 'thick' as const, color: { argb: LOG_STYLE_COLORS.groupedOutline } };
        cell.border = {
            top: exportRow.jobGroupKey && exportRow.isGroupFirst ? thickBorder : thinBorder,
            bottom: exportRow.jobGroupKey && exportRow.isGroupLast ? thickBorder : thinBorder,
            left: exportRow.jobGroupKey && col === 1 ? thickBorder : thinBorder,
            right: exportRow.jobGroupKey && col === GROUPED_LOG_SHEET_HEADERS.length ? thickBorder : thinBorder,
        };
    }

    if (exportRow.style === 'yellowAction') {
        const actionCell = row.getCell(4);
        actionCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: LOG_STYLE_COLORS.groupedYellow },
        };
        actionCell.font = { color: { argb: LOG_STYLE_COLORS.darkText }, bold: true };
    }

    if (exportRow.style === 'spindlePair') {
        for (const col of [4, 5, 6]) {
            const cell = row.getCell(col);
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: LOG_STYLE_COLORS.groupedGreen },
            };
        }
        row.getCell(4).font = { color: { argb: LOG_STYLE_COLORS.darkText }, bold: true };
    }

    if (exportRow.style === 'keyPair') {
        for (const col of [4, 5, 6, 7]) {
            const cell = row.getCell(col);
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: LOG_STYLE_COLORS.groupedBeige },
            };
        }
    }

    if (exportRow.style === 'pausePair') {
        for (const col of [4, 5, 6, 7]) {
            const cell = row.getCell(col);
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: LOG_STYLE_COLORS.groupedOrange },
            };
        }
    }

    if (exportRow.style === 'summary') {
        for (let col = 1; col <= GROUPED_LOG_SHEET_HEADERS.length; col += 1) {
            const cell = row.getCell(col);
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: LOG_STYLE_COLORS.groupedSummaryBg },
            };
            cell.font = {
                color: { argb: LOG_STYLE_COLORS.whiteText },
                bold: true,
            };
            cell.alignment = {
                vertical: 'middle',
                horizontal: col === 3 || col === 8 ? 'left' : 'center',
                wrapText: true,
            };
        }
        row.height = 24;
    }
}

function applyGroupedPairMerges(worksheet: Worksheet, rows: GroupedExportRow[]): void {
    for (let index = 0; index < rows.length - 1; index += 1) {
        const current = rows[index];
        const next = rows[index + 1];
        if (!current || !next || !current.pairId || current.pairId !== next.pairId) {
            continue;
        }
        if (!current.rowNumber || !next.rowNumber) {
            continue;
        }

        if (current.mergePlc && current.row.PLC) {
            worksheet.mergeCells(`F${current.rowNumber}:F${next.rowNumber}`);
            worksheet.getCell(`F${current.rowNumber}`).alignment = {
                vertical: 'middle',
                horizontal: 'center',
                wrapText: true,
            };
        }

        if (current.mergeJob && current.row.JOB) {
            worksheet.mergeCells(`G${current.rowNumber}:G${next.rowNumber}`);
            worksheet.getCell(`G${current.rowNumber}`).alignment = {
                vertical: 'middle',
                horizontal: 'center',
                wrapText: true,
            };
        }
    }
}

function addGroupedLogsSheet(workbook: Workbook, input: ExcelExportInput): void {
    const worksheet = workbook.addWorksheet('Logs Grouped');
    worksheet.columns = GROUPED_LOG_SHEET_HEADERS.map((header, index) => ({
        header,
        key: header,
        width: GROUPED_LOG_SHEET_COLUMN_WIDTHS[index] ?? 14,
    }));

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
        from: 'A1',
        to: `${toExcelColumnName(GROUPED_LOG_SHEET_HEADERS.length)}1`,
    };

    const headerRow = worksheet.getRow(1);
    applyGroupedHeaderStyle(headerRow);
    headerRow.height = 26;

    const groupedRows = buildGroupedExportRows(input.rows, input.woDetailsMap);
    for (const exportRow of groupedRows) {
        const worksheetRow = worksheet.addRow(exportRow.row);
        exportRow.rowNumber = worksheetRow.number;
        applyGroupedDataRowStyle(worksheetRow, exportRow);
    }

    applyGroupedPairMerges(worksheet, groupedRows);
}

export function mapReportRowToLogsSheetRow(
    row: ReportRow,
    woDetailsMap: Map<number, WoDetails>,
    deviceNameMap: Map<number, string>
): LogsSheetRow {
    const woDetails = resolveWoDetails(row, woDetailsMap);
    const isWoSummaryRow = !!row.isWoSummary;

    return {
        'S.No': row.sNo ?? '',
        'Log Time': formatLogDateTime(row.logTime),
        Action: resolveExportAction(row),
        'Job Tag': resolveJobTag(row),
        'Summary / Notes': resolveSummaryNotes(row, woDetails),
        'WO Core': isWoSummaryRow ? '' : resolveWoCoreBlock(row, woDetails),
        'Setup / Device': isWoSummaryRow ? '' : resolveSetupDeviceBlock(row, woDetails, deviceNameMap),
        'Job Type': isWoSummaryRow ? '' : row.jobType || '',
        Operator: isWoSummaryRow ? '' : resolveOperator(row, woDetails),
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
            || col === LOG_COLUMN_INDEX.jobType
            ? 'center'
            : 'left';

        cell.alignment = {
            vertical: 'top',
            horizontal,
            wrapText: col === LOG_COLUMN_INDEX.summaryNotes
                || col === LOG_COLUMN_INDEX.woCore
                || col === LOG_COLUMN_INDEX.setupDevice,
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

function createBlankLogsRow(): Record<(typeof LOG_SHEET_HEADERS)[number], string> {
    return LOG_SHEET_HEADERS.reduce((acc, header) => {
        acc[header] = '';
        return acc;
    }, {} as Record<(typeof LOG_SHEET_HEADERS)[number], string>);
}

function applyWoSummaryMergedRow(
    worksheet: Worksheet,
    rowNumber: number,
    summary: WoSummaryData,
    pclText: string,
): void {
    const sectionRanges: Array<{ start: number; end: number; text: string }> = [];
    const colCount = LOG_SHEET_HEADERS.length;
    const leftEnd = Math.max(1, Math.floor(colCount / 3));
    const centerEnd = Math.max(leftEnd + 1, Math.floor((colCount * 2) / 3));

    const sections = buildWoSummarySectionTexts(summary, pclText);
    sectionRanges.push({ start: 1, end: leftEnd, text: sections.left });
    sectionRanges.push({ start: leftEnd + 1, end: centerEnd, text: sections.center });
    sectionRanges.push({ start: centerEnd + 1, end: colCount, text: sections.right });

    for (const section of sectionRanges) {
        if (section.start > section.end) continue;
        const startRef = `${toExcelColumnName(section.start)}${rowNumber}`;
        const endRef = `${toExcelColumnName(section.end)}${rowNumber}`;
        worksheet.mergeCells(`${startRef}:${endRef}`);

        const cell = worksheet.getCell(startRef);
        cell.value = section.text;
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: LOG_STYLE_COLORS.woSummaryBg },
        };
        cell.font = {
            color: { argb: LOG_STYLE_COLORS.whiteText },
            bold: false,
            size: 11,
        };
        cell.alignment = {
            vertical: 'top',
            horizontal: 'left',
            wrapText: true,
        };
        cell.border = {
            top: { style: 'medium', color: { argb: LOG_STYLE_COLORS.gridLine } },
            left: { style: 'medium', color: { argb: LOG_STYLE_COLORS.gridLine } },
            bottom: { style: 'medium', color: { argb: LOG_STYLE_COLORS.gridLine } },
            right: { style: 'medium', color: { argb: LOG_STYLE_COLORS.gridLine } },
        };
    }

    const row = worksheet.getRow(rowNumber);
    row.height = 155;
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

        if (rawRow.isWoSummary && rawRow.woSummaryData) {
            const blankRow = createBlankLogsRow();
            const worksheetRow = worksheet.addRow(blankRow);
            const pclText = resolvePclTextForSummary(rawRow, resolveWoDetails(rawRow, input.woDetailsMap));
            applyWoSummaryMergedRow(worksheet, worksheetRow.number, rawRow.woSummaryData, pclText);
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

export async function buildGroupedExcelWorkbook(input: ExcelExportInput): Promise<Workbook> {
    const WorkbookClass = await getWorkbookCtor();
    const workbook = new WorkbookClass();
    workbook.created = new Date();
    workbook.modified = new Date();

    addGroupedLogsSheet(workbook, input);

    return workbook;
}

async function downloadWorkbook(workbook: Workbook, filename: string): Promise<void> {
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

export async function exportToExcel(input: ExcelExportInput): Promise<void> {
    const filename = input.filename || 'device_report.xlsx';
    const workbook = await buildExcelWorkbook(input);
    await downloadWorkbook(workbook, filename);
}

export async function exportToGroupedExcel(input: ExcelExportInput): Promise<void> {
    const filename = input.filename || 'device_report_grouped.xlsx';
    const workbook = await buildGroupedExcelWorkbook(input);
    await downloadWorkbook(workbook, filename);
}

export interface PdfExportInput {
    sourceElement: HTMLElement;
    filename?: string;
    marginMm?: number;
}

export interface PdfPageSlice {
    offsetPx: number;
    heightPx: number;
}

const PDF_EXPORT_ATTR = 'data-pdf-export-token';
const DEFAULT_PDF_MARGIN_MM = 8;

export function computePdfPageSlices(totalHeightPx: number, pageHeightPx: number): PdfPageSlice[] {
    if (totalHeightPx <= 0 || pageHeightPx <= 0) {
        return [];
    }

    const slices: PdfPageSlice[] = [];
    let offsetPx = 0;

    while (offsetPx < totalHeightPx) {
        const heightPx = Math.min(pageHeightPx, totalHeightPx - offsetPx);
        slices.push({ offsetPx, heightPx });
        offsetPx += heightPx;
    }

    return slices;
}

export function computePdfCanvasSlices(
    canvasWidthPx: number,
    canvasHeightPx: number,
    contentWidthMm: number,
    contentHeightMm: number,
): PdfPageSlice[] {
    if (canvasWidthPx <= 0 || canvasHeightPx <= 0 || contentWidthMm <= 0 || contentHeightMm <= 0) {
        return [];
    }

    const pxPerMm = canvasWidthPx / contentWidthMm;
    const pageHeightPx = Math.max(1, Math.floor(contentHeightMm * pxPerMm));
    return computePdfPageSlices(canvasHeightPx, pageHeightPx);
}

function preparePdfClone(root: HTMLElement, widthPx: number): void {
    root.style.width = `${Math.max(widthPx, root.scrollWidth)}px`;
    root.style.maxWidth = 'none';
    root.style.overflow = 'visible';
    root.style.background = '#ffffff';

    root.querySelectorAll<HTMLElement>('[data-pdf-exclude="true"]').forEach((node) => node.remove());

    root.querySelectorAll<HTMLElement>('.overflow-x-auto').forEach((node) => {
        node.style.overflow = 'visible';
        node.style.maxWidth = 'none';
    });

    root.querySelectorAll<HTMLElement>('thead').forEach((node) => {
        node.style.position = 'static';
        node.style.top = 'auto';
    });

    root.querySelectorAll<HTMLElement>('*').forEach((node) => {
        node.style.animation = 'none';
        node.style.transition = 'none';
    });
}

async function renderElementToCanvas(sourceElement: HTMLElement): Promise<HTMLCanvasElement> {
    const { default: html2canvas } = await import('html2canvas');
    const token = `pdf-export-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
    sourceElement.setAttribute(PDF_EXPORT_ATTR, token);

    try {
        const widthPx = Math.max(sourceElement.scrollWidth, sourceElement.clientWidth);
        const heightPx = Math.max(sourceElement.scrollHeight, sourceElement.clientHeight);
        const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

        return await html2canvas(sourceElement, {
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            scale,
            windowWidth: widthPx,
            windowHeight: heightPx,
            onclone: (clonedDocument) => {
                const clonedRoot = clonedDocument.querySelector<HTMLElement>(`[${PDF_EXPORT_ATTR}="${token}"]`);
                if (!clonedRoot) return;
                preparePdfClone(clonedRoot, widthPx);
            },
        });
    } finally {
        sourceElement.removeAttribute(PDF_EXPORT_ATTR);
    }
}

function drawCanvasSlice(sourceCanvas: HTMLCanvasElement, slice: PdfPageSlice): HTMLCanvasElement {
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = sourceCanvas.width;
    pageCanvas.height = slice.heightPx;

    const context = pageCanvas.getContext('2d');
    if (!context) {
        throw new Error('Unable to get 2D context for PDF page rendering.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(
        sourceCanvas,
        0,
        slice.offsetPx,
        sourceCanvas.width,
        slice.heightPx,
        0,
        0,
        sourceCanvas.width,
        slice.heightPx,
    );

    return pageCanvas;
}

export async function exportToPDF(input: PdfExportInput): Promise<void> {
    if (!input.sourceElement) {
        throw new Error('Missing source element for PDF export.');
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('PDF export is only available in a browser environment.');
    }

    const filename = input.filename || 'device_report.pdf';
    const marginMm = input.marginMm ?? DEFAULT_PDF_MARGIN_MM;
    const doc = new jsPDF('l', 'mm', 'a4');

    const pageWidthMm = doc.internal.pageSize.getWidth();
    const pageHeightMm = doc.internal.pageSize.getHeight();
    const contentWidthMm = pageWidthMm - marginMm * 2;
    const contentHeightMm = pageHeightMm - marginMm * 2;

    if (contentWidthMm <= 0 || contentHeightMm <= 0) {
        throw new Error('Invalid PDF margin configuration.');
    }

    const sourceCanvas = await renderElementToCanvas(input.sourceElement);
    const slices = computePdfCanvasSlices(
        sourceCanvas.width,
        sourceCanvas.height,
        contentWidthMm,
        contentHeightMm,
    );

    if (slices.length === 0) {
        throw new Error('No report content available for PDF export.');
    }

    slices.forEach((slice, index) => {
        if (index > 0) {
            doc.addPage('a4', 'l');
        }

        const pageCanvas = drawCanvasSlice(sourceCanvas, slice);
        const imageData = pageCanvas.toDataURL('image/png');
        const renderedHeightMm = (slice.heightPx * contentWidthMm) / sourceCanvas.width;

        doc.addImage(imageData, 'PNG', marginMm, marginMm, contentWidthMm, renderedHeightMm, undefined, 'FAST');
    });

    doc.save(filename);
}
