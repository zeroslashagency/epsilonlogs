import { expect, test } from "vitest";
import { buildReport } from "../src/report/report-builder";
import { DeviceLogEntry, JobType, ReportConfig, WoDetails } from "../src/report/report-types";

const config: ReportConfig = {
    deviceId: 1,
    startDate: "2026-02-18",
    endDate: "2026-02-19",
    toleranceSec: 10
};

function createLog(id: number, time: string, action: string, woId: number, jobType?: string | number): DeviceLogEntry {
    return {
        log_id: id,
        log_time: time,
        action,
        wo_id: woId,
        device_id: 1,
        job_type: jobType !== undefined ? String(jobType) : undefined
    };
}

test("Production Job (Type 1) should be grouped into sub-jobs", () => {
    const logs: DeviceLogEntry[] = [
        createLog(1, "2026-02-18T10:00:00Z", "WO_START", 101, 1),
        // Cycle 1
        createLog(2, "2026-02-18T10:01:00Z", "SPINDLE_ON", 101),
        createLog(3, "2026-02-18T10:02:00Z", "SPINDLE_OFF", 101),
        // Cycle 2
        createLog(4, "2026-02-18T10:03:00Z", "SPINDLE_ON", 101),
        createLog(5, "2026-02-18T10:04:00Z", "SPINDLE_OFF", 101),
        createLog(6, "2026-02-18T10:05:00Z", "WO_STOP", 101)
    ];

    const woDetails = new Map<number, WoDetails>();
    woDetails.set(101, {
        id: 101, wo_id_str: "101", part_no: "P1",
        pcl: 60, start_time: "2026-02-18T10:00:00Z", end_time: "2026-02-18T10:05:00Z",
        duration: 300, alloted_qty: 10, ok_qty: 2, reject_qty: 0,
        device_id: 1, setting: "", start_name: "Op1", stop_name: "Op1",
        start_comment: "", stop_comment: "", extensions: [],
        start_uid: null, stop_uid: null
    });

    const report = buildReport(logs, woDetails, config);

    // Validate
    const jobRows = report.rows.filter(r => r.isJobBlock);
    // Should have 2 pairs of ON/OFF -> 4 rows
    expect(jobRows.length).toBe(4);

    const uniqueLabels = new Set(jobRows.map(r => r.label));
    expect(uniqueLabels.size).toBeGreaterThanOrEqual(1); // Usually JOB - 01 depending on PCL logic
    expect(Array.from(uniqueLabels)[0]).toContain("JOB -");
});

test("Setting Job (Type 2) should NOT be grouped into sub-jobs", () => {
    const logs: DeviceLogEntry[] = [
        createLog(10, "2026-02-18T11:00:00Z", "WO_START", 102, 2), // Job Type 2 = Setting
        // Cycle 1 (should be ignored for grouping)
        createLog(11, "2026-02-18T11:01:00Z", "SPINDLE_ON", 102),
        createLog(12, "2026-02-18T11:02:00Z", "SPINDLE_OFF", 102),
        // Cycle 2
        createLog(13, "2026-02-18T11:03:00Z", "SPINDLE_ON", 102),
        createLog(14, "2026-02-18T11:04:00Z", "SPINDLE_OFF", 102),
        createLog(15, "2026-02-18T11:15:00Z", "WO_STOP", 102)
    ];

    const woDetails = new Map<number, WoDetails>();
    woDetails.set(102, {
        id: 102, wo_id_str: "102", part_no: "SET-01",
        pcl: null, start_time: "2026-02-18T11:00:00Z", end_time: "2026-02-18T11:15:00Z",
        duration: 900, alloted_qty: 0, ok_qty: 0, reject_qty: 0,
        device_id: 1, setting: "Setting", start_name: "Op1", stop_name: "Op1",
        start_comment: "Setting start", stop_comment: "", extensions: [],
        start_uid: null, stop_uid: null
    });

    const report = buildReport(logs, woDetails, config);

    // Validate
    const jobRows = report.rows.filter(r => r.isJobBlock);

    // Should have EXACTLY 1 row for the block
    expect(jobRows.length).toBe(1);

    const row = jobRows[0];
    expect(row!.label).toContain("SETTING PROCESS");
    expect(row!.durationSec).toBe(900); // Full WO duration
});
