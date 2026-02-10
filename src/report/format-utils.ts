export function formatDuration(sec: number | null): string {
    if (sec === null || sec === undefined) return "-";

    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);

    if (m > 0) return `${m} min ${s} sec`;
    return `${s} sec`;
}

export function formatLogTime(date: Date): string {
    // DD/MM/YYYY, HH:MM:SS
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    return `${dd}/${mm}/${yyyy}, ${hh}:${min}:${ss}`;
}

export function formatVariance(diffSec: number | null): { text: string; color: "red" | "green" | "neutral" } {
    if (diffSec === null) return { text: "-", color: "neutral" };

    const abs = Math.round(Math.abs(diffSec));

    if (diffSec > 0) return { text: `${abs} sec excess`, color: "red" };
    if (diffSec < 0) return { text: `${abs} sec lower`, color: "green" };
    return { text: "0 sec", color: "neutral" };
}
