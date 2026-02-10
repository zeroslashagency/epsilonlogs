import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportRow } from './report-types.js';

/**
 * Common formatting for Excel and PDF exports
 */
function prepareExportData(rows: ReportRow[]) {
    return rows.map(row => {
        // Format WO Specs
        let woSpecsStr = '';
        if (row.woSpecs) {
            woSpecsStr = `WO: ${row.woSpecs.woId}\nPCL: ${row.woSpecs.pclText}\nAllot: ${row.woSpecs.allotted}`;
        }

        // Handle Banner Text
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

export function exportToExcel(rows: ReportRow[], filename: string = 'device_report.xlsx') {
    const data = prepareExportData(rows);
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

    // Auto-size columns (rough estimate)
    const maxWidths = data.reduce((acc: any, row) => {
        Object.keys(row).forEach((key, i) => {
            const val = String((row as any)[key]);
            acc[i] = Math.max(acc[i] || 10, val.length + 2);
        });
        return acc;
    }, []);
    worksheet['!cols'] = maxWidths.map((w: number) => ({ wch: Math.min(w, 50) }));

    XLSX.writeFile(workbook, filename);
}

export function exportToPDF(rows: ReportRow[], filename: string = 'device_report.pdf') {
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape A4
    const data = prepareExportData(rows);

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

    autoTable(doc, {
        head: headers,
        body: body,
        startY: 25,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillStyle: 'F', fillColor: [30, 41, 59] }, // Slate-800
        columnStyles: {
            0: { cellWidth: 10 }, // S.No
            1: { cellWidth: 15 }, // Log ID
            2: { cellWidth: 35 }, // Log Time
            3: { cellWidth: 20 }, // Action
            4: { cellWidth: 20 }, // Duration
            5: { cellWidth: 20 }, // Label
            6: { cellWidth: 30 }, // WO Specs
            7: { cellWidth: 'auto' }, // Summary
            8: { cellWidth: 20 }, // Job Type
            9: { cellWidth: 25 }  // Operator
        },
        didParseCell: (_data: any) => {
            // Apply background colors to Job Blocks if we had that info here? 
            // In prepareExportData we lost the 'isInBlock' flag. 
            // We could re-check the original rows if needed.
        }
    });

    doc.save(filename);
}
