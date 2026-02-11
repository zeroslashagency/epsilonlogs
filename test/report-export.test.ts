import { describe, expect, it } from 'vitest';
import {
  LOG_SHEET_HEADERS,
  LOG_STYLE_COLORS,
  buildExcelWorkbook,
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
