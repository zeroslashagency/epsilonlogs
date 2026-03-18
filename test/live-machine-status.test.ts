import { describe, expect, it } from "vitest";
import {
  buildMachineErrorSnapshot,
  buildMachineSnapshot,
} from "../src/hub-v2/live-machine-status";
import type { DeviceLogEntry } from "../src/report/report-types";

function makeLog(overrides: Partial<DeviceLogEntry> = {}): DeviceLogEntry {
  return {
    log_id: 101,
    log_time: "2026-03-17T08:00:00Z",
    action: "SPINDLE_ON",
    wo_id: 2893,
    device_id: 11,
    job_type: 1,
    start_name: "Athul",
    ...overrides,
  };
}

describe("live machine status", () => {
  it("marks recent spindle activity as live", () => {
    const snapshot = buildMachineSnapshot({
      machineId: 11,
      logs: [makeLog()],
      now: new Date("2026-03-17T08:10:00Z").getTime(),
    });

    expect(snapshot.status).toBe("LIVE");
    expect(snapshot.currentWoId).toBe("2893");
    expect(snapshot.jobTypeLabel).toBe("Production");
  });

  it("marks setting jobs as setting", () => {
    const snapshot = buildMachineSnapshot({
      machineId: 12,
      logs: [
        makeLog({
          device_id: 12,
          job_type: 2,
          action: "WO_START",
        }),
      ],
      now: new Date("2026-03-17T08:20:00Z").getTime(),
    });

    expect(snapshot.status).toBe("SETTING");
    expect(snapshot.statusLabel).toBe("Setting");
  });

  it("marks maintenance jobs as maintenance", () => {
    const snapshot = buildMachineSnapshot({
      machineId: 13,
      logs: [
        makeLog({
          device_id: 13,
          job_type: 4,
          action: "WO_START",
        }),
      ],
      now: new Date("2026-03-17T08:20:00Z").getTime(),
    });

    expect(snapshot.status).toBe("MAINTENANCE");
  });

  it("marks stale logs as offline", () => {
    const snapshot = buildMachineSnapshot({
      machineId: 14,
      logs: [
        makeLog({
          device_id: 14,
          log_time: "2026-03-17T01:00:00Z",
          action: "WO_STOP",
        }),
      ],
      now: new Date("2026-03-17T08:20:00Z").getTime(),
    });

    expect(snapshot.status).toBe("OFFLINE");
  });

  it("creates error snapshots for failed requests", () => {
    const snapshot = buildMachineErrorSnapshot(18, "Gateway timeout");

    expect(snapshot.status).toBe("ERROR");
    expect(snapshot.errorMessage).toContain("Gateway timeout");
  });
});
