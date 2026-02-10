export function formatDuration(sec: number | null): string {
    if (sec === null || sec === undefined) return "-";

    // Handle negative values by using absolute value, but typically durations are positive.
    // Variances might pass negative, but we usually format absolute value for variance text.
    const absSec = Math.abs(sec);

    if (absSec < 60) {
        return `${Math.round(absSec)}s`;
    }

    if (absSec < 3600) {
        const m = Math.floor(absSec / 60);
        const s = Math.round(absSec % 60);
        return `${m}m ${s}s`;
    }

    if (absSec < 86400) {
        const h = Math.floor(absSec / 3600);
        const m = Math.floor((absSec % 3600) / 60);
        const s = Math.round(absSec % 60);
        return `${h}h ${m}m ${s}s`;
    }

    // Days
    const d = Math.floor(absSec / 86400);
    const h = Math.floor((absSec % 86400) / 3600);
    const m = Math.floor((absSec % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
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

    const abs = Math.abs(diffSec);
    const formatted = formatDuration(abs);

    if (diffSec > 0) return { text: `${formatted} excess`, color: "red" };
    if (diffSec < 0) return { text: `${formatted} lower`, color: "green" };
    return { text: "0s", color: "neutral" };
}
