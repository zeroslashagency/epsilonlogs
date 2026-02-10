import { buildReport } from './report-builder';
import { DeviceLogEntry, ReportConfig, WoDetails } from './report-types';
import { formatDuration } from './format-utils';

// Mock Data based on the Plan's Verification Case
// WO 306, Device 15
// PCL = 705 seconds (11m 45s) -> Wait, if output is "5 sec excess", implies total was 710s.
// Let's assume PCL is X.
// The Plan said: "JOB - 01: ~11m 45s total → '5 sec excess' (red)"
// If Total = 11m 45s = 705s.
// If it says "5 sec excess", then PCL must be 700s (11m 40s).
// Let's use PCL = 700s.

const MOCK_WO_DETAILS: WoDetails = {
    id: 306,
    pcl: 700,
    start_time: "2026-02-09T08:00:00",
    end_time: null,
    start_uid: 12,
    stop_uid: 12,
    extensions: [],
    wo_id_str: "2893",
    part_no: "E-MET 002",
    start_name: "RamaKrishnan",
    stop_name: "RamaKrishnan",
    start_comment: "Machine running",
    stop_comment: "",
    setting: "SETTING -1",
    alloted_qty: 75,
    ok_qty: 75,
    reject_qty: 0,
    device_id: 15,
    duration: 3600,
};

const MOCK_CONFIG: ReportConfig = {
    deviceId: 15,
    startDate: "09-02-2026 08:00",
    endDate: "09-02-2026 09:00",
    toleranceSec: 10
};

// Generate logs for JOB 01 to match ~705s total
// Cycle 1: 300s
// Cycle 2: 405s
// Total: 705s. Variance: +5s.
const START_TIME = new Date("2026-02-09T08:00:00").getTime();

const MOCK_LOGS: DeviceLogEntry[] = [
    { log_id: 1, log_time: new Date(START_TIME).toISOString(), action: "WO_START", wo_id: 306, device_id: 15 },

    // Ideal Time Gap: 56s
    // First ON at 08:00:56
    { log_id: 2, log_time: new Date(START_TIME + 56000).toISOString(), action: "SPINDLE_ON", wo_id: 306, device_id: 15 },
    { log_id: 3, log_time: new Date(START_TIME + 56000 + 300000).toISOString(), action: "SPINDLE_OFF", wo_id: 306, device_id: 15 }, // 300s duration

    // Loading Time Gap: 20s
    { log_id: 4, log_time: new Date(START_TIME + 56000 + 300000 + 20000).toISOString(), action: "SPINDLE_ON", wo_id: 306, device_id: 15 },
    { log_id: 5, log_time: new Date(START_TIME + 56000 + 300000 + 20000 + 405000).toISOString(), action: "SPINDLE_OFF", wo_id: 306, device_id: 15 }, // 405s duration

    // Total job time: 300 + 405 = 705s. PCL 700. Variance +5.

    // JOB 02 (Single cycle?)
    // Loading gap: 100s
    { log_id: 6, log_time: new Date(START_TIME + 1000000).toISOString(), action: "SPINDLE_ON", wo_id: 306, device_id: 15 },
    { log_id: 7, log_time: new Date(START_TIME + 1000000 + 720000).toISOString(), action: "SPINDLE_OFF", wo_id: 306, device_id: 15 }, // 720s (12m). Excess 20s.
];

async function runVerification() {
    console.log("Running Verification for WO 306...");

    const woMap = new Map<number, WoDetails>();
    woMap.set(306, MOCK_WO_DETAILS);

    const { rows, stats } = buildReport(MOCK_LOGS, woMap, MOCK_CONFIG);

    console.log("STATS:", JSON.stringify(stats, null, 2));

    // Assertions
    const idealRow = rows.find(r => r.label === "Ideal Time");
    console.log("Ideal Time Row:", idealRow?.durationText); // Expect 56 sec or similar

    const job1Rows = rows.filter(r => r.label === "JOB - 01");
    // Should have 4 rows (ON, OFF, ON, OFF)
    console.log("JOB - 01 Row Count:", job1Rows.length);

    // Check first loading time
    const loadRow = rows.find(r => r.label === "Loading /Unloading Time");
    console.log("Loading Row:", loadRow?.durationText); // Expect 20 sec

    // Check Variance on last ON row of JOB 01
    // Timestamps are sorted reverse, so "last" cycle in time is "first" in rows list?
    // rows are sorted desc timestamp.
    // JOB 01 ends at (Start + 56s + 300s + 20s + 405s) = Start + 781s.
    // That OFF row is topmost of JOB 01.

    // Find JOB 01 rows
    const job1 = rows.filter(r => r.label === "JOB - 01");

    // The "Summary" with Total Time should be on the OFF row of the last cycle.
    // The "Summary" with Variance should be on the ON row of the last cycle.

    // Latest timestamp should be the OFF row of 2nd cycle.
    const lastOff = job1.find(r => r.action === "SPINDLE_OFF" && r.logId === 5);
    console.log("JOB 01 Total Time (on last OFF):", lastOff?.summary); // Expect "11 min 45 sec"

    const lastOn = job1.find(r => r.action === "SPINDLE_ON" && r.logId === 4);
    console.log("JOB 01 Variance (on last ON):", lastOn?.summary); // Expect "5 sec excess"
    console.log("JOB 01 Variance Color:", lastOn?.varianceColor); // Expect "red"

    // Print simplified table
    console.table(rows.map(r => ({
        SNo: r.sNo,
        Time: r.logTime.toISOString().split('T')[1]?.substring(0, 8),
        Action: r.action,
        Duration: r.durationText,
        Label: r.label,
        Summary: r.summary
    })).reverse()); // Print in chronological for readability? No, report is reverse.
}

runVerification().catch(console.error);
