import { expect, test } from "vitest";
import { buildReport } from "../src/report/report-builder";
import { DeviceLogEntry, ReportConfig, WoDetails } from "../src/report/report-types";

const config: ReportConfig = {
    deviceId: 15,
    startDate: "01-03-2026 11:00",
    endDate: "04-03-2026 17:00",
    toleranceSec: 10
};

function createLog(id: number, time: string, action: string, woId: number, jobType?: number): DeviceLogEntry {
    return {
        log_id: id,
        log_time: time,
        action,
        wo_id: woId,
        device_id: 15,
        job_type: jobType !== undefined ? jobType : undefined
    };
}

test("Production WO with NO spindle events should use estimated jobs", () => {
    // Simulate Device 15: only WO_START, WO_PAUSE, WO_RESUME, WO_STOP — NO SPINDLE
    const logs: DeviceLogEntry[] = [
        createLog(9409, "2026-03-02T04:03:32Z", "WO_START", 412, 1),
        createLog(9410, "2026-03-02T04:25:02Z", "WO_PAUSE", 412),
        createLog(9411, "2026-03-02T04:30:13Z", "WO_RESUME", 412),
        createLog(9412, "2026-03-02T04:53:26Z", "WO_PAUSE", 412),
        createLog(9413, "2026-03-02T05:04:03Z", "WO_RESUME", 412),
        createLog(9422, "2026-03-02T08:33:39Z", "WO_STOP", 412),
    ];

    const woDetails = new Map<number, WoDetails>();
    woDetails.set(412, {
        id: 412, wo_id_str: "2426", part_no: "LH044",
        pcl: 1200, start_time: "2026-03-02T04:03:27Z", end_time: "2026-03-02T08:33:39Z",
        duration: 16212, alloted_qty: 80, ok_qty: 80, reject_qty: 0,
        device_id: 15, setting: "SETTING -1", start_name: "RamaKrishnan", stop_name: "RamaKrishnan",
        start_comment: "Start", stop_comment: "Shift complete", extensions: [],
        start_uid: 12, stop_uid: 12
    });

    const report = buildReport(logs, woDetails, config);

    // Should have estimated jobs (ok_qty=80)
    expect(report.stats.totalJobs).toBeGreaterThan(0);
    expect(report.stats.totalCycles).toBe(80);
    expect(report.stats.totalCuttingSec).toBeGreaterThan(0);

    // Verify estimated rows exist
    const estimatedRows = report.rows.filter(r => r.isEstimated);
    expect(estimatedRows.length).toBeGreaterThan(0);
    expect(estimatedRows[0]?.summary).toContain("Estimated");
});

test("Setting WO still works as single block (unchanged behavior)", () => {
    const logs: DeviceLogEntry[] = [
        createLog(9425, "2026-03-02T08:59:20Z", "WO_START", 414, 2),
        createLog(9426, "2026-03-02T10:33:34Z", "WO_STOP", 414),
    ];

    const woDetails = new Map<number, WoDetails>();
    woDetails.set(414, {
        id: 414, wo_id_str: "2976", part_no: "LH142",
        pcl: null, start_time: "2026-03-02T08:59:15Z", end_time: "2026-03-02T10:33:34Z",
        duration: 5659, alloted_qty: 8, ok_qty: 8, reject_qty: 0,
        device_id: 15, setting: "SETTING -1", start_name: "PALANISAMY", stop_name: "PALANISAMY",
        start_comment: "Setting", stop_comment: "Complete", extensions: [],
        start_uid: 26, stop_uid: 26
    });

    const report = buildReport(logs, woDetails, config);

    const jobRows = report.rows.filter(r => r.isJobBlock);
    expect(jobRows.length).toBe(1);
    expect(jobRows[0]!.label).toContain("SETTING PROCESS");
    expect(jobRows[0]!.durationSec).toBe(5659);
});

test("MTR_ON / MTR_OFF should create a Maintenance segment", () => {
    const logs: DeviceLogEntry[] = [
        createLog(9407, "2026-03-02T01:07:30Z", "MTR_ON", 116, 4),
        createLog(9408, "2026-03-02T04:01:38Z", "MTR_OFF", 116, 4),
    ];

    const woDetails = new Map<number, WoDetails>();
    woDetails.set(116, {
        id: 116, wo_id_str: "0000", part_no: "Fixer",
        pcl: null, start_time: "2026-01-10T10:37:02Z", end_time: "2026-01-10T10:51:48Z",
        duration: 886, alloted_qty: 1, ok_qty: 1, reject_qty: 0,
        device_id: 15, setting: "SETTING -1", start_name: "RamaKrishnan", stop_name: "RamaKrishnan",
        start_comment: "Settling job", stop_comment: "Setting job", extensions: [],
        start_uid: 12, stop_uid: 12
    });

    const report = buildReport(logs, woDetails, config);

    // Should create a Maintenance block
    const jobRows = report.rows.filter(r => r.isJobBlock);
    expect(jobRows.length).toBe(1);
    expect(jobRows[0]!.label).toContain("MAINTENANCE PROCESS");
});

// ────────────────────────────────────────────────────────────────────────────
// REGRESSION: ESTIMATED row operator + S.No bug
// woDetails.start_name (DB-registered) vs WO_START log's start_name (on-day)
// ────────────────────────────────────────────────────────────────────────────

function makeEstimatedScenario() {
    // Same WO created by RamaKrishnan in DB, but PRADEEP RAJ operated the machine
    const logs: DeviceLogEntry[] = [
        {
            log_id: 9461,
            log_time: "2026-03-03T08:47:43Z",
            action: "WO_START",
            wo_id: 415,
            device_id: 15,
            job_type: 1,
            start_name: "PRADEEP RAJ",
        } as DeviceLogEntry,
        {
            log_id: 9466,
            log_time: "2026-03-03T16:12:53Z",
            action: "WO_STOP",
            wo_id: 415,
            device_id: 15,
        } as DeviceLogEntry,
    ];
    const woDetails = new Map<number, WoDetails>();
    woDetails.set(415, {
        id: 415, wo_id_str: "2426", part_no: "LH044",
        pcl: 1200,
        start_time: "2026-03-03T08:47:43Z", end_time: "2026-03-03T16:12:53Z",
        duration: 26830, alloted_qty: 152, ok_qty: 152, reject_qty: 0,
        device_id: 15, setting: "SETTING -1",
        start_name: "RamaKrishnan",  // DB name — should NOT appear on ESTIMATED rows
        stop_name: "RamaKrishnan",
        start_comment: "Start", stop_comment: "Shift complete",
        extensions: [], start_uid: 12, stop_uid: 12,
    });
    return { logs, woDetails };
}

test("ESTIMATED rows resolve OP from WO_START log, not woDetails.start_name", () => {
    const { logs, woDetails } = makeEstimatedScenario();
    const report = buildReport(logs, woDetails, config);

    const estimated = report.rows.filter(r => r.isEstimated);
    expect(estimated.length).toBeGreaterThan(0);

    for (const row of estimated) {
        // export-utils resolves OP as: originalLog.start_name || row.operatorName
        const resolvedOp = row.originalLog?.start_name || row.operatorName;
        expect(resolvedOp).toBe("PRADEEP RAJ");
        expect(resolvedOp).not.toBe("RamaKrishnan");
    }
});

test("ESTIMATED rows have no logId so S.No is blank in the export", () => {
    const { logs, woDetails } = makeEstimatedScenario();
    const report = buildReport(logs, woDetails, config);

    const estimated = report.rows.filter(r => r.isEstimated);
    expect(estimated.length).toBeGreaterThan(0);

    for (const row of estimated) {
        expect(row.logId).toBeUndefined();
    }

    // WO_START row must still carry its real logId
    const woStartRow = report.rows.find(r => r.action === "WO_START");
    expect(woStartRow?.logId).toBe(9461);
});
