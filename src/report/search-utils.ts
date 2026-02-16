import { ReportRow } from "./report-types";

/**
 * Normalizes text for case-insensitive substrings matching.
 * Removes extra spaces and converts to lowercase.
 */
export function normalizeText(text: string | undefined | null): string {
    if (!text) return "";
    return text.toString().toLowerCase().trim();
}

/**
 * Checks if a ReportRow matches a search query.
 * Matches against Operator Name, WO ID, and Job Type.
 * 
 * @param row The report row to check
 * @param query The search query string
 * @returns true if the row matches or if query is empty
 */
export function matchRow(row: ReportRow, query: string): boolean {
    if (!query || query.trim() === "") return true;

    const normalizedQuery = normalizeText(query);
    const tokens = normalizedQuery.split(" ").filter(t => t.length > 0);

    // Helper to check if ANY token matches the target text
    const matches = (target: string | undefined | null) => {
        if (!target) return false;
        const normTarget = normalizeText(target);
        // AND logic: all tokens must be present in the target (or across targets? usually single text field)
        // Let's stick to simple substring match for now as per PRD "substring match"
        // But if user types "John 306", they might expect John AND 306.
        // For simplicity in V1, let's check if the FULL query is a substring of ANY field
        // OR if individual tokens are found? 
        // PRD says: "substring match (e.g., 'pra' matches 'Prabhu')"
        // Let's use simple substring match of the whole query first.
        return normTarget.includes(normalizedQuery);
    };

    // 1. Check Operator Name (Top level)
    if (matches(row.operatorName)) return true;

    // 2. Check WO Specs (WO ID)
    if (row.woSpecs && matches(row.woSpecs.woId)) return true;

    // 3. Check WO Header Data
    if (row.isWoHeader && row.woHeaderData) {
        if (matches(row.woHeaderData.operatorName)) return true;
        if (matches(row.woHeaderData.woIdStr)) return true;
        if (matches(row.woHeaderData.partNo)) return true;
    }

    // 4. Check WO Summary Data
    if (row.isWoSummary && row.woSummaryData) {
        if (matches(row.woSummaryData.operatorName)) return true;
        if (matches(row.woSummaryData.woIdStr)) return true;
        if (matches(row.woSummaryData.partNo)) return true;
    }

    // 5. Check Job Type
    if (matches(row.jobType)) return true;

    // 6. Check Start/Stop Row Data (Part No, Operator is usually top-level)
    if (row.startRowData) {
        if (matches(row.startRowData.partNo)) return true;
        if (matches(row.startRowData.comment)) return true;
    }

    // 7. Check original log for deep search (optional, but robust)
    // row.originalLog?.wo_id (number) -> string
    if (row.originalLog) {
        if (matches(String(row.originalLog.wo_id))) return true;
        // Any specific fields from original log we missed?
    }

    return false;
}
