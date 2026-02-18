
import { buildGroupedExportRows } from "../src/report/export-utils";
import { DeviceLogEntry, ReportRow, WoDetails } from "../src/report/report-types";
import assert from "assert";

console.log("Starting Verification for Grouped Excel Export...");

// Mock Data
const woDetailsMap = new Map<number, WoDetails>();
woDetailsMap.set(102, {
    id: 102, wo_id_str: "102", part_no: "S1",
    pcl: null, start_time: "2026-02-18T11:00:00Z", end_time: "2026-02-18T11:15:00Z",
    duration: 900, alloted_qty: 0, ok_qty: 0, reject_qty: 0,
    device_id: 1, setting: "OldSettingValue", start_name: "Op1", stop_name: "Op1",
    start_comment: "", stop_comment: "", extensions: [],
    start_uid: null, stop_uid: null, job_type: 2 // Setting
});

const settingRow: ReportRow = {
    rowId: "job-block-102",
    logId: 100, // mock log id
    logTime: new Date("2026-02-18T11:00:00Z"),
    action: "", // Empty action for Block
    label: "SETTING PROCESS",
    durationText: "15 min 0 sec",
    durationSec: 900,
    jobType: "Setting",
    isJobBlock: true,
    jobBlockLabel: "SETTING PROCESS",
    originalLog: {
        log_id: 100, log_time: "2026-02-18T11:00:00Z", action: "WO_START", wo_id: 102, device_id: 1
    } as DeviceLogEntry,
    timestamp: new Date("2026-02-18T11:00:00Z").getTime(),
    operatorName: "Op1"
};

// TEST
console.log("\nTEST: Setting Job Block in Grouped Export (2-Row Format)");
const inputs = [settingRow];
const results = buildGroupedExportRows(inputs, woDetailsMap);

console.log(`- Results found: ${results.length}`);
assert.strictEqual(results.length, 2, "Should have 2 rows (Start and End)");

// Verify Row 1: START
const row1 = results[0].row;
console.log("- Row 1 (Start) Action:", row1.Action);
assert.strictEqual(row1.Action, "SETTING START");
assert.strictEqual(row1.TIME, "");
assert.strictEqual(row1.JOB, "2: Setting");
assert.strictEqual(results[0].style, "jobBlock", "Row 1 should have jobBlock style");

// Verify Row 2: END
const row2 = results[1].row;
console.log("- Row 2 (End) Action:", row2.Action);
assert.strictEqual(row2.Action, "SETTING END");
assert.strictEqual(row2.TIME, "15 min 0 sec");
assert.strictEqual(row2.JOB, "2: Setting");
assert.strictEqual(results[1].style, "jobBlock", "Row 2 should have jobBlock style");

console.log("✅ Passed");
