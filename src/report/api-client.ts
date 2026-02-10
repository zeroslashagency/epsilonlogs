import { DeviceLogApiResponse, DeviceLogEntry, ReportConfig, WoDetails } from "./report-types";

const API_BASE_URL = "/api/v2";

interface DevicesApiResponse {
    success: boolean;
    result?: {
        devices?: Array<{
            id?: number;
            name?: string;
        }>;
    };
}

/**
 * Fetches ALL pages of device logs for the given config.
 */
export async function fetchDeviceLogs(
    config: ReportConfig,
    token: string
): Promise<DeviceLogEntry[]> {
    const { deviceId, startDate, endDate } = config;
    const allLogs: DeviceLogEntry[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
        const params = new URLSearchParams({
            start_date: startDate,
            end_date: endDate,
            device_id: deviceId.toString(),
            page: currentPage.toString(),
        });

        const url = `${API_BASE_URL}/device-log?${params.toString()}`;
        console.log(`Fetching device logs page ${currentPage}: ${url}`);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Device Log API Error: ${response.status} ${response.statusText}`);
        }

        const json: DeviceLogApiResponse = await response.json();

        if (!json.success || !json.result || !json.result.logs) {
            throw new Error(json.error?.message || "Failed to fetch device logs");
        }

        allLogs.push(...json.result.logs);

        if (json.result.pagination) {
            totalPages = json.result.pagination.total_pages;
            currentPage = json.result.pagination.current_page + 1;
        } else {
            break; // no pagination info, assume single page
        }
    } while (currentPage <= totalPages);

    console.log(`Fetched ${allLogs.length} total logs across ${totalPages} page(s)`);
    return allLogs;
}

export async function fetchWoDetails(
    woId: number,
    token: string
): Promise<WoDetails | null> {
    const url = `${API_BASE_URL}/wo/${woId}`;

    try {
        const response = await fetch(url, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!response.ok) {
            console.warn(`Failed to fetch WO ${woId}: ${response.status}`);
            return null;
        }

        const json = await response.json();

        if (!json.success || !json.result?.wo) {
            return null;
        }

        const wo = json.result.wo;
        const extensions = json.result.extensions || [];

        return {
            id: wo.id || 0,
            pcl: wo.pcl || null,
            start_time: wo.start_time || null,
            end_time: wo.end_time || null,
            start_uid: wo.start_uid || null,
            stop_uid: wo.stop_uid || null,
            extensions: extensions.map((ext: any) => ({
                id: ext.id || 0,
                wo_id: ext.wo_id || woId,
                extension_time: ext.extension_time || null,
                extension_comment: ext.extension_comment || null,
                extension_duration: ext.extension_duration || 0,
            })),
            // Additional fields for UI
            wo_id_str: String(wo.wo_id || woId),
            part_no: wo.part_no || "",
            start_name: wo.start_name || "",
            stop_name: wo.stop_name || "",
            start_comment: wo.start_comment || wo.start_remarks || wo.start_reason || "",
            stop_comment: wo.stop_comment || wo.stop_remarks || wo.stop_reason || "",
            setting: wo.setting || "",
            alloted_qty: wo.alloted_qty || 0,
            ok_qty: wo.ok_qty || 0,
            reject_qty: wo.reject_qty || 0,
            device_id: wo.device_id || 0,
            duration: wo.duration || 0,
        };

    } catch (error) {
        console.error(`Error fetching WO ${woId}:`, error);
        return null;
    }
}

export async function fetchAllWoDetails(
    woIds: number[],
    token: string
): Promise<Map<number, WoDetails>> {
    const uniqueIds = [...new Set(woIds)];
    const results = new Map<number, WoDetails>();

    const BATCH_SIZE = 3;
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + BATCH_SIZE);
        const promises = batch.map(id => fetchWoDetails(id, token));
        const responses = await Promise.all(promises);

        responses.forEach((wo: WoDetails | null, index: number) => {
            if (wo) {
                results.set(batch[index]!, wo);
            }
        });
    }

    return results;
}

export async function fetchDeviceNameMap(token: string): Promise<Map<number, string>> {
    const url = `${API_BASE_URL}/devices`;

    try {
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            console.warn(`Failed to fetch devices: ${response.status} ${response.statusText}`);
            return new Map();
        }

        const json: DevicesApiResponse = await response.json();
        if (!json.success || !json.result?.devices) {
            return new Map();
        }

        const nameMap = new Map<number, string>();
        for (const device of json.result.devices) {
            if (typeof device.id === "number" && typeof device.name === "string" && device.name.trim()) {
                nameMap.set(device.id, device.name.trim());
            }
        }

        return nameMap;
    } catch (error) {
        console.warn("Failed to fetch device names:", error);
        return new Map();
    }
}

export function formatDateForApi(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}
