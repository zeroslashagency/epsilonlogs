import { describe, expect, it } from 'vitest';
import {
  GROUPED_LOG_SHEET_HEADERS,
  LOG_SHEET_HEADERS,
  LOG_STYLE_COLORS,
  buildExcelWorkbook,
  buildGroupedExcelWorkbook,
  computePdfCanvasSlices,
  computePdfPageSlices,
  mapReportRowToLogsSheetRow,
} from '../src/report/export-utils.js';
import type { ReportRow, ReportStats, WoDetails } from '../src/report/report-types.js';

const makeWoDetails = (overrides: Partial<WoDetails> = {}): WoDetails => ({
  id: 303,
  pcl: 700,
  start_time: '2026-02-09T03:13:14.180659Z',
  end_time: '2026-02-09T08:31:19.158779Z',
  start_uid: 12,
  stop_uid: 13,
  extensions: [],
  wo_id_str: '2839',
  part_no: 'MET002',
  start_name: 'RamaKrishnan',
  stop_name: 'Prabhu',
  start_comment: 'Machine starting',
  stop_comment: 'Shift handover',
  setting: 'SETTING -1',
  alloted_qty: 57,
  ok_qty: 57,
  reject_qty: 0,
  device_id: 15,
  duration: 19091,
  ...overrides,
});

const makeStats = (): ReportStats => ({
  totalJobs: 2,
  totalCycles: 4,
  totalCuttingSec: 200,
  totalPauseSec: 30,
  totalLoadingUnloadingSec: 20,
  totalIdleSec: 10,
  totalWoDurationSec: 260,
  machineUtilization: 77,
  totalAllotedQty: 57,
  totalOkQty: 57,
  totalRejectQty: 1,
  totalLogs: 73,
  woBreakdowns: [
    {
      woId: '2839',
      partNo: 'MET002',
      operator: 'RamaKrishnan',
      setting: 'SETTING -1',
      jobs: 2,
      cycles: 4,
      cuttingSec: 200,
      pauseSec: 30,
      loadingSec: 20,
      allotedQty: 57,
      okQty: 57,
      rejectQty: 1,
      pcl: 700,
      avgCycleSec: 50,
      startTime: '09-02-2026 03:13:14',
      endTime: '09-02-2026 08:31:19',
      durationSec: 19091,
    },
  ],
  operatorSummaries: [
    {
      name: 'RamaKrishnan',
      woCount: 1,
      totalJobs: 2,
      totalCycles: 4,
      totalCuttingSec: 200,
      totalPauseSec: 30,
      avgCycleSec: 50,
    },
  ],
});

const makeEventRow = (overrides: Partial<ReportRow> = {}): ReportRow => {
  const logTime = new Date('2026-02-09T05:35:11.192Z');

  return {
    rowId: 'log-2515',
    sNo: 1,
    logId: 2515,
    logTime,
    action: 'SPINDLE_OFF',
    durationText: '11 min 45 sec',
    label: 'JOB - 01',
    summary: '5 sec excess',
    jobType: 'Production',
    operatorName: 'RamaKrishnan',
    timestamp: logTime.getTime(),
    originalLog: {
      log_id: 2515,
      log_time: logTime.toISOString(),
      action: 'SPINDLE_OFF',
      wo_id: 303,
      device_id: 15,
      uid: 12,
      wo_name: '2839',
      setting: 'SETTING -1',
      part_no: 'MET002',
      alloted_qty: 57,
      start_comment: 'Starting',
      pcl: '710',
      start_name: 'Inline Operator',
    },
    ...overrides,
  };
};

const makeJobBlockRow = (
  jobType: ReportRow['jobType'],
  jobTypeCode: number,
  overrides: Partial<ReportRow> = {},
): ReportRow => {
  const logTime = new Date('2026-02-09T05:35:11.192Z');
  const label = `${String(jobType).toUpperCase()} PROCESS`;

  return {
    rowId: `job-block-${jobTypeCode}`,
    logId: 7000 + jobTypeCode,
    logTime,
    action: '',
    label,
    durationText: '15 min 0 sec',
    durationSec: 900,
    jobType,
    operatorName: 'RamaKrishnan',
    timestamp: logTime.getTime(),
    isJobBlock: true,
    jobBlockLabel: label,
    originalLog: {
      ...makeEventRow().originalLog!,
      log_id: 7000 + jobTypeCode,
      action: 'WO_START',
      job_type: String(jobTypeCode),
    },
    ...overrides,
  };
};

describe('report export mapping', () => {
  it('keeps exact log header order', () => {
    expect(LOG_SHEET_HEADERS).toEqual([
      'S.No',
      'Log Time',
      'Action',
      'Job Tag',
      'Summary / Notes',
      'WO Core',
      'Setup / Device',
      'Job Type',
      'Operator',
    ]);
  });

  it('maps raw event rows to requested columns', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const mapped = mapReportRowToLogsSheetRow(makeEventRow(), woDetailsMap, deviceNameMap);

    expect(mapped['S.No']).toBe(1);
    expect(mapped.Action).toBe('SPINDLE_OFF');
    expect(mapped['Job Tag']).toBe('');
    expect(mapped['Summary / Notes']).toContain('Actual Cycle: 11 min 45 sec');
    expect(mapped['Summary / Notes']).toContain('Target PCL: 11m 40s');
    expect(mapped['WO Core']).toContain('WO: 2839');
    expect(mapped['WO Core']).toContain('PCL: 11m 40s');
    expect(mapped['WO Core']).toContain('Allot: 57');
    expect(mapped['Setup / Device']).toContain('Part: MET002');
    expect(mapped['Setup / Device']).toContain('Setting: SETTING -1');
    expect(mapped['Setup / Device']).toContain('Device: VMC - 05');
    expect(mapped['Job Type']).toBe('Production');
    expect(mapped.Operator).toBe('RamaKrishnan');
  });

  it('maps computed/banner rows with synthetic action and blank serial', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const row: ReportRow = {
      rowId: 'wo-header-303',
      logTime: new Date('2026-02-09T03:13:14.180Z'),
      jobType: 'Production',
      timestamp: 1,
      isWoHeader: true,
      operatorName: 'RamaKrishnan',
      woHeaderData: {
        woIdStr: '2839',
        partNo: 'MET002',
        operatorName: 'RamaKrishnan',
        pclText: '11 min 40 sec',
        setting: 'SETTING -1',
        deviceId: 15,
        startComment: 'Header comment',
      },
      woSpecs: {
        woId: '2839',
        pclText: '11 min 40 sec',
        allotted: 57,
      },
    };

    const mapped = mapReportRowToLogsSheetRow(row, woDetailsMap, deviceNameMap);

    expect(mapped['S.No']).toBe('');
    expect(mapped.Action).toBe('WO_HEADER');
    expect(mapped['Job Tag']).toBe('');
    expect(mapped['WO Core']).toContain('WO: 2839');
    expect(mapped['WO Core']).toContain('PCL: 11 min 40 sec');
    expect(mapped['WO Core']).toContain('Allot: 57');
    expect(mapped['Setup / Device']).toContain('Part: MET002');
    expect(mapped['Setup / Device']).toContain('Setting: SETTING -1');
    expect(mapped['Setup / Device']).toContain('Device: VMC - 05');
    expect(mapped.Operator).toBe('RamaKrishnan');
  });

  it('maps Job Tag for grouped spindle rows', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const groupedRow = makeEventRow({
      action: 'SPINDLE_ON',
      label: 'JOB - 08',
      jobBlockLabel: 'JOB - 08',
    });

    const mapped = mapReportRowToLogsSheetRow(groupedRow, woDetailsMap, deviceNameMap);
    expect(mapped['Job Tag']).toBe('JOB - 08');
    expect(mapped['Summary / Notes']).toContain('Variance: 5 sec excess');
    expect(mapped['Summary / Notes']).toContain('Ref PCL: 11m 40s');
  });

  it('keeps Job Tag empty for computed separator rows even when label exists', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);
    const loadingRow: ReportRow = {
      rowId: 'computed-load-1',
      logTime: new Date('2026-02-09T05:40:11.192Z'),
      action: '',
      label: 'Loading /Unloading Time',
      durationText: '1 min 12 sec',
      jobType: 'Production',
      timestamp: new Date('2026-02-09T05:40:11.192Z').getTime(),
      isComputed: true,
      jobBlockLabel: 'JOB - 08',
    };

    const mapped = mapReportRowToLogsSheetRow(loadingRow, woDetailsMap, deviceNameMap);
    expect(mapped['Job Tag']).toBe('');
    expect(mapped['Summary / Notes']).toContain('Gap Time: 1 min 12 sec');
    expect(mapped['Summary / Notes']).toContain('Type: Loading/Unloading');
  });

  it('formats WO_STOP summary notes with stop time and reason', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);
    const row = makeEventRow({
      logTime: new Date('2026-02-09T14:01:19'),
      action: 'WO_STOP',
      stopRowData: {
        ok: 63,
        reject: 0,
        reason: 'Job completed',
      },
      originalLog: {
        ...makeEventRow().originalLog!,
        action: 'WO_STOP',
      },
    });

    const mapped = mapReportRowToLogsSheetRow(row, woDetailsMap, deviceNameMap);
    expect(mapped['Summary / Notes']).toContain('Stop: 09/02/2026, 14:01:19');
    expect(mapped['Summary / Notes']).toContain('Reason: Job completed');
  });

  it('formats WO summary rows as 3-section detail block text', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);
    const row: ReportRow = {
      rowId: 'wo-summary-303',
      logTime: new Date('2026-02-09T14:01:20'),
      jobType: 'Production',
      timestamp: new Date('2026-02-09T14:01:20').getTime(),
      isWoSummary: true,
      woSpecs: {
        woId: '2839',
        pclText: '11m 40s',
        allotted: 57,
      },
      woSummaryData: {
        woIdStr: '2839',
        partNo: 'E-MET 002',
        operatorName: 'RamaKrishnan',
        setting: 'SETTING -1',
        deviceId: 15,
        startTime: '09/02/2026, 08:43:07',
        endTime: '09/02/2026, 14:01:19',
        totalDuration: '5h 18m 11s',
        totalJobs: 11,
        totalCycles: 15,
        totalCuttingTime: '2h 6m 43s',
        allotedQty: 57,
        okQty: 63,
        rejectQty: 0,
        totalPauseTime: '25m 48s',
        keyEventsTotal: 4,
        keyOnCount: 2,
        keyOffCount: 2,
        pauseReasons: ['Paused(10m50s)', 'Tool Check(7m20s)', 'Setup(7m38s)'],
        stopComment: 'Job completed',
        startComment: 'Starting',
      },
    };

    const mapped = mapReportRowToLogsSheetRow(row, woDetailsMap, deviceNameMap);
    expect(mapped['Summary / Notes']).toContain('1) WO INFO');
    expect(mapped['Summary / Notes']).toContain('2) TIME / KPI');
    expect(mapped['Summary / Notes']).toContain('3) OUTPUT + COMMENTS');
    expect(mapped['Summary / Notes']).toContain('Allot: 57 | OK: 63 | Reject: 0');
    expect(mapped['Summary / Notes']).toContain('Key: 4 (ON 2 / OFF 2)');
    expect(mapped['WO Core']).toBe('');
    expect(mapped['Setup / Device']).toBe('');
    expect(mapped['Job Type']).toBe('');
    expect(mapped.Operator).toBe('');
  });

  it('resolves operator by start_uid/stop_uid then falls back to start_name', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const stopUidRow = makeEventRow({
      originalLog: {
        ...makeEventRow().originalLog!,
        uid: 13,
      },
    });
    const fallbackRow = makeEventRow({
      originalLog: {
        ...makeEventRow().originalLog!,
        uid: 99,
        start_name: 'Fallback Name',
      },
    });

    expect(mapReportRowToLogsSheetRow(stopUidRow, woDetailsMap, deviceNameMap).Operator).toBe('Prabhu');
    expect(mapReportRowToLogsSheetRow(fallbackRow, woDetailsMap, deviceNameMap).Operator).toBe('Fallback Name');
  });

  it('falls back to Device <id> when device name lookup is missing', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);

    const mapped = mapReportRowToLogsSheetRow(makeEventRow(), woDetailsMap, new Map());
    expect(mapped['Setup / Device']).toContain('Device: Device 15');
  });

  it('keeps available fields when WO details are missing', () => {
    const mapped = mapReportRowToLogsSheetRow(makeEventRow(), new Map(), new Map([[15, 'VMC - 05']]));

    expect(mapped['WO Core']).toContain('WO: 2839');
    expect(mapped['WO Core']).toContain('PCL: 11m 50s');
    expect(mapped['Setup / Device']).toContain('Device: VMC - 05');
  });

  it('uses WO PCL fallback when row-level PCL is absent', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails({ pcl: 900 })]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);
    const sourceLog = makeEventRow().originalLog!;
    const { pcl: _discardPcl, ...logWithoutPcl } = sourceLog;

    const row = makeEventRow({
      originalLog: logWithoutPcl,
    });

    const mapped = mapReportRowToLogsSheetRow(row, woDetailsMap, deviceNameMap);
    expect(mapped['WO Core']).toContain('PCL: 15m 0s');
  });

  it('maps KEY actions with explicit key-mode summary notes', () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const keyOnMapped = mapReportRowToLogsSheetRow(
      makeEventRow({
        action: 'KEY_ON',
        summary: 'Manual entry: KEY ON',
      }),
      woDetailsMap,
      deviceNameMap,
    );

    const keyOffMapped = mapReportRowToLogsSheetRow(
      makeEventRow({
        action: 'KEY_OFF',
        summary: 'Manual entry: KEY OFF',
      }),
      woDetailsMap,
      deviceNameMap,
    );

    expect(keyOnMapped['Summary / Notes']).toContain('Manual entry: KEY ON');
    expect(keyOffMapped['Summary / Notes']).toContain('Manual entry: KEY OFF');
  });
});

describe('report workbook structure', () => {
  it('creates Logs + Analysis sheets with header styling and filter/freeze', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const woHeaderRow: ReportRow = {
      rowId: 'wo-header-303',
      logTime: new Date('2026-02-09T03:13:14.180Z'),
      action: 'WO_START',
      jobType: 'Production',
      timestamp: 1,
      isWoHeader: true,
      woHeaderData: {
        woIdStr: '2839',
        partNo: 'MET002',
        operatorName: 'RamaKrishnan',
        pclText: '11 min 40 sec',
        setting: 'SETTING -1',
        deviceId: 15,
        startComment: 'Header comment',
      },
    };

    const workbook = await buildExcelWorkbook({
      rows: [woHeaderRow, makeEventRow()],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
      reportConfig: {
        deviceId: 15,
        startDate: '09-02-2026 11:00',
        endDate: '09-02-2026 17:00',
      },
    });

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Logs', 'Analysis']);

    const logsSheet = workbook.getWorksheet('Logs');
    expect(logsSheet).toBeDefined();
    expect(logsSheet?.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(logsSheet?.autoFilter).toBeDefined();

    const headerCellFill = logsSheet?.getCell('A1').fill as { fgColor?: { argb?: string } };
    expect(headerCellFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.headerBg);

    const row2Fill = logsSheet?.getCell('A2').fill as { fgColor?: { argb?: string } };
    expect(row2Fill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.woHeaderBg);

    const analysisSheet = workbook.getWorksheet('Analysis');
    expect(analysisSheet?.getCell('A1').value).toBe('Device Logs Analysis');

    const columnAValues = (analysisSheet?.getColumn(1).values || [])
      .filter((value): value is string => typeof value === 'string');

    expect(columnAValues).toContain('KPI Summary');
    expect(columnAValues).toContain('WO Breakdown');
    expect(columnAValues).toContain('Operator Summary');
  });

  it('applies group borders and Job Tag chip styling with loading rows inside the green group', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const groupedOff = makeEventRow({
      rowId: 'log-1',
      sNo: 1,
      action: 'SPINDLE_OFF',
      label: 'JOB - 08',
      jobBlockLabel: 'JOB - 08',
    });
    const groupedOn = makeEventRow({
      rowId: 'log-2',
      sNo: 2,
      action: 'SPINDLE_ON',
      logId: 2516,
      label: 'JOB - 08',
      jobBlockLabel: 'JOB - 08',
      timestamp: makeEventRow().timestamp + 1000,
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 2516,
        action: 'SPINDLE_ON',
      },
    });
    const separatorRow: ReportRow = {
      rowId: 'computed-gap-1',
      logTime: new Date('2026-02-09T05:36:11.192Z'),
      action: '',
      durationText: '1 min 25 sec',
      label: 'Loading /Unloading Time',
      jobType: 'Production',
      timestamp: new Date('2026-02-09T05:36:11.192Z').getTime(),
      isComputed: true,
      jobBlockLabel: 'JOB - 08',
    };

    const workbook = await buildExcelWorkbook({
      rows: [groupedOff, groupedOn, separatorRow],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const logsSheet = workbook.getWorksheet('Logs');
    expect(logsSheet).toBeDefined();

    const firstGroupTopBorder = logsSheet?.getCell('A2').border?.top;
    expect(firstGroupTopBorder?.style).toBe('thick');
    expect(firstGroupTopBorder?.color?.argb).toBe(LOG_STYLE_COLORS.groupBorder);

    const firstGroupLeftBorder = logsSheet?.getCell('A2').border?.left;
    expect(firstGroupLeftBorder?.style).toBe('thick');
    expect(firstGroupLeftBorder?.color?.argb).toBe(LOG_STYLE_COLORS.groupBorder);

    const loadingRowLeftBorder = logsSheet?.getCell('A4').border?.left;
    expect(loadingRowLeftBorder?.style).toBe('thick');
    expect(loadingRowLeftBorder?.color?.argb).toBe(LOG_STYLE_COLORS.groupBorder);

    const lastGroupBottomBorder = logsSheet?.getCell('A4').border?.bottom;
    expect(lastGroupBottomBorder?.style).toBe('thick');
    expect(lastGroupBottomBorder?.color?.argb).toBe(LOG_STYLE_COLORS.groupBorder);

    const separatorFill = logsSheet?.getCell('A4').fill as { fgColor?: { argb?: string } };
    expect(separatorFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.jobBlockBg);

    const jobTagChipFill = logsSheet?.getCell('D2').fill as { fgColor?: { argb?: string } };
    expect(jobTagChipFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.jobTagChipBg);

    const jobTagSecondRowFont = logsSheet?.getCell('D3').font as { bold?: boolean };
    expect(jobTagSecondRowFont?.bold).toBe(true);
  });

  it('renders WO_SUMMARY row as a full-row merged layout split into 3 sections', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);
    const woSummaryRow: ReportRow = {
      rowId: 'wo-summary-303',
      logTime: new Date('2026-02-09T14:01:19'),
      jobType: 'Production',
      timestamp: new Date('2026-02-09T14:01:19').getTime(),
      isWoSummary: true,
      woSpecs: {
        woId: '2839',
        pclText: '11 min 50 sec',
        allotted: 57,
      },
      woSummaryData: {
        woIdStr: '2839',
        partNo: 'MET002',
        operatorName: 'RamaKrishnan',
        setting: 'SETTING -1',
        deviceId: 15,
        startTime: '09/02/2026, 08:43:07',
        endTime: '09/02/2026, 14:01:19',
        totalDuration: '5h 18m 11s',
        totalJobs: 11,
        totalCycles: 15,
        totalCuttingTime: '2h 6m 43s',
        allotedQty: 57,
        okQty: 63,
        rejectQty: 0,
        totalPauseTime: '25m 48s',
        pauseReasons: ['Missed Again'],
        stopComment: 'Jop completed',
        startComment: 'Starting',
      },
    };

    const workbook = await buildExcelWorkbook({
      rows: [woSummaryRow],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const logsSheet = workbook.getWorksheet('Logs');
    expect(logsSheet).toBeDefined();

    const leftCell = logsSheet?.getCell('A2');
    const centerCell = logsSheet?.getCell('D2');
    const rightCell = logsSheet?.getCell('G2');

    expect(String(leftCell?.value || '')).toContain('1) WO INFO');
    expect(String(centerCell?.value || '')).toContain('2) TIME / KPI');
    expect(String(rightCell?.value || '')).toContain('3) OUTPUT + COMMENTS');

    expect(logsSheet?.getRow(2).height).toBeGreaterThan(120);
    expect(logsSheet?.getCell('C2').value).toBe(String(leftCell?.value || ''));
    expect(logsSheet?.getCell('F2').value).toBe(String(centerCell?.value || ''));
    expect(logsSheet?.getCell('I2').value).toBe(String(rightCell?.value || ''));
  });

  it('applies key-action tint for KEY rows in logs sheet', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const keyRow = makeEventRow({
      action: 'KEY_ON',
      summary: 'Manual entry: KEY ON',
      jobType: 'Unknown',
    });

    const workbook = await buildExcelWorkbook({
      rows: [keyRow],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const logsSheet = workbook.getWorksheet('Logs');
    const rowFill = logsSheet?.getCell('A2').fill as { fgColor?: { argb?: string } };
    expect(rowFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.keyActionBg);
  });

  it('skips dashboard-only rows in logs export', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails({ job_type: 2 })]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const exportOnlyBlock = makeJobBlockRow('Setting', 2, {
      excludeFromDashboard: true,
    });
    const dashboardOnlySpindleOn = makeEventRow({
      rowId: 'dashboard-log-7201',
      logId: 7201,
      action: 'SPINDLE_ON',
      jobType: 'Setting',
      label: 'SETTING PROCESS',
      jobBlockLabel: 'SETTING PROCESS',
      excludeFromExport: true,
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 7201,
        action: 'SPINDLE_ON',
        job_type: '2',
      },
    });

    const workbook = await buildExcelWorkbook({
      rows: [exportOnlyBlock, dashboardOnlySpindleOn],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const logsSheet = workbook.getWorksheet('Logs');
    expect(logsSheet?.actualRowCount).toBe(2);
  });
});

describe('grouped workbook structure', () => {
  it('keeps grouped sheet header order with OP column', async () => {
    const workbook = await buildGroupedExcelWorkbook({
      rows: [],
      stats: makeStats(),
      woDetailsMap: new Map(),
      deviceNameMap: new Map(),
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet).toBeDefined();

    const headerValues = groupedSheet?.getRow(1).values as Array<string | undefined>;
    expect(headerValues.slice(1, GROUPED_LOG_SHEET_HEADERS.length + 1)).toEqual(GROUPED_LOG_SHEET_HEADERS);
  });

  it('shows JOB label once per group and merges PLC for spindle pairs', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const spindleOn = makeEventRow({
      rowId: 'log-3100',
      sNo: 10,
      logId: 3100,
      logTime: new Date('2026-02-10T13:57:48'),
      action: 'SPINDLE_ON',
      label: 'JOB - 01',
      jobBlockLabel: 'JOB - 01',
      timestamp: new Date('2026-02-10T13:57:48').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 3100,
        action: 'SPINDLE_ON',
      },
    });
    const spindleOff = makeEventRow({
      rowId: 'log-3101',
      sNo: 11,
      logId: 3101,
      logTime: new Date('2026-02-10T14:17:42'),
      action: 'SPINDLE_OFF',
      label: 'JOB - 01',
      durationSec: 1194,
      durationText: '19 min 54 sec',
      jobBlockLabel: 'JOB - 01',
      timestamp: new Date('2026-02-10T14:17:42').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 3101,
        action: 'SPINDLE_OFF',
      },
    });
    const loadingGap: ReportRow = {
      rowId: 'computed-load-3101',
      logTime: new Date('2026-02-10T14:20:10.500'),
      action: '',
      durationText: '1 min 1 sec',
      durationSec: 61,
      label: 'Loading /Unloading Time',
      jobType: 'Production',
      timestamp: new Date('2026-02-10T14:20:10.500').getTime(),
      isComputed: true,
      operatorName: 'RamaKrishnan',
    };
    const spindleOn2 = makeEventRow({
      rowId: 'log-3102',
      sNo: 12,
      logId: 3102,
      logTime: new Date('2026-02-10T14:20:43'),
      action: 'SPINDLE_ON',
      label: 'JOB - 02',
      jobBlockLabel: 'JOB - 02',
      summary: '15 sec lower',
      timestamp: new Date('2026-02-10T14:20:43').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 3102,
        action: 'SPINDLE_ON',
      },
    });
    const spindleOff2 = makeEventRow({
      rowId: 'log-3103',
      sNo: 13,
      logId: 3103,
      logTime: new Date('2026-02-10T14:21:49'),
      action: 'SPINDLE_OFF',
      label: 'JOB - 02',
      durationSec: 66,
      durationText: '1 min 6 sec',
      jobBlockLabel: 'JOB - 02',
      timestamp: new Date('2026-02-10T14:21:49').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 3103,
        action: 'SPINDLE_OFF',
      },
    });

    const workbook = await buildGroupedExcelWorkbook({
      rows: [spindleOn, spindleOff, loadingGap, spindleOn2, spindleOff2],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet).toBeDefined();

    expect(groupedSheet?.getCell('D2').value).toBe('SPINDLE_ON');
    expect(groupedSheet?.getCell('D3').value).toBe('SPINDLE_OFF');
    expect(groupedSheet?.getCell('B2').value).toBe(3100);
    expect(groupedSheet?.getCell('B3').value).toBe(3101);
    expect(groupedSheet?.getCell('F2').value).toBe('0:19:54');
    expect(groupedSheet?.getCell('F3').value).toBe('0:19:54');
    expect(groupedSheet?.getCell('G2').value).toBe('JOB 1');
    expect(groupedSheet?.getCell('G3').value).toBe('');
    expect(groupedSheet?.getCell('H2').value).toBe('Loading /Unloading Time');
    expect(groupedSheet?.getCell('H3').value).toBe('1 min 1 sec');
    expect(groupedSheet?.getCell('A2').value).toBe(1);
    expect(groupedSheet?.getCell('A3').value).toBe(2);

    const topBorder = groupedSheet?.getCell('A2').border?.top;
    const bottomBorder = groupedSheet?.getCell('A3').border?.bottom;
    expect(topBorder?.style).toBe('thick');
    expect(bottomBorder?.style).toBe('thick');
  });

  it('includes comments for WO_START, WO_PAUSE, WO_RESUME and WO_STOP in grouped export', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails({
      start_comment: 'Machine starting',
      stop_comment: 'Job completed',
    })]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const woStart = makeEventRow({
      rowId: 'log-4001',
      sNo: 1,
      logId: 4001,
      logTime: new Date('2026-02-10T13:40:00'),
      action: 'WO_START',
      timestamp: new Date('2026-02-10T13:40:00').getTime(),
      startRowData: {
        partNo: 'MET002',
        allotted: 57,
        comment: 'Machine starting',
      },
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 4001,
        action: 'WO_START',
        start_comment: 'Machine starting',
      },
    });

    const woPause = makeEventRow({
      rowId: 'log-4002',
      sNo: 2,
      logId: 4002,
      logTime: new Date('2026-02-10T13:50:04'),
      action: 'WO_PAUSE',
      durationSec: 650,
      durationText: '10 min 50 sec',
      summary: 'Lunch break',
      timestamp: new Date('2026-02-10T13:50:04').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 4002,
        action: 'WO_PAUSE',
        start_comment: 'Lunch break',
      },
    });

    const woResume = makeEventRow({
      rowId: 'log-4003',
      sNo: 3,
      logId: 4003,
      logTime: new Date('2026-02-10T14:00:54'),
      action: 'WO_RESUME',
      summary: 'Missed Again',
      timestamp: new Date('2026-02-10T14:00:54').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 4003,
        action: 'WO_RESUME',
      },
    });

    const woStop = makeEventRow({
      rowId: 'log-4004',
      sNo: 4,
      logId: 4004,
      logTime: new Date('2026-02-10T14:01:19'),
      action: 'WO_STOP',
      timestamp: new Date('2026-02-10T14:01:19').getTime(),
      stopRowData: {
        ok: 63,
        reject: 0,
        reason: 'Job completed',
      },
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 4004,
        action: 'WO_STOP',
        stop_comment: 'Job completed',
      },
    });

    const workbook = await buildGroupedExcelWorkbook({
      rows: [woStart, woPause, woResume, woStop],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet).toBeDefined();

    expect(String(groupedSheet?.getCell('H2').value || '')).toContain('Comment - Machine starting');
    expect(String(groupedSheet?.getCell('H3').value || '')).toContain('Reason - Lunch break');
    expect(String(groupedSheet?.getCell('H3').value || '')).toContain('Note - Missed Again');
    expect(String(groupedSheet?.getCell('H5').value || '')).toContain('Reason - Job completed');
  });

  it('renders KEY_ON/OFF rows with light-blue fill and notes split across pair', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails()]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const keyOn = makeEventRow({
      rowId: 'log-4318',
      sNo: 240,
      logId: 4318,
      logTime: new Date('2026-02-13T22:19:52'),
      action: 'KEY_ON',
      timestamp: new Date('2026-02-13T22:19:52').getTime(),
      operatorName: 'RamaKrishnan',
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 4318,
        action: 'KEY_ON',
      },
    });

    const keyOff = makeEventRow({
      rowId: 'log-4319',
      sNo: 241,
      logId: 4319,
      logTime: new Date('2026-02-13T22:19:53'),
      action: 'KEY_OFF',
      timestamp: new Date('2026-02-13T22:19:53').getTime(),
      operatorName: 'RamaKrishnan',
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 4319,
        action: 'KEY_OFF',
      },
    });

    const workbook = await buildGroupedExcelWorkbook({
      rows: [keyOn, keyOff],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet).toBeDefined();

    expect(groupedSheet?.getCell('D2').value).toBe('KEY_ON');
    expect(groupedSheet?.getCell('D3').value).toBe('KEY_OFF');
    expect(groupedSheet?.getCell('H2').value).toBe('Total Spindle Run Time:');
    expect(groupedSheet?.getCell('H3').value).toBe('1s');
    expect(groupedSheet?.getCell('I2').value).toBe('RamaKrishnan');
    expect(groupedSheet?.getCell('I3').value).toBe('RamaKrishnan');

    const keyOnActionFill = groupedSheet?.getCell('D2').fill as { fgColor?: { argb?: string } };
    const keyOffActionFill = groupedSheet?.getCell('D3').fill as { fgColor?: { argb?: string } };
    const keyOnNotesFill = groupedSheet?.getCell('H2').fill as { fgColor?: { argb?: string } };
    const keyOffNotesFill = groupedSheet?.getCell('H3').fill as { fgColor?: { argb?: string } };
    const serialFill = groupedSheet?.getCell('A2').fill as { fgColor?: { argb?: string } };
    const opFill = groupedSheet?.getCell('I2').fill as { fgColor?: { argb?: string } };

    expect(keyOnActionFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.groupedLightBlue);
    expect(keyOffActionFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.groupedLightBlue);
    expect(keyOnNotesFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.groupedLightBlue);
    expect(keyOffNotesFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.groupedLightBlue);
    expect(serialFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.defaultBg);
    expect(opFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.defaultBg);
  });

  it('maps key action labels by non-production job type', async () => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails({ job_type: 3 })]]);
    const deviceNameMap = new Map<number, string>([[15, 'VMC - 05']]);

    const keyOn = makeEventRow({
      rowId: 'log-6001',
      logId: 6001,
      logTime: new Date('2026-02-13T20:11:41'),
      action: 'KEY_ON',
      timestamp: new Date('2026-02-13T20:11:41').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 6001,
        action: 'KEY_ON',
        job_type: '3',
      },
    });

    const keyOff = makeEventRow({
      rowId: 'log-6002',
      logId: 6002,
      logTime: new Date('2026-02-13T20:19:00'),
      action: 'KEY_OFF',
      timestamp: new Date('2026-02-13T20:19:00').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 6002,
        action: 'KEY_OFF',
        job_type: '3',
      },
    });

    const workbook = await buildGroupedExcelWorkbook({
      rows: [keyOn, keyOff],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet).toBeDefined();
    expect(groupedSheet?.getCell('D2').value).toBe('Calibration ON');
    expect(groupedSheet?.getCell('D3').value).toBe('Calibration OFF');
    expect(groupedSheet?.getCell('H2').value).toBe('Total Spindle Run Time:');
    expect(groupedSheet?.getCell('H3').value).toBe('7m 19s');
  });

  it.each([
    [7, 'RD'],
    [51, 'Man Production'],
    [52, 'Man Setting'],
  ] as const)('maps key action labels for job type %s', async (jobTypeCode, expectedLabel) => {
    const woDetailsMap = new Map<number, WoDetails>([[303, makeWoDetails({ job_type: jobTypeCode })]]);
    const keyOn = makeEventRow({
      rowId: `log-${jobTypeCode}-on`,
      logId: 6100 + jobTypeCode,
      action: 'KEY_ON',
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 6100 + jobTypeCode,
        action: 'KEY_ON',
        job_type: String(jobTypeCode),
      },
    });
    const keyOff = makeEventRow({
      rowId: `log-${jobTypeCode}-off`,
      logId: 6200 + jobTypeCode,
      action: 'KEY_OFF',
      timestamp: new Date('2026-02-13T20:19:00').getTime(),
      logTime: new Date('2026-02-13T20:19:00'),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 6200 + jobTypeCode,
        action: 'KEY_OFF',
        job_type: String(jobTypeCode),
      },
    });

    const workbook = await buildGroupedExcelWorkbook({
      rows: [keyOn, keyOff],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap: new Map<number, string>([[15, 'VMC - 05']]),
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet?.getCell('D2').value).toBe(`${expectedLabel} ON`);
    expect(groupedSheet?.getCell('D3').value).toBe(`${expectedLabel} OFF`);
  });

  it.each([
    ['Setting', 2, LOG_STYLE_COLORS.groupedPurple],
    ['Calibration', 3, LOG_STYLE_COLORS.groupedCyan],
    ['Maintenance', 4, LOG_STYLE_COLORS.groupedOrange],
    ['Man', 5, LOG_STYLE_COLORS.groupedBeige],
    ['Training', 6, LOG_STYLE_COLORS.groupedLime],
    ['RD', 7, LOG_STYLE_COLORS.groupedFuchsia],
    ['Man Production', 51, LOG_STYLE_COLORS.groupedMint],
    ['Man Setting', 52, LOG_STYLE_COLORS.groupedLavender],
  ] as const)('applies grouped job block fill for %s', async (jobType, jobTypeCode, expectedFill) => {
    const woDetailsMap = new Map<number, WoDetails>([[
      303,
      makeWoDetails({
        job_type: jobTypeCode,
        stop_comment: `${jobType} done`,
      }),
    ]]);

    const workbook = await buildGroupedExcelWorkbook({
      rows: [makeJobBlockRow(jobType, jobTypeCode)],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap: new Map<number, string>([[15, 'VMC - 05']]),
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    const startFill = groupedSheet?.getCell('D2').fill as { fgColor?: { argb?: string } };
    const endFill = groupedSheet?.getCell('H3').fill as { fgColor?: { argb?: string } };

    expect(groupedSheet?.getCell('G2').value).toBe(`${jobTypeCode}: ${jobType}`);
    expect(groupedSheet?.getCell('G3').value).toBe(`${jobTypeCode}: ${jobType}`);
    expect(startFill?.fgColor?.argb).toBe(expectedFill);
    expect(endFill?.fgColor?.argb).toBe(expectedFill);
  });

  it('backfills OP for KEY rows from previous operator when missing', async () => {
    const woDetailsMap = new Map<number, WoDetails>();
    const deviceNameMap = new Map<number, string>();

    const spindleOn = makeEventRow({
      rowId: 'log-5001',
      logId: 5001,
      logTime: new Date('2026-02-13T19:53:14'),
      action: 'SPINDLE_ON',
      label: 'JOB - 04',
      jobBlockLabel: 'JOB - 04',
      operatorName: 'PALANISAMY',
      timestamp: new Date('2026-02-13T19:53:14').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 5001,
        action: 'SPINDLE_ON',
        wo_id: 9999,
        start_name: 'PALANISAMY',
      },
    });

    const spindleOff = makeEventRow({
      rowId: 'log-5002',
      logId: 5002,
      logTime: new Date('2026-02-13T19:59:04'),
      action: 'SPINDLE_OFF',
      durationSec: 289,
      durationText: '4m 49s',
      label: 'JOB - 04',
      jobBlockLabel: 'JOB - 04',
      operatorName: 'PALANISAMY',
      timestamp: new Date('2026-02-13T19:59:04').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 5002,
        action: 'SPINDLE_OFF',
        wo_id: 9999,
        start_name: 'PALANISAMY',
      },
    });

    const keyOn = makeEventRow({
      rowId: 'log-5003',
      logId: 5003,
      logTime: new Date('2026-02-13T20:11:41'),
      action: 'KEY_ON',
      operatorName: '',
      timestamp: new Date('2026-02-13T20:11:41').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 5003,
        action: 'KEY_ON',
        wo_id: 9999,
        start_name: '',
      },
    });

    const keyOff = makeEventRow({
      rowId: 'log-5004',
      logId: 5004,
      logTime: new Date('2026-02-13T20:11:42'),
      action: 'KEY_OFF',
      operatorName: '',
      timestamp: new Date('2026-02-13T20:11:42').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 5004,
        action: 'KEY_OFF',
        wo_id: 9999,
        start_name: '',
      },
    });

    const workbook = await buildGroupedExcelWorkbook({
      rows: [spindleOn, spindleOff, keyOn, keyOff],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet).toBeDefined();
    expect(groupedSheet?.getCell('I4').value).toBe('PALANISAMY');
    expect(groupedSheet?.getCell('I5').value).toBe('PALANISAMY');
  });

  it('inserts IDEAL TIME row before WO_START using previous WO_STOP gap', async () => {
    const woDetailsMap = new Map<number, WoDetails>();
    const deviceNameMap = new Map<number, string>();

    const woStop = makeEventRow({
      rowId: 'log-7001',
      logId: 7001,
      logTime: new Date('2026-02-13T22:01:26'),
      action: 'WO_STOP',
      operatorName: 'PALANISAMY',
      timestamp: new Date('2026-02-13T22:01:26').getTime(),
      stopRowData: {
        ok: 3,
        reject: 0,
        reason: 'Setting complete',
      },
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 7001,
        action: 'WO_STOP',
        start_name: 'PALANISAMY',
      },
    });

    const keyOn = makeEventRow({
      rowId: 'log-7002',
      logId: 7002,
      logTime: new Date('2026-02-13T22:19:52'),
      action: 'KEY_ON',
      operatorName: 'PALANISAMY',
      timestamp: new Date('2026-02-13T22:19:52').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 7002,
        action: 'KEY_ON',
        start_name: 'PALANISAMY',
      },
    });

    const keyOff = makeEventRow({
      rowId: 'log-7003',
      logId: 7003,
      logTime: new Date('2026-02-13T22:19:53'),
      action: 'KEY_OFF',
      operatorName: 'PALANISAMY',
      timestamp: new Date('2026-02-13T22:19:53').getTime(),
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 7003,
        action: 'KEY_OFF',
        start_name: 'PALANISAMY',
      },
    });

    const woStart = makeEventRow({
      rowId: 'log-7004',
      logId: 7004,
      logTime: new Date('2026-02-13T22:22:29'),
      action: 'WO_START',
      operatorName: 'RamaKrishnan',
      timestamp: new Date('2026-02-13T22:22:29').getTime(),
      startRowData: {
        partNo: 'MET002',
        allotted: 10,
        comment: 'Started @1025',
      },
      originalLog: {
        ...makeEventRow().originalLog!,
        log_id: 7004,
        action: 'WO_START',
        start_name: 'RamaKrishnan',
      },
    });

    const workbook = await buildGroupedExcelWorkbook({
      rows: [woStop, keyOn, keyOff, woStart],
      stats: makeStats(),
      woDetailsMap,
      deviceNameMap,
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet).toBeDefined();

    expect(groupedSheet?.getCell('D5').value).toBe('IDEAL TIME');
    expect(groupedSheet?.getCell('F5').value).toBe('0:21:03');
    expect(groupedSheet?.getCell('H5').value).toBe('Gap between previous WO_STOP and WO_START');
    expect(groupedSheet?.getCell('I5').value).toBe('PALANISAMY');
    expect(groupedSheet?.getCell('D6').value).toBe('WO_START');
    expect(groupedSheet?.getCell('A5').value).toBe(4);
    expect(groupedSheet?.getCell('A6').value).toBe(5);
  });

  it('appends end summary block in grouped sheet footer', async () => {
    const workbook = await buildGroupedExcelWorkbook({
      rows: [],
      stats: makeStats(),
      woDetailsMap: new Map(),
      deviceNameMap: new Map(),
      reportConfig: {
        deviceId: 15,
        startDate: '09/02/2026, 11:00 AM',
        endDate: '09/02/2026, 05:00 PM',
      },
    });

    const groupedSheet = workbook.getWorksheet('Logs Grouped');
    expect(groupedSheet).toBeDefined();

    expect(groupedSheet?.getCell('A3').value).toBe('END SUMMARY');
    expect(groupedSheet?.getCell('B3').value).toBe('RPT');
    expect(groupedSheet?.getCell('C3').value).toBe('09/02/2026, 11:00 AM to 09/02/2026, 05:00 PM');
    expect(groupedSheet?.getCell('D3').value).toBe('Input Total: 06:00:00');
    expect(groupedSheet?.getCell('E3').value).toBe('Cutting: 00:03:20');
    expect(groupedSheet?.getCell('F3').value).toBe('Loading: 00:00:20');
    expect(groupedSheet?.getCell('G3').value).toBe('Pause: 00:00:30');
    expect(groupedSheet?.getCell('H3').value).toBe('Key: 00:00:00 | Idle: 00:00:10 | Gap: 00:00:00 | Cls: 00:04:20 | Rem: 05:55:40 | Jobs: 2 | Cyc: 4 | OK: 57 | Rej: 1');
    expect(groupedSheet?.getCell('I3').value).toBe('CHECK');

    const actionFill = groupedSheet?.getCell('D3').fill as { fgColor?: { argb?: string } };
    const timeFill = groupedSheet?.getCell('E3').fill as { fgColor?: { argb?: string } };
    const notesFill = groupedSheet?.getCell('H3').fill as { fgColor?: { argb?: string } };
    expect(actionFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.groupedYellow);
    expect(timeFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.groupedGreen);
    expect(notesFill?.fgColor?.argb).toBe(LOG_STYLE_COLORS.pauseActionBg);
  });
});

// ---------------------------------------------------------------------------
// 20 graduated tests: end summary row calculations
// ---------------------------------------------------------------------------
describe('end summary calculations – 20 graduated tests', () => {
  // ── helpers ────────────────────────────────────────────────────────────
  const makeZeroStats = (): ReportStats => ({
    totalJobs: 0,
    totalCycles: 0,
    totalCuttingSec: 0,
    totalPauseSec: 0,
    totalLoadingUnloadingSec: 0,
    totalIdleSec: 0,
    totalWoDurationSec: 0,
    machineUtilization: 0,
    totalAllotedQty: 0,
    totalOkQty: 0,
    totalRejectQty: 0,
    totalLogs: 0,
    woBreakdowns: [],
    operatorSummaries: [],
  });

  const makeSummaryWorkbook = (
    rows: ReportRow[],
    stats: ReportStats,
    reportConfig?: { deviceId: number; startDate: string; endDate: string },
  ) =>
    buildGroupedExcelWorkbook({
      rows,
      stats,
      woDetailsMap: new Map(),
      deviceNameMap: new Map(),
      ...(reportConfig ? { reportConfig } : {}),
    });

  const summaryRow = (sheet: ReturnType<import('exceljs').Workbook['getWorksheet']>, rowNum: number) => ({
    a: String(sheet?.getCell(`A${rowNum}`).value ?? ''),
    b: String(sheet?.getCell(`B${rowNum}`).value ?? ''),
    c: String(sheet?.getCell(`C${rowNum}`).value ?? ''),
    d: String(sheet?.getCell(`D${rowNum}`).value ?? ''),   // Input Total
    e: String(sheet?.getCell(`E${rowNum}`).value ?? ''),   // Cutting
    f: String(sheet?.getCell(`F${rowNum}`).value ?? ''),   // Loading
    g: String(sheet?.getCell(`G${rowNum}`).value ?? ''),   // Pause
    h: String(sheet?.getCell(`H${rowNum}`).value ?? ''),   // Key|Cls|Rem
    i: String(sheet?.getCell(`I${rowNum}`).value ?? ''),   // Status
  });

  // ── TC-01: All-zero stats + empty rows ─────────────────────────────────
  it('TC-01: all-zero stats + empty rows → all metrics 00:00:00, status OK', async () => {
    // same start+end → inputWindow = 0 → classified = 0 → Rem = 0 → OK
    const wb = await makeSummaryWorkbook([], makeZeroStats(), { deviceId: 1, startDate: '09-02-2026 08:00', endDate: '09-02-2026 08:00' });
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3); // header=row1, no data rows, blockStart = 1+2 = 3
    expect(s.a).toBe('END SUMMARY');
    expect(s.e).toBe('Cutting: 00:00:00');
    expect(s.f).toBe('Loading: 00:00:00');
    expect(s.g).toBe('Pause: 00:00:00');
    expect(s.h).toContain('Key: 00:00:00');
    expect(s.h).toContain('Cls: 00:00:00');
    expect(s.h).toContain('Rem: 00:00:00');
    expect(s.i).toBe('OK');
  });

  // ── TC-02: Cutting only ────────────────────────────────────────────────
  it('TC-02: non-zero cutting only → cutting shows, loading/pause/key all zero', async () => {
    const stats = { ...makeZeroStats(), totalCuttingSec: 3600 }; // 1 hour
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.e).toBe('Cutting: 01:00:00');
    expect(s.f).toBe('Loading: 00:00:00');
    expect(s.g).toBe('Pause: 00:00:00');
    expect(s.h).toContain('Key: 00:00:00');
  });

  // ── TC-03: Loading only ────────────────────────────────────────────────
  it('TC-03: non-zero loading only → loading shows, cutting/pause zero', async () => {
    const stats = { ...makeZeroStats(), totalLoadingUnloadingSec: 120 }; // 2 min
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.f).toBe('Loading: 00:02:00');
    expect(s.e).toBe('Cutting: 00:00:00');
    expect(s.g).toBe('Pause: 00:00:00');
  });

  // ── TC-04: Pause only ─────────────────────────────────────────────────
  it('TC-04: non-zero pause only → pause shows, cutting/loading zero', async () => {
    const stats = { ...makeZeroStats(), totalPauseSec: 1800 }; // 30 min
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.g).toBe('Pause: 00:30:00');
    expect(s.e).toBe('Cutting: 00:00:00');
    expect(s.f).toBe('Loading: 00:00:00');
  });

  // ── TC-05: Key time from single KEY_ON/OFF pair in rows ────────────────
  it('TC-05: KEY_ON + KEY_OFF pair → key seconds computed from row timestamps', async () => {
    const keyOn = makeEventRow({
      rowId: 'tc05-key-on', logId: 9001, action: 'KEY_ON',
      logTime: new Date('2026-02-09T06:00:00Z'),
      timestamp: new Date('2026-02-09T06:00:00Z').getTime(),
      originalLog: { ...makeEventRow().originalLog!, log_id: 9001, action: 'KEY_ON' },
    });
    const keyOff = makeEventRow({
      rowId: 'tc05-key-off', logId: 9002, action: 'KEY_OFF',
      logTime: new Date('2026-02-09T06:05:00Z'), // 5 min later
      timestamp: new Date('2026-02-09T06:05:00Z').getTime(),
      originalLog: { ...makeEventRow().originalLog!, log_id: 9002, action: 'KEY_OFF' },
    });
    const wb = await makeSummaryWorkbook([keyOn, keyOff], makeZeroStats());
    const sheet = wb.getWorksheet('Logs Grouped');
    // header=row1, KEY_ON=row2, KEY_OFF=row3, rowCount=3, blockStart=3+2=5
    const s = summaryRow(sheet, 5);
    expect(s.h).toContain('Key: 00:05:00');
  });

  // ── TC-06: Cutting + Loading combined ─────────────────────────────────
  it('TC-06: cutting 600s + loading 60s → classified reflects both', async () => {
    const stats = { ...makeZeroStats(), totalCuttingSec: 600, totalLoadingUnloadingSec: 60 };
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.e).toBe('Cutting: 00:10:00');
    expect(s.f).toBe('Loading: 00:01:00');
    expect(s.h).toContain('Cls: 00:11:00');
  });

  // ── TC-07: Cutting + Pause combined ───────────────────────────────────
  it('TC-07: cutting 120s + pause 180s → classified = 300s = 00:05:00', async () => {
    const stats = { ...makeZeroStats(), totalCuttingSec: 120, totalPauseSec: 180 };
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.h).toContain('Cls: 00:05:00');
  });

  // ── TC-08: All four combined, status OK (inputTotal = classified exact) ─
  it('TC-08: inputTotal equals classified exactly → status = OK, Rem = 00:00:00', async () => {
    // cutting=100s, loading=50s, pause=50s = 200s classified
    // inputWindow = 200s → 09:00 to 09:03:20 (200s window)
    const stats = { ...makeZeroStats(), totalCuttingSec: 100, totalLoadingUnloadingSec: 50, totalPauseSec: 50 };
    // Use WoDuration as fallback (no reportConfig) → inputTotalSec = totalWoDurationSec
    const statsWithDuration = { ...stats, totalWoDurationSec: 200 };
    const wb = await makeSummaryWorkbook([], statsWithDuration);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.h).toContain('Rem: 00:00:00');
    expect(s.i).toBe('OK');
  });

  // ── TC-09: Remaining > 0 (unclassified time) ───────────────────────────
  it('TC-09: classified < inputTotal → positive Rem, status = CHECK', async () => {
    // 2h input, 30min classified → 1h30m remaining
    const stats = { ...makeZeroStats(), totalCuttingSec: 1800, totalWoDurationSec: 7200 };
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.h).toContain('Rem: 01:30:00');
    expect(s.i).toBe('CHECK');
  });

  // ── TC-10: Remaining < 0 (classified exceeds inputTotal) ──────────────
  it('TC-10: classified > inputTotal → negative Rem with minus sign, status = CHECK', async () => {
    // 600s cutting but only 300s WO duration → -300s remaining
    const stats = { ...makeZeroStats(), totalCuttingSec: 600, totalWoDurationSec: 300 };
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.h).toMatch(/Rem: -\d{2}:\d{2}:\d{2}/);
    expect(s.i).toBe('CHECK');
  });

  // ── TC-11: reportConfig overrides totalWoDurationSec as inputTotal ─────
  it('TC-11: reportConfig window overrides stats.totalWoDurationSec for inputTotal', async () => {
    const stats = { ...makeZeroStats(), totalWoDurationSec: 99999 }; // should be ignored
    // 1h window from config
    const wb = await makeSummaryWorkbook([], stats, {
      deviceId: 1,
      startDate: '09-02-2026 08:00',  // DD-MM-YYYY HH:MM — supported by dashMatch
      endDate: '09-02-2026 09:00',
    });
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.d).toBe('Input Total: 01:00:00');
  });

  // ── TC-12: No reportConfig → falls back to stats.totalWoDurationSec ────
  it('TC-12: no reportConfig → inputTotal = stats.totalWoDurationSec', async () => {
    const stats = { ...makeZeroStats(), totalWoDurationSec: 3600 };
    const wb = await makeSummaryWorkbook([], stats); // no reportConfig
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.d).toBe('Input Total: 01:00:00');
  });

  // ── TC-13: Multiple KEY_ON/OFF pairs accumulate ─────────────────────────
  it('TC-13: two KEY_ON/OFF pairs → key time is sum of both gaps', async () => {
    const base = makeEventRow().originalLog!;
    const k1on = makeEventRow({ rowId: 'k1on', logId: 8001, action: 'KEY_ON', logTime: new Date('2026-02-09T06:00:00Z'), timestamp: new Date('2026-02-09T06:00:00Z').getTime(), originalLog: { ...base, log_id: 8001, action: 'KEY_ON' } });
    const k1off = makeEventRow({ rowId: 'k1off', logId: 8002, action: 'KEY_OFF', logTime: new Date('2026-02-09T06:03:00Z'), timestamp: new Date('2026-02-09T06:03:00Z').getTime(), originalLog: { ...base, log_id: 8002, action: 'KEY_OFF' } }); // +3 min
    const k2on = makeEventRow({ rowId: 'k2on', logId: 8003, action: 'KEY_ON', logTime: new Date('2026-02-09T07:00:00Z'), timestamp: new Date('2026-02-09T07:00:00Z').getTime(), originalLog: { ...base, log_id: 8003, action: 'KEY_ON' } });
    const k2off = makeEventRow({ rowId: 'k2off', logId: 8004, action: 'KEY_OFF', logTime: new Date('2026-02-09T07:07:00Z'), timestamp: new Date('2026-02-09T07:07:00Z').getTime(), originalLog: { ...base, log_id: 8004, action: 'KEY_OFF' } }); // +7 min
    const wb = await makeSummaryWorkbook([k1on, k1off, k2on, k2off], makeZeroStats());
    const sheet = wb.getWorksheet('Logs Grouped');
    // 4 data rows → summary at row 6
    const lastRow = sheet!.rowCount; // summary is always last+2
    let summaryRowNum = -1;
    for (let r = 2; r <= lastRow + 3; r++) {
      if (String(sheet?.getCell(`A${r}`).value ?? '') === 'END SUMMARY') { summaryRowNum = r; break; }
    }
    expect(summaryRowNum).toBeGreaterThan(0);
    const s = summaryRow(sheet, summaryRowNum);
    expect(s.h).toContain('Key: 00:10:00'); // 3+7 = 10 min
  });

  // ── TC-14: KEY_ON without matching KEY_OFF is ignored ──────────────────
  it('TC-14: lone KEY_ON with no KEY_OFF → key time = 00:00:00', async () => {
    const base = makeEventRow().originalLog!;
    const loneKey = makeEventRow({ rowId: 'lone-k', logId: 9010, action: 'KEY_ON', logTime: new Date('2026-02-09T06:00:00Z'), timestamp: new Date('2026-02-09T06:00:00Z').getTime(), originalLog: { ...base, log_id: 9010, action: 'KEY_ON' } });
    const wb = await makeSummaryWorkbook([loneKey], makeZeroStats());
    const sheet = wb.getWorksheet('Logs Grouped');
    let summaryRowNum = -1;
    for (let r = 2; r <= 10; r++) {
      if (String(sheet?.getCell(`A${r}`).value ?? '') === 'END SUMMARY') { summaryRowNum = r; break; }
    }
    const s = summaryRow(sheet, summaryRowNum);
    expect(s.h).toContain('Key: 00:00:00');
  });

  // ── TC-15: Seconds format hh:mm:ss exact ──────────────────────────────
  it('TC-15: cutting = 3661s (1h 1m 1s) → formats as 01:01:01', async () => {
    const stats = { ...makeZeroStats(), totalCuttingSec: 3661 };
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.e).toBe('Cutting: 01:01:01');
  });

  // ── TC-16: Loading stat maps to Loading column F ───────────────────────
  it('TC-16: loading 90s → column F shows Loading: 00:01:30', async () => {
    const stats = { ...makeZeroStats(), totalLoadingUnloadingSec: 90 };
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.f).toBe('Loading: 00:01:30');
  });

  // ── TC-17: Full realistic — 3 spindle jobs + 1 pause + loading + key ───
  it('TC-17: full realistic scenario → all columns independently correct', async () => {
    // Stats: 3 jobs × 600s cutting = 1800s, 120s loading, 300s pause
    // Input window: 3600s (1h)
    const stats: ReportStats = {
      ...makeZeroStats(),
      totalCuttingSec: 1800,
      totalLoadingUnloadingSec: 120,
      totalPauseSec: 300,
      totalWoDurationSec: 3600,
    };
    // Add a KEY pair: 2min
    const base = makeEventRow().originalLog!;
    const kon = makeEventRow({ rowId: 'tc17-kon', logId: 7701, action: 'KEY_ON', logTime: new Date('2026-02-09T06:00:00Z'), timestamp: new Date('2026-02-09T06:00:00Z').getTime(), originalLog: { ...base, log_id: 7701, action: 'KEY_ON' } });
    const koff = makeEventRow({ rowId: 'tc17-koff', logId: 7702, action: 'KEY_OFF', logTime: new Date('2026-02-09T06:02:00Z'), timestamp: new Date('2026-02-09T06:02:00Z').getTime(), originalLog: { ...base, log_id: 7702, action: 'KEY_OFF' } });
    const wb = await makeSummaryWorkbook([kon, koff], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    let summaryRowNum = -1;
    for (let r = 2; r <= 10; r++) {
      if (String(sheet?.getCell(`A${r}`).value ?? '') === 'END SUMMARY') { summaryRowNum = r; break; }
    }
    expect(summaryRowNum).toBeGreaterThan(0);
    const s = summaryRow(sheet, summaryRowNum);
    // cutting=1800, loading=120, pause=300, key=120 → cls=2340s=00:39:00
    expect(s.e).toBe('Cutting: 00:30:00');
    expect(s.f).toBe('Loading: 00:02:00');
    expect(s.g).toBe('Pause: 00:05:00');
    expect(s.h).toContain('Key: 00:02:00');
    expect(s.h).toContain('Cls: 00:39:00');
    // input=3600, classified=2340 → rem=1260s=00:21:00
    expect(s.h).toContain('Rem: 00:21:00');
    expect(s.i).toBe('CHECK');
  });

  // ── TC-18: Status = OK when remainder exactly 0 ───────────────────────
  it('TC-18: remainder exactly 0 → status cell = OK', async () => {
    // cutting=200, loading=0, pause=0, key=0, woDuration=200
    const stats = { ...makeZeroStats(), totalCuttingSec: 200, totalWoDurationSec: 200 };
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.i).toBe('OK');
  });

  // ── TC-19: Status = CHECK when remainder ≠ 0 ─────────────────────────
  it('TC-19: remainder ≠ 0 → status cell = CHECK', async () => {
    const stats = { ...makeZeroStats(), totalCuttingSec: 100, totalWoDurationSec: 500 };
    const wb = await makeSummaryWorkbook([], stats);
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.i).toBe('CHECK');
  });

  // ── TC-20: Column label text verification ────────────────────────────
  it('TC-20: summary row column labels start with correct prefixes', async () => {
    const wb = await makeSummaryWorkbook([], makeZeroStats(), {
      deviceId: 1,
      startDate: '09-02-2026 10:00',  // DD-MM-YYYY HH:MM format
      endDate: '09-02-2026 11:00',
    });
    const sheet = wb.getWorksheet('Logs Grouped');
    const s = summaryRow(sheet, 3);
    expect(s.a).toBe('END SUMMARY');
    expect(s.b).toBe('RPT');
    expect(s.d).toMatch(/^Input Total:/);
    expect(s.e).toMatch(/^Cutting:/);
    expect(s.f).toMatch(/^Loading:/);
    expect(s.g).toMatch(/^Pause:/);
    expect(s.h).toMatch(/^Key:.*\| Cls:.*\| Rem:/);
  });
});

describe('pdf pagination helpers', () => {
  it('splits total height into fixed-size slices and remainder', () => {
    expect(computePdfPageSlices(2500, 1000)).toEqual([
      { offsetPx: 0, heightPx: 1000 },
      { offsetPx: 1000, heightPx: 1000 },
      { offsetPx: 2000, heightPx: 500 },
    ]);
  });

  it('returns empty slices for invalid inputs', () => {
    expect(computePdfPageSlices(0, 1000)).toEqual([]);
    expect(computePdfPageSlices(1000, 0)).toEqual([]);
    expect(computePdfCanvasSlices(0, 4000, 200, 120)).toEqual([]);
    expect(computePdfCanvasSlices(2000, 0, 200, 120)).toEqual([]);
    expect(computePdfCanvasSlices(2000, 4000, 0, 120)).toEqual([]);
    expect(computePdfCanvasSlices(2000, 4000, 200, 0)).toEqual([]);
  });

  it('converts canvas dimensions to page slices using mm page content', () => {
    // pxPerMm = 2000 / 200 = 10, so one page content height is 120mm -> 1200px.
    expect(computePdfCanvasSlices(2000, 4100, 200, 120)).toEqual([
      { offsetPx: 0, heightPx: 1200 },
      { offsetPx: 1200, heightPx: 1200 },
      { offsetPx: 2400, heightPx: 1200 },
      { offsetPx: 3600, heightPx: 500 },
    ]);
  });
});
