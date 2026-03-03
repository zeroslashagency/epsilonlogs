
import { buildReport } from "../src/report/report-builder";
import { DeviceLogEntry, ReportConfig, WoDetails } from "../src/report/report-types";
import assert from "assert";

console.log("Starting Verification...");

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

// TEST 1: Production Job
console.log("\nTEST 1: Production Job (Type 1)");
{
    const logs: DeviceLogEntry[] = [
        createLog(1, "2026-02-18T10:00:00Z", "WO_START", 101, 1),
        createLog(2, "2026-02-18T10:01:00Z", "SPINDLE_ON", 101),
        createLog(3, "2026-02-18T10:02:00Z", "SPINDLE_OFF", 101),
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
    const jobRows = report.rows.filter(r => r.isJobBlock);

    console.log(`- Job rows found: ${jobRows.length}`);
    assert.strictEqual(jobRows.length, 4, "Should have 4 rows (2 cycles * 2 rows)");
    console.log("✅ Passed Production Test");
}

// TEST 2: Setting Job
console.log("\nTEST 2: Setting Job (Type 2)");
{
    const logs: DeviceLogEntry[] = [
        createLog(10, "2026-02-18T11:00:00Z", "WO_START", 102, 2),
        createLog(11, "2026-02-18T11:01:00Z", "SPINDLE_ON", 102),
        createLog(12, "2026-02-18T11:02:00Z", "SPINDLE_OFF", 102),
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
        start_comment: "Setting WO", stop_comment: "", extensions: [],
        start_uid: null, stop_uid: null
    });

    const report = buildReport(logs, woDetails, config);
    const jobRows = report.rows.filter(r => r.isJobBlock);

    console.log(`- Job rows found: ${jobRows.length}`);
    if (jobRows.length > 0) {
        console.log(`- Label: ${jobRows[0].label}`);
        console.log(`- Duration: ${jobRows[0].durationSec}`);
    }

    assert.strictEqual(jobRows.length, 1, "Should have exactly 1 row");
    assert.ok(jobRows[0].label?.includes("SETTING PROCESS"), "Label should indicate Setting");
    assert.strictEqual(jobRows[0].durationSec, 900, "Duration should match WO duration");
    console.log("✅ Passed Setting Test");
}
