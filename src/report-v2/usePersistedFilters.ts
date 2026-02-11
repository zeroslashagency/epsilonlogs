import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    DEFAULT_REPORT_V2_FILTER_STATE,
    ReportV2FilterState,
} from "../report/report-builder-v2";

const STORAGE_KEY = "excal_dashboard.filters.v2";

type SetFilterState = (
    next:
        | ReportV2FilterState
        | ((previous: ReportV2FilterState) => ReportV2FilterState),
) => void;

const isMode = (value: string | null): value is ReportV2FilterState["mode"] =>
    value === "GOOD_ONLY" || value === "GOOD_WARNING" || value === "ALL";

const parseBool = (value: string | null): boolean | null => {
    if (value === "1" || value === "true") return true;
    if (value === "0" || value === "false") return false;
    return null;
};

const serialize = (value: ReportV2FilterState): string =>
    `${value.mode}:${value.includeUnknown ? 1 : 0}:${value.includeBreakExtensions ? 1 : 0}`;

const parseSessionValue = (raw: string | null): ReportV2FilterState | null => {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<ReportV2FilterState>;
        const mode = parsed?.mode ?? null;
        if (!parsed || !isMode(mode)) {
            return null;
        }

        return {
            mode,
            includeUnknown: Boolean(parsed.includeUnknown),
            includeBreakExtensions: Boolean(parsed.includeBreakExtensions),
        };
    } catch {
        return null;
    }
};

const readFromSession = (): ReportV2FilterState | null => {
    if (typeof window === "undefined") return null;
    return parseSessionValue(window.sessionStorage.getItem(STORAGE_KEY));
};

const writeToSession = (value: ReportV2FilterState): void => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const parseFromParams = (params: URLSearchParams): ReportV2FilterState | null => {
    const hasAnyFilterParam = params.has("mode") || params.has("unknown") || params.has("breaks");
    if (!hasAnyFilterParam) {
        return null;
    }

    const modeParam = params.get("mode");
    const unknownParam = parseBool(params.get("unknown"));
    const breaksParam = parseBool(params.get("breaks"));

    return {
        mode: isMode(modeParam) ? modeParam : DEFAULT_REPORT_V2_FILTER_STATE.mode,
        includeUnknown:
            unknownParam === null
                ? DEFAULT_REPORT_V2_FILTER_STATE.includeUnknown
                : unknownParam,
        includeBreakExtensions:
            breaksParam === null
                ? DEFAULT_REPORT_V2_FILTER_STATE.includeBreakExtensions
                : breaksParam,
    };
};

const writeToParams = (
    value: ReportV2FilterState,
    setSearchParams: ReturnType<typeof useSearchParams>[1],
): void => {
    const current =
        typeof window === "undefined"
            ? new URLSearchParams()
            : new URLSearchParams(window.location.search);

    current.set("mode", value.mode);
    current.set("unknown", value.includeUnknown ? "1" : "0");
    current.set("breaks", value.includeBreakExtensions ? "1" : "0");

    setSearchParams(current, { replace: true });
};

export function usePersistedFilters(): [ReportV2FilterState, SetFilterState] {
    const [searchParams, setSearchParams] = useSearchParams();
    const [filterState, setFilterState] = useState<ReportV2FilterState>(() => {
        const fromUrl = parseFromParams(searchParams);
        if (fromUrl) {
            writeToSession(fromUrl);
            return fromUrl;
        }

        const fromSession = readFromSession();
        if (fromSession) {
            return fromSession;
        }

        return DEFAULT_REPORT_V2_FILTER_STATE;
    });

    useEffect(() => {
        const fromUrl = parseFromParams(searchParams);
        if (!fromUrl) return;

        setFilterState((previous) => {
            if (serialize(previous) === serialize(fromUrl)) {
                return previous;
            }
            writeToSession(fromUrl);
            return fromUrl;
        });
    }, [searchParams]);

    const updateFilters = useCallback<SetFilterState>(
        (next) => {
            setFilterState((previous) => {
                const resolved = typeof next === "function" ? next(previous) : next;
                writeToSession(resolved);
                writeToParams(resolved, setSearchParams);
                return resolved;
            });
        },
        [setSearchParams],
    );

    return [filterState, updateFilters];
}
