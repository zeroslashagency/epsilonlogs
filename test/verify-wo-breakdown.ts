
import { buildReport } from "../src/report/report-builder";
import { DeviceLogEntry, ReportConfig, WoDetails } from "../src/report/report-types";
import assert from "assert";

console.log("Starting Verification for WO Breakdown...");

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

// TEST: Check Job Type in Breakdown
console.log("\nTEST: Job Type Population in WoBreakdown");
{
    const logs: DeviceLogEntry[] = [
        createLog(1, "2026-02-18T10:00:00Z", "WO_START", 101, 1), // Production
        createLog(2, "2026-02-18T10:05:00Z", "WO_STOP", 101),

        createLog(10, "2026-02-18T11:00:00Z", "WO_START", 102, 2), // Setting
        createLog(11, "2026-02-18T11:15:00Z", "WO_STOP", 102)
    ];

    const woDetails = new Map<number, WoDetails>();
    woDetails.set(101, {
        id: 101, wo_id_str: "101", part_no: "P1",
        pcl: 60, start_time: "2026-02-18T10:00:00Z", end_time: "2026-02-18T10:05:00Z",
        duration: 300, alloted_qty: 10, ok_qty: 2, reject_qty: 0,
        device_id: 1, setting: "OldSettingValue", start_name: "Op1", stop_name: "Op1",
        start_comment: "", stop_comment: "", extensions: [],
        start_uid: null, stop_uid: null
    });
    woDetails.set(102, {
        id: 102, wo_id_str: "102", part_no: "S1",
        pcl: null, start_time: "2026-02-18T11:00:00Z", end_time: "2026-02-18T11:15:00Z",
        duration: 900, alloted_qty: 0, ok_qty: 0, reject_qty: 0,
        device_id: 1, setting: "OldSettingValue", start_name: "Op1", stop_name: "Op1",
        start_comment: "", stop_comment: "", extensions: [],
        start_uid: null, stop_uid: null
    });

    const report = buildReport(logs, woDetails, config);
    const breakdowns = report.stats.woBreakdowns;

    console.log(`- Breakdowns found: ${breakdowns.length}`);
    assert.strictEqual(breakdowns.length, 2);

    const prod = breakdowns.find(b => b.woId === "101");
    console.log(`- Prod Job Type: ${prod?.jobType}`);
    assert.strictEqual(prod?.jobType, "Production");

    const setting = breakdowns.find(b => b.woId === "102");
    console.log(`- Setting Job Type: ${setting?.jobType}`);
    assert.strictEqual(setting?.jobType, "Setting");

    console.log("✅ Passed");
}
