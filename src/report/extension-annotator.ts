import { ReportRow, WoDetails } from "./report-types";

/**
 * Matches WO extension comments to the nearest row by timestamp.
 */
export function annotateExtensions(rows: ReportRow[], woDetails: WoDetails): ReportRow[] {
    if (!woDetails.extensions || woDetails.extensions.length === 0) return rows;

    for (const ext of woDetails.extensions) {
        if (!ext.extension_time || !ext.extension_comment) continue;

        const extTs = new Date(ext.extension_time).getTime();

        // Find closest row
        let closestRow: ReportRow | null = null;
        let minDiff = Infinity;

        for (const row of rows) {
            const diff = Math.abs(row.timestamp - extTs);
            if (diff < minDiff) {
                minDiff = diff;
                closestRow = row;
            }
        }

        // Match within 5 minutes
        if (closestRow && minDiff < 300000) {
            const comment = ext.extension_comment;
            if (closestRow.summary) {
                closestRow.summary += ` (${comment})`;
            } else {
                closestRow.summary = comment;
            }
        }
    }

    return rows;
}
