import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Factory,
  Gauge,
  RefreshCcw,
  Search,
  Settings,
  ShieldAlert,
  User,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  fetchLatestDeviceLogs,
  fetchDeviceNameMap,
  fetchWoDetails,
  formatDateForApi,
} from "../report/api-client";
import { buildReportV2 } from "../report/report-builder-v2";
import {
  DeviceLogEntry,
  ReportConfig,
  ReportRow,
  WoDetails,
} from "../report/report-types";
import { formatDuration } from "../report/format-utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WoChartWorkspace } from "./WoChartWorkspace";
import { WoReportPanel } from "./WoReportPanel";
import {
  compareDashboardMachineOrder,
  DEFAULT_DASHBOARD_MACHINE_IDS,
  selectPreferredCardsPerMachine,
} from "./wo-report-utils";
import { getMachineLabel } from "../report/machine-config";
import {
  buildMachineErrorSnapshot,
  buildMachineSnapshot,
  type MachineSnapshot,
  type MachineStatus,
} from "./live-machine-status";

const TOKEN = import.meta.env.VITE_API_TOKEN;
const REFRESH_INTERVAL_MS = 30000;
const OVERVIEW_CACHE_TTL_MS = 45000;
const WO_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const LIVE_WINDOW_MS = 15 * 60 * 1000;
const TOP_WO_LIMIT = 12;
type HubViewMode = "dashboard" | "chart";

type WoExecutionStatus = "LIVE" | "PROCESSING" | "COMPLETE";
type RowClassification = "GOOD" | "WARNING" | "BAD" | "UNKNOWN";
type WoJobType = ReportRow["jobType"];

interface WoJobTag {
  jobType: WoJobType;
}

interface WoCardSummary {
  woId: string;
  woDisplayId: string;
  machineId: number | null;
  operatorName: string;
  jobType: WoJobType;
  executionStatus: WoExecutionStatus;
  pclText: string;
  totalCycles: number;
  goodCycles: number;
  warningCycles: number;
  badCycles: number;
  unknownCycles: number;
  totalCycleSec: number;
  totalDurationSec: number;
  avgCycleSec: number;
  latestTimestamp: number;
  latestEvent: string;
  latestClassification: RowClassification;
  latestDurationText: string;
  latestReason: string;
  jobTypeTags: WoJobTag[];
}

type OverviewCardItem =
  | {
    kind: "wo";
    key: string;
    machineId: number | null;
    card: WoCardSummary;
  }
  | {
    kind: "status";
    key: string;
    machineId: number;
    snapshot: MachineSnapshot | null;
  };

interface WoAccumulator {
  woId: string;
  woDisplayId: string;
  machineId: number | null;
  operatorName: string;
  jobType: WoJobType;
  pclText: string;
  jobTypeFirstSeen: Map<WoJobType, number>;
  totalCycles: number;
  goodCycles: number;
  warningCycles: number;
  badCycles: number;
  unknownCycles: number;
  totalCycleSec: number;
  totalDurationSec: number;
  latestTimestamp: number;
  latestCycleTimestamp: number;
  latestEvent: string;
  latestAction: string;
  latestClassification: RowClassification;
  latestDurationText: string;
  latestReason: string;
  hasWoStart: boolean;
  hasWoStop: boolean;
}

const classificationBadgeClass: Record<RowClassification, string> = {
  GOOD: "bg-emerald-100 text-emerald-700 ring-emerald-300",
  WARNING: "bg-amber-100 text-amber-700 ring-amber-300",
  BAD: "bg-rose-100 text-rose-700 ring-rose-300",
  UNKNOWN: "bg-slate-100 text-slate-700 ring-slate-300",
};

const executionStatusBadgeClass: Record<WoExecutionStatus, string> = {
  LIVE: "bg-sky-100 text-sky-700 ring-sky-300",
  PROCESSING: "bg-amber-100 text-amber-700 ring-amber-300",
  COMPLETE: "bg-emerald-100 text-emerald-700 ring-emerald-300",
};

const WO_OVERVIEW_STATUS_PRIORITY: Record<WoExecutionStatus, number> = {
  LIVE: 0,
  PROCESSING: 1,
  COMPLETE: 2,
};

function getTodayWindowStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function compactTime(value: Date | null): string {
  if (!value) return "--:--";
  return value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeLogAge(value: number | Date | null): string {
  if (value == null) {
    return "No recent log";
  }

  const timestamp = value instanceof Date ? value.getTime() : value;
  const ageMs = Math.max(0, Date.now() - timestamp);

  if (ageMs < 60_000) {
    return "Just now";
  }

  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function resolveWoId(row: ReportRow): string | null {
  const raw = row.originalLog?.wo_id ?? row.woSpecs?.woId;
  return raw === undefined || raw === null ? null : String(raw);
}

function toPclText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) {
      return "-";
    }
    return formatDuration(numeric);
  }

  return String(value);
}

function hasMeaningfulPclText(
  value: string | null | undefined,
): value is string {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "-" && normalized !== "0 min 0 sec" && normalized !== "0 sec"
  );
}

function resolveRowPclText(row: ReportRow): string {
  const fromLog = toPclText(row.originalLog?.pcl);
  if (hasMeaningfulPclText(fromLog)) {
    return fromLog;
  }

  if (hasMeaningfulPclText(row.woSpecs?.pclText)) {
    return row.woSpecs!.pclText;
  }

  return row.woSpecs?.pclText || "-";
}

function resolveDisplayWoId(row: ReportRow, internalWoId: string): string {
  const fromLog = String(row.originalLog?.wo_name || "").trim();
  if (fromLog.length > 0) {
    return fromLog;
  }

  const fromSpecs = String(row.woSpecs?.woId || "").trim();
  if (fromSpecs.length > 0 && fromSpecs !== "0") {
    return fromSpecs;
  }

  return internalWoId;
}

function resolveExecutionStatus(entry: WoAccumulator): WoExecutionStatus {
  if (entry.hasWoStop || entry.latestAction === "WO_STOP") {
    return "COMPLETE";
  }

  if (entry.latestAction === "WO_PAUSE") {
    return "PROCESSING";
  }

  if (
    entry.latestAction === "WO_START" ||
    entry.latestAction === "WO_RESUME" ||
    entry.latestAction === "SPINDLE_ON"
  ) {
    return "LIVE";
  }

  if (Date.now() - entry.latestTimestamp <= LIVE_WINDOW_MS) {
    return "LIVE";
  }

  return entry.hasWoStart ? "PROCESSING" : "LIVE";
}

function getJobTypeIcon(jobType: WoJobType): LucideIcon {
  if (jobType === "Production") return Factory;
  if (jobType === "Setting") return Settings;
  if (jobType === "Calibration") return Gauge;
  if (jobType === "Maintenance") return Wrench;
  if (
    jobType === "Man" ||
    jobType === "Man Production" ||
    jobType === "Man Setting"
  )
    return User;
  if (jobType === "Training" || jobType === "RD") return BarChart3;
  if (jobType === "Manual Input") return User;
  if (jobType === "Other") return BarChart3;
  return ShieldAlert;
}

function getJobTypeBadgeClass(jobType: WoJobType): string {
  if (jobType === "Production")
    return "bg-blue-100 text-blue-700 ring-blue-300";
  if (jobType === "Setting")
    return "bg-violet-100 text-violet-700 ring-violet-300";
  if (jobType === "Calibration")
    return "bg-cyan-100 text-cyan-700 ring-cyan-300";
  if (jobType === "Maintenance")
    return "bg-amber-100 text-amber-700 ring-amber-300";
  if (
    jobType === "Man" ||
    jobType === "Man Production" ||
    jobType === "Man Setting"
  )
    return "bg-orange-100 text-orange-700 ring-orange-300";
  if (jobType === "Training") return "bg-lime-100 text-lime-700 ring-lime-300";
  if (jobType === "RD")
    return "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-300";
  if (jobType === "Manual Input")
    return "bg-emerald-100 text-emerald-700 ring-emerald-300";
  if (jobType === "Other") return "bg-rose-100 text-rose-700 ring-rose-300";
  return "bg-slate-100 text-slate-700 ring-slate-300";
}

function getWoOverviewJobTypeBadgeClass(jobType: WoJobType): string {
  if (jobType === "Production") {
    return "bg-emerald-100 text-emerald-700 ring-emerald-300";
  }
  if (jobType === "Setting") {
    return "bg-violet-100 text-violet-700 ring-violet-300";
  }
  if (jobType === "Calibration") {
    return "bg-cyan-100 text-cyan-700 ring-cyan-300";
  }
  if (jobType === "Maintenance") {
    return "bg-rose-100 text-rose-700 ring-rose-300";
  }
  if (
    jobType === "Man" ||
    jobType === "Man Production" ||
    jobType === "Man Setting"
  ) {
    return "bg-orange-100 text-orange-700 ring-orange-300";
  }
  if (jobType === "Training") return "bg-lime-100 text-lime-700 ring-lime-300";
  if (jobType === "RD") return "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-300";
  if (jobType === "Manual Input") {
    return "bg-emerald-100 text-emerald-700 ring-emerald-300";
  }
  return "bg-slate-100 text-slate-700 ring-slate-300";
}

function getWoOverviewStatusBadgeClass(status: WoExecutionStatus): string {
  if (status === "LIVE") {
    return "bg-emerald-100 text-emerald-700 ring-emerald-300";
  }
  if (status === "PROCESSING") {
    return "bg-amber-100 text-amber-700 ring-amber-300";
  }
  return "bg-slate-100 text-slate-700 ring-slate-300";
}

function getWoOverviewMachineStatusBadgeClass(
  status: MachineStatus | null,
): string {
  if (status === "LIVE") {
    return "bg-emerald-100 text-emerald-700 ring-emerald-300";
  }
  if (status === "SETTING") {
    return "bg-violet-100 text-violet-700 ring-violet-300";
  }
  if (status === "MAINTENANCE" || status === "OFFLINE") {
    return "bg-rose-100 text-rose-700 ring-rose-300";
  }
  if (status === "CALIBRATION") {
    return "bg-cyan-100 text-cyan-700 ring-cyan-300";
  }
  if (status === "PAUSED") {
    return "bg-amber-100 text-amber-700 ring-amber-300";
  }
  if (status === "ERROR") {
    return "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-300";
  }
  return "bg-slate-100 text-slate-700 ring-slate-300";
}

function getWoOverviewCardSurfaceClass(
  jobType: WoJobType,
  status: WoExecutionStatus,
  isActive: boolean,
): string {
  const activeClass = isActive
    ? "ring-1 ring-slate-300 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.95)]"
    : "shadow-[0_12px_24px_-22px_rgba(15,23,42,0.9)]";

  if (status === "LIVE" && jobType === "Production") {
    return `border-emerald-200 bg-emerald-50/60 ${activeClass}`;
  }
  if (status === "LIVE" && jobType === "Setting") {
    return `border-violet-200 bg-violet-50/60 ${activeClass}`;
  }
  if (status === "LIVE" && jobType === "Maintenance") {
    return `border-rose-200 bg-rose-50/60 ${activeClass}`;
  }
  if (status === "PROCESSING") {
    return `border-amber-200 bg-amber-50/55 ${activeClass}`;
  }
  if (jobType === "Calibration") {
    return `border-cyan-200 bg-cyan-50/55 ${activeClass}`;
  }
  if (jobType === "RD") {
    return `border-fuchsia-200 bg-fuchsia-50/55 ${activeClass}`;
  }
  return `border-slate-200 bg-white ${activeClass}`;
}

function getWoOverviewMachineSurfaceClass(
  status: MachineStatus | null,
): string {
  const baseShadow =
    "shadow-[0_12px_24px_-22px_rgba(15,23,42,0.9)]";

  if (status === "LIVE") {
    return `border-emerald-200 bg-emerald-50/60 ${baseShadow}`;
  }
  if (status === "SETTING") {
    return `border-violet-200 bg-violet-50/60 ${baseShadow}`;
  }
  if (status === "MAINTENANCE" || status === "OFFLINE") {
    return `border-rose-200 bg-rose-50/60 ${baseShadow}`;
  }
  if (status === "CALIBRATION") {
    return `border-cyan-200 bg-cyan-50/60 ${baseShadow}`;
  }
  if (status === "PAUSED") {
    return `border-amber-200 bg-amber-50/60 ${baseShadow}`;
  }
  if (status === "ERROR") {
    return `border-fuchsia-200 bg-fuchsia-50/60 ${baseShadow}`;
  }
  return `border-slate-200 bg-white ${baseShadow}`;
}

function buildDefaultAccumulator(woId: string, row: ReportRow): WoAccumulator {
  const timestamp = row.timestamp;
  const latestAction = row.action || "";
  const logJobType = row.jobType;
  const operatorName =
    row.operatorName ||
    String(row.originalLog?.start_name || "").trim() ||
    "Unknown";
  return {
    woId,
    woDisplayId: resolveDisplayWoId(row, woId),
    machineId: row.originalLog?.device_id ?? null,
    operatorName,
    jobType: logJobType,
    pclText: resolveRowPclText(row),
    jobTypeFirstSeen: new Map([[logJobType, timestamp]]),
    totalCycles: 0,
    goodCycles: 0,
    warningCycles: 0,
    badCycles: 0,
    unknownCycles: 0,
    totalCycleSec: 0,
    totalDurationSec: 0,
    latestTimestamp: timestamp,
    latestCycleTimestamp: -1,
    latestEvent: row.action || row.label || row.summary || "EVENT",
    latestAction,
    latestClassification: "UNKNOWN",
    latestDurationText: "-",
    latestReason: "No reason",
    hasWoStart: row.action === "WO_START",
    hasWoStop: row.action === "WO_STOP",
  };
}

interface ProductionHubV2Props {
  viewMode?: HubViewMode;
}

export default function ProductionHubV2({
  viewMode = "dashboard",
}: ProductionHubV2Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [deviceNameMap, setDeviceNameMap] = useState<Map<number, string>>(
    new Map(),
  );

  const [allRows, setAllRows] = useState<ReportRow[]>([]);
  const [machineSnapshots, setMachineSnapshots] = useState<MachineSnapshot[]>(
    [],
  );
  const [woDetailsById, setWoDetailsById] = useState<Map<number, WoDetails>>(
    new Map(),
  );
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const overviewCacheRef = useRef<
    Map<string, { rows: ReportRow[]; fetchedAt: number }>
  >(new Map());
  const woDetailsCacheRef = useRef<
    Map<number, { data: WoDetails | null; fetchedAt: number }>
  >(new Map());
  const inflightWoDetailsRef = useRef<Map<number, Promise<WoDetails | null>>>(
    new Map(),
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeMachineIds = DEFAULT_DASHBOARD_MACHINE_IDS;

  const machineSnapshotMap = useMemo(
    () => new Map(machineSnapshots.map((snapshot) => [snapshot.machineId, snapshot])),
    [machineSnapshots],
  );

  const visibleOverviewMachineIds = activeMachineIds;

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return allRows;
    }

    return allRows.filter((row) => {
      const wo = String(
        row.originalLog?.wo_name ||
        row.woSpecs?.woId ||
        row.originalLog?.wo_id ||
        "",
      ).toLowerCase();
      const operator = (row.operatorName || "").toLowerCase();
      const action = (row.action || "").toLowerCase();
      const reason = (row.reasonText || "").toLowerCase();
      return (
        wo.includes(query) ||
        operator.includes(query) ||
        action.includes(query) ||
        reason.includes(query)
      );
    });
  }, [allRows, searchQuery]);

  const topWoCards = useMemo<WoCardSummary[]>(() => {
    const grouped = new Map<string, WoAccumulator>();

    filteredRows.forEach((row) => {
      const woId = resolveWoId(row);
      if (!woId) {
        return;
      }

      const timestamp = row.timestamp;
      const entry = grouped.get(woId) || buildDefaultAccumulator(woId, row);
      const operatorFromRow =
        row.operatorName || String(row.originalLog?.start_name || "").trim();
      const displayWoIdFromRow = resolveDisplayWoId(row, woId);

      entry.totalDurationSec += row.durationSec || 0;
      const existingJobTypeTs = entry.jobTypeFirstSeen.get(row.jobType);
      if (
        existingJobTypeTs === undefined ||
        row.timestamp < existingJobTypeTs
      ) {
        entry.jobTypeFirstSeen.set(row.jobType, row.timestamp);
      }
      if (!hasMeaningfulPclText(entry.pclText)) {
        const candidatePcl = resolveRowPclText(row);
        if (hasMeaningfulPclText(candidatePcl)) {
          entry.pclText = candidatePcl;
        }
      }
      if (entry.jobType === "Unknown" && row.jobType !== "Unknown") {
        entry.jobType = row.jobType;
      }
      if (entry.operatorName === "Unknown" && operatorFromRow) {
        entry.operatorName = operatorFromRow;
      }
      if (
        entry.machineId === null &&
        typeof row.originalLog?.device_id === "number"
      ) {
        entry.machineId = row.originalLog.device_id;
      }
      if (entry.woDisplayId === entry.woId && displayWoIdFromRow !== woId) {
        entry.woDisplayId = displayWoIdFromRow;
      }
      if (row.action === "WO_START") {
        entry.hasWoStart = true;
      }
      if (row.action === "WO_STOP") {
        entry.hasWoStop = true;
      }

      if (timestamp >= entry.latestTimestamp) {
        entry.latestTimestamp = timestamp;
        entry.latestEvent = row.action || row.label || row.summary || "EVENT";
        entry.latestAction = row.action || "";
        entry.machineId = row.originalLog?.device_id ?? entry.machineId;
        entry.operatorName = operatorFromRow || entry.operatorName;
        entry.woDisplayId = displayWoIdFromRow || entry.woDisplayId;
      }

      if (row.action === "SPINDLE_OFF") {
        const classification: RowClassification =
          row.classification || "UNKNOWN";
        entry.totalCycles += 1;
        entry.totalCycleSec += row.durationSec || 0;
        entry.goodCycles += classification === "GOOD" ? 1 : 0;
        entry.warningCycles += classification === "WARNING" ? 1 : 0;
        entry.badCycles += classification === "BAD" ? 1 : 0;
        entry.unknownCycles += classification === "UNKNOWN" ? 1 : 0;

        if (timestamp >= entry.latestCycleTimestamp) {
          entry.latestCycleTimestamp = timestamp;
          entry.latestClassification = classification;
          entry.latestDurationText = row.durationText || "-";
          entry.latestReason = row.reasonText || "No reason";
        }
      }

      grouped.set(woId, entry);
    });

    return selectPreferredCardsPerMachine(
      [...grouped.values()]
        .sort((left, right) => right.latestTimestamp - left.latestTimestamp)
        .slice(0, TOP_WO_LIMIT)
        .map((entry) => {
          const orderedJobTags = [...entry.jobTypeFirstSeen.entries()]
            .sort((left, right) => {
              return left[1] - right[1];
            })
            .map(([jobType]) => ({
              jobType,
            }));

          const visibleTags = orderedJobTags.filter(
            (tag) => tag.jobType !== "Unknown",
          );
          const status = resolveExecutionStatus(entry);
          return {
            woId: entry.woId,
            woDisplayId: entry.woDisplayId,
            machineId: entry.machineId,
            operatorName: entry.operatorName,
            jobType: entry.jobType,
            executionStatus: status,
            pclText: entry.pclText,
            totalCycles: entry.totalCycles,
            goodCycles: entry.goodCycles,
            warningCycles: entry.warningCycles,
            badCycles: entry.badCycles,
            unknownCycles: entry.unknownCycles,
            totalCycleSec: entry.totalCycleSec,
            totalDurationSec: entry.totalDurationSec,
            avgCycleSec:
              entry.totalCycles > 0
                ? Math.round(entry.totalCycleSec / entry.totalCycles)
                : 0,
            latestTimestamp: entry.latestTimestamp,
            latestEvent: entry.latestEvent,
            latestClassification: entry.latestClassification,
            latestDurationText: entry.latestDurationText,
            latestReason: entry.latestReason,
            jobTypeTags:
              visibleTags.length > 0 ? visibleTags : [{ jobType: entry.jobType }],
          };
        }),
      WO_OVERVIEW_STATUS_PRIORITY,
    )
      .sort((left, right) => {
        const byMachine = compareDashboardMachineOrder(
          left.machineId,
          right.machineId,
          activeMachineIds,
        );

        if (byMachine !== 0) {
          return byMachine;
        }

        return right.latestTimestamp - left.latestTimestamp;
      });
  }, [activeMachineIds, filteredRows]);

  useEffect(() => {
    if (topWoCards.length === 0) {
      setSelectedWoId(null);
      setIsOverlayOpen(false);
      return;
    }

    const selectedStillExists =
      selectedWoId != null && topWoCards.some((card) => card.woId === selectedWoId);

    if (viewMode === "chart") {
      if (!selectedStillExists) {
        setSelectedWoId(topWoCards[0]?.woId ?? null);
      }
      setIsOverlayOpen(false);
      return;
    }

    if (selectedWoId && !selectedStillExists) {
      setSelectedWoId(null);
      setIsOverlayOpen(false);
    }
  }, [selectedWoId, topWoCards, viewMode]);

  const selectedWoCard = useMemo(
    () => topWoCards.find((card) => card.woId === selectedWoId) || null,
    [selectedWoId, topWoCards],
  );

  const overviewCards = useMemo<OverviewCardItem[]>(() => {
    if (searchQuery.trim().length > 0) {
      return topWoCards.map((card) => ({
        kind: "wo",
        key: `wo:${card.woId}`,
        machineId: card.machineId,
        card,
      }));
    }

    const cardByMachineId = new Map<number, WoCardSummary>();
    topWoCards.forEach((card) => {
      if (card.machineId != null && !cardByMachineId.has(card.machineId)) {
        cardByMachineId.set(card.machineId, card);
      }
    });

    return visibleOverviewMachineIds.map((machineId) => {
      const card = cardByMachineId.get(machineId);

      if (card) {
        return {
          kind: "wo",
          key: `wo:${card.woId}`,
          machineId,
          card,
        };
      }

      return {
        kind: "status",
        key: `status:${machineId}`,
        machineId,
        snapshot: machineSnapshotMap.get(machineId) ?? null,
      };
    });
  }, [
    machineSnapshotMap,
    searchQuery,
    topWoCards,
    visibleOverviewMachineIds,
  ]);

  const selectedWoRows = useMemo(() => {
    if (!selectedWoId) {
      return [];
    }

    return allRows
      .filter((row) => resolveWoId(row) === selectedWoId)
      .sort((left, right) => right.timestamp - left.timestamp);
  }, [allRows, selectedWoId]);

  const selectedWoDetails = useMemo(() => {
    if (!selectedWoId) {
      return null;
    }
    const woIdNum = Number(selectedWoId);
    if (!Number.isFinite(woIdNum)) {
      return null;
    }
    return woDetailsById.get(woIdNum) || null;
  }, [selectedWoId, woDetailsById]);

  const ensureWoDetailsLoaded = useCallback(
    async (woIdValue: string | null) => {
      if (!woIdValue || !TOKEN) {
        return;
      }

      const woIdNum = Number(woIdValue);
      if (!Number.isFinite(woIdNum)) {
        return;
      }

      if (woDetailsById.has(woIdNum)) {
        return;
      }

      const now = Date.now();
      const cached = woDetailsCacheRef.current.get(woIdNum);
      if (cached && now - cached.fetchedAt <= WO_DETAIL_CACHE_TTL_MS) {
        const cachedData = cached.data;
        if (cachedData) {
          setWoDetailsById((prev) => {
            if (prev.has(woIdNum)) {
              return prev;
            }
            const next = new Map(prev);
            next.set(woIdNum, cachedData);
            return next;
          });
        }
        return;
      }

      const inflight = inflightWoDetailsRef.current.get(woIdNum);
      if (inflight) {
        const data = await inflight;
        if (data) {
          setWoDetailsById((prev) => {
            if (prev.has(woIdNum)) {
              return prev;
            }
            const next = new Map(prev);
            next.set(woIdNum, data);
            return next;
          });
        }
        return;
      }

      const request = fetchWoDetails(woIdNum, TOKEN)
        .catch(() => null)
        .finally(() => {
          inflightWoDetailsRef.current.delete(woIdNum);
        });
      inflightWoDetailsRef.current.set(woIdNum, request);

      const fetched = await request;
      woDetailsCacheRef.current.set(woIdNum, {
        data: fetched,
        fetchedAt: Date.now(),
      });

      if (!fetched) {
        return;
      }

      setWoDetailsById((prev) => {
        if (prev.has(woIdNum)) {
          return prev;
        }
        const next = new Map(prev);
        next.set(woIdNum, fetched);
        return next;
      });
    },
    [woDetailsById],
  );

  const fetchData = async (options?: { force?: boolean }) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError(null);

    if (!TOKEN) {
      setMachineSnapshots(
        activeMachineIds.map((machineId) =>
          buildMachineErrorSnapshot(
            machineId,
            "Missing VITE_API_TOKEN. Set token to enable live dashboard data.",
          ),
        ),
      );
      setError(
        "Missing VITE_API_TOKEN. Set token to enable live dashboard data.",
      );
      setLoading(false);
      return;
    }

    const cacheKey = `today|all|${activeMachineIds.join(",")}`;
    const nowTimestamp = Date.now();
    const cachedOverview = overviewCacheRef.current.get(cacheKey);
    if (
      !options?.force &&
      cachedOverview &&
      nowTimestamp - cachedOverview.fetchedAt <= OVERVIEW_CACHE_TTL_MS
    ) {
      setAllRows(cachedOverview.rows);
      setLastRefreshed(new Date(cachedOverview.fetchedAt));
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const nowMs = now.getTime();
      const startWindow = getTodayWindowStart(now);
      const configForDevice = (deviceId: number): ReportConfig => ({
        deviceId,
        startDate: formatDateForApi(startWindow),
        endDate: formatDateForApi(now),
        toleranceSec: 10,
      });

      const deviceLogResults = await Promise.allSettled(
        activeMachineIds.map(async (deviceId) => {
          const logs = await fetchLatestDeviceLogs(
            configForDevice(deviceId),
            TOKEN,
            signal,
          );
          return [deviceId, logs] as const;
        }),
      );

      if (signal.aborted) return;

      const deviceLogsPairs = deviceLogResults.flatMap((result) =>
        result.status === "fulfilled"
          ? [result.value as readonly [number, DeviceLogEntry[]]]
          : [],
      );
      const failedCount = deviceLogResults.filter(
        (result) => result.status === "rejected",
      ).length;
      const successfulCount = deviceLogResults.length - failedCount;
      const nextMachineSnapshots = activeMachineIds.map((machineId, index) => {
        const result = deviceLogResults[index];
        if (!result || result.status === "rejected") {
          return buildMachineErrorSnapshot(
            machineId,
            result?.reason instanceof Error
              ? result.reason.message
              : "Machine request failed.",
          );
        }

        return buildMachineSnapshot({
          machineId,
          logs: result.value[1],
          now: nowMs,
        });
      });
      setMachineSnapshots(nextMachineSnapshots);

      const combinedLogs = deviceLogsPairs.flatMap(([, logs]) => logs);

      if (deviceLogResults.length === 0) {
        setAllRows([]);
        setLastRefreshed(new Date());
        setError("No machines selected.");
        return;
      }

      if (successfulCount === 0) {
        setAllRows([]);
        setLastRefreshed(new Date());
        setError(
          `Live refresh failed for all ${activeMachineIds.length} machines. Check API response time or connectivity.`,
        );
        return;
      }

      if (combinedLogs.length === 0) {
        setAllRows([]);
        setLastRefreshed(new Date());
        setError(
          failedCount > 0
            ? `No logs returned from ${successfulCount} machine(s). ${failedCount} machine request(s) failed.`
            : `No logs returned for today across ${activeMachineIds.length} machines.`,
        );
        return;
      }

      const report = buildReportV2(combinedLogs, new Map(), {
        deviceId: activeMachineIds[0] || DEFAULT_DASHBOARD_MACHINE_IDS[0],
        startDate: formatDateForApi(startWindow),
        endDate: formatDateForApi(now),
        toleranceSec: 10,
      });

      if (signal.aborted) return;

      overviewCacheRef.current.set(cacheKey, {
        rows: report.filterableRows,
        fetchedAt: Date.now(),
      });
      setAllRows(report.filterableRows);
      setLastRefreshed(new Date());

      // Background-prefetch WO details for all visible top cards
      const prefetchIds = [
        ...new Set(
          report.filterableRows
            .map((r) => r.originalLog?.wo_id)
            .filter((id): id is number => typeof id === "number" && id > 0),
        ),
      ].slice(0, TOP_WO_LIMIT);
      prefetchIds.forEach((id) => void ensureWoDetailsLoaded(String(id)));

      if (failedCount > 0) {
        setError(
          `Partial data loaded. ${failedCount} machine request(s) failed.`,
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (cachedOverview) {
        setAllRows(cachedOverview.rows);
        setLastRefreshed(new Date(cachedOverview.fetchedAt));
        setError(
          `Live refresh failed, showing cached data. ${err instanceof Error ? err.message : ""}`.trim(),
        );
      } else {
        setMachineSnapshots(
          activeMachineIds.map((machineId) =>
            buildMachineErrorSnapshot(
              machineId,
              err instanceof Error ? err.message : "Failed to refresh dashboard.",
            ),
          ),
        );
        setError(
          err instanceof Error ? err.message : "Failed to refresh dashboard.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    const intervalId = window.setInterval(() => {
      void fetchData();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [activeMachineIds]);

  useEffect(() => {
    if (!selectedWoId || (viewMode === "dashboard" && !isOverlayOpen)) {
      return;
    }
    void ensureWoDetailsLoaded(selectedWoId);
  }, [ensureWoDetailsLoaded, isOverlayOpen, selectedWoId, viewMode]);

  useEffect(() => {
    if (!TOKEN) {
      return;
    }

    let ignore = false;
    fetchDeviceNameMap(TOKEN)
      .then((nextDeviceNameMap) => {
        if (!ignore) {
          setDeviceNameMap(nextDeviceNameMap);
        }
      })
      .catch(() => {
        if (!ignore) {
          setDeviceNameMap(new Map());
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const closeOverlay = () => {
    setIsOverlayOpen(false);
    setSelectedWoId(null);
  };

  const closeAllDetails = () => {
    setIsOverlayOpen(false);
    setSelectedWoId(null);
  };

  useEffect(() => {
    if (!isOverlayOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOverlayOpen]);

  const handleWoCardClick = (woId: string) => {
    setSelectedWoId(woId);
    if (viewMode === "dashboard") {
      setIsOverlayOpen(true);
    }
    void ensureWoDetailsLoaded(woId);
  };
  const overviewSummaryLabel =
    viewMode === "chart"
      ? selectedWoCard
        ? `Chart page · WO-${selectedWoCard.woDisplayId}`
        : `Chart page · ${overviewCards.length} available WOs`
      : searchQuery.trim().length > 0
      ? `Today live board · ${overviewCards.length} matching WOs`
      : `Today live board · Showing ${visibleOverviewMachineIds.length} machines`;
  const overviewAgeLabel =
    loading && !lastRefreshed
      ? "Updating..."
      : lastRefreshed
        ? `Updated ${formatRelativeLogAge(lastRefreshed)}`
        : "Waiting for first sync";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_1px_1px,#d6dbe3_1px,transparent_1px)] [background-size:20px_20px] p-2 text-slate-900 sm:p-4 dark:bg-none dark:bg-slate-950 dark:text-slate-100">
      <main className="mx-auto w-full max-w-none">
        <section className="min-h-[calc(100vh-1rem)] w-full sm:min-h-[calc(100vh-2rem)]">
          <header className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3 sm:text-sm">
              <Link
                to="/dashboard"
                className={`inline-flex h-9 items-center rounded-md px-3 font-medium ${
                  viewMode === "dashboard"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/chart"
                className={`inline-flex h-9 items-center rounded-md px-3 ${
                  viewMode === "chart"
                    ? "bg-slate-900 font-medium text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                Chart
              </Link>
              <Link
                to="/report"
                className="inline-flex h-9 items-center rounded-md px-3 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Machine Report
              </Link>
              <Link
                to="/report/personnel"
                className="inline-flex h-9 items-center rounded-md px-3 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Personnel Report
              </Link>

              <div className="ml-auto flex min-w-[240px] flex-wrap items-center justify-end gap-2">
                <div className="relative w-full max-w-[220px] sm:w-[220px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search WO..."
                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500"
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  <Bell className="h-4 w-4" />
                </button>
                <ThemeToggle />
                <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-300">
                  <User className="h-3.5 w-3.5" />
                  epsilon
                </span>
              </div>
            </div>
          </header>

          {error ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {viewMode === "chart" ? (
            selectedWoCard ? (
              <WoChartWorkspace
                woDisplayId={selectedWoCard.woDisplayId}
                machineId={selectedWoCard.machineId}
                operatorName={selectedWoCard.operatorName}
                jobType={selectedWoCard.jobType}
                executionStatus={selectedWoCard.executionStatus}
                executionStatusClassName={
                  executionStatusBadgeClass[selectedWoCard.executionStatus]
                }
                jobTypeClassName={getJobTypeBadgeClass(selectedWoCard.jobType)}
                rows={selectedWoRows}
                woDetails={selectedWoDetails}
              />
            ) : (
              <section className="mt-4 rounded-[28px] border border-dashed border-slate-300 bg-white/90 p-10 text-center text-sm text-slate-500">
                {loading
                  ? "Preparing chart workspace..."
                  : "No work order is ready for the chart section yet."}
              </section>
            )
          ) : null}

          <section className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-lg font-semibold text-slate-800 sm:text-xl">
                {viewMode === "chart" ? "Chart Page" : "Machine Overview"}
              </h1>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                  {overviewSummaryLabel} · {overviewAgeLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void fetchData({ force: true });
                  }}
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
                >
                  <RefreshCcw
                    className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              </div>
            </div>

            {viewMode === "chart" ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-500">
                  Select a work order below to change the chart page.
                </p>
              </div>
            ) : null}

            {viewMode === "chart" ? (
              loading &&
              !lastRefreshed &&
              topWoCards.length === 0 &&
              machineSnapshots.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  Loading chart page data...
                </div>
              ) : topWoCards.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No work orders available for the chart page.
                </div>
              ) : (
                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.35)]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-500">
                      Choose a work order to update the separate chart page.
                    </p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                      {topWoCards.length.toLocaleString()} work orders
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {topWoCards.map((card) => {
                      const isActive = selectedWoId === card.woId;
                      return (
                        <button
                          key={card.woId}
                          type="button"
                          onClick={() => handleWoCardClick(card.woId)}
                          className={`min-w-[220px] rounded-2xl border px-4 py-3 text-left transition ${
                            isActive
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{`WO-${card.woDisplayId}`}</p>
                              <p
                                className={`mt-1 text-xs ${
                                  isActive ? "text-slate-300" : "text-slate-500"
                                }`}
                              >
                                {card.machineId != null
                                  ? getMachineLabel(card.machineId)
                                  : "Machine -"}
                              </p>
                            </div>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${
                                isActive
                                  ? "border-white/20 bg-white/10 text-white ring-white/20"
                                  : getWoOverviewStatusBadgeClass(card.executionStatus)
                              }`}
                            >
                              {card.executionStatus}
                            </span>
                          </div>
                          <p
                            className={`mt-3 text-xs ${
                              isActive ? "text-slate-300" : "text-slate-500"
                            }`}
                          >
                            {`${card.operatorName} · ${card.jobType}`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            ) : loading &&
              !lastRefreshed &&
              topWoCards.length === 0 &&
              machineSnapshots.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                Loading dashboard data...
              </div>
            ) : overviewCards.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No WO cards available for today.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {overviewCards.map((overviewCard) => {
                  if (overviewCard.kind === "status") {
                    const snapshot = overviewCard.snapshot;
                    const status = snapshot?.status ?? "OFFLINE";
                    const statusLabel = snapshot?.statusLabel ?? "Offline";
                    const recentLogAgeText = formatRelativeLogAge(
                      snapshot?.latestTimestamp ?? null,
                    );
                    const hasKnownJobType =
                      snapshot?.jobTypeLabel != null &&
                      snapshot.jobTypeLabel !== "Unknown";
                    const PlaceholderIcon = hasKnownJobType
                      ? getJobTypeIcon(snapshot.jobTypeLabel as WoJobType)
                      : ShieldAlert;
                    const placeholderTagClass = hasKnownJobType
                      ? getWoOverviewJobTypeBadgeClass(
                        snapshot.jobTypeLabel as WoJobType,
                      )
                      : "bg-slate-100 text-slate-700 ring-slate-300";
                    const currentWoLabel = snapshot?.currentWoId
                      ? `WO-${snapshot.currentWoId}`
                      : "No Active WO";

                    return (
                      <div
                        key={overviewCard.key}
                        className={`rounded-2xl border p-4 text-left ${getWoOverviewMachineSurfaceClass(
                          status,
                        )}`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3 text-sm text-slate-600">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/85 shadow-sm">
                              <PlaceholderIcon className="h-5 w-5" />
                            </span>
                            <div className="flex flex-wrap gap-1">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ${placeholderTagClass}`}
                              >
                                {hasKnownJobType ? snapshot.jobTypeLabel : "No Active WO"}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase ring-1 ${getWoOverviewMachineStatusBadgeClass(
                                status,
                              )}`}
                            >
                              {statusLabel}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400">
                              {recentLogAgeText}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-lg font-bold tracking-tight text-slate-900">
                            {getMachineLabel(overviewCard.machineId)}
                          </p>
                          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                            {snapshot?.operatorName || "No active operator"}
                          </p>
                        </div>
                        <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-800">
                          {currentWoLabel}
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                          <p className="text-slate-500">Status</p>
                          <p className="font-medium text-slate-700">
                            {statusLabel}
                          </p>
                          <p className="text-slate-500">Last Seen</p>
                          <p className="font-medium text-slate-700">
                            {recentLogAgeText}
                          </p>
                          <p className="text-slate-500">Last Event</p>
                          <p className="font-medium text-slate-700">
                            {snapshot?.latestAction || "-"}
                          </p>
                        </div>

                        <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                          {snapshot?.statusMessage || "No live WO summary available."}
                        </div>
                      </div>
                    );
                  }

                  const { card } = overviewCard;
                  const JobTypeIcon = getJobTypeIcon(card.jobType);
                  const recentLogAgeText = formatRelativeLogAge(
                    card.latestTimestamp,
                  );
                  const isActive = selectedWoId === card.woId;

                  return (
                    <button
                      type="button"
                      key={card.woId}
                      onClick={() => handleWoCardClick(card.woId)}
                      className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${getWoOverviewCardSurfaceClass(
                        card.jobType,
                        card.executionStatus,
                        isActive,
                      )}`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 text-sm text-slate-600">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/85 shadow-sm">
                            <JobTypeIcon className="h-5 w-5" />
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {card.jobTypeTags.slice(0, 3).map((jobTag) => (
                              <span
                                key={`${card.woId}-${jobTag.jobType}`}
                                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ${getWoOverviewJobTypeBadgeClass(jobTag.jobType)}`}
                              >
                                {jobTag.jobType}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${getWoOverviewStatusBadgeClass(card.executionStatus)}`}
                          >
                            {card.executionStatus}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {recentLogAgeText}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-lg font-bold tracking-tight text-slate-900">
                          {card.machineId != null ? getMachineLabel(card.machineId) : "Machine -"}
                        </p>
                        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                          {card.operatorName}
                        </p>
                      </div>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-800">{`WO-${card.woDisplayId}`}</p>

                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <p className="text-slate-500">PCL Time</p>
                        <p className="font-medium text-slate-700">
                          {card.pclText}
                        </p>
                        <p className="text-slate-500">Cycles</p>
                        <p className="font-medium text-slate-700">
                          {card.totalCycles}
                        </p>
                        <p className="text-slate-500">Total</p>
                        <p className="font-medium text-slate-700">
                          {formatDuration(card.totalDurationSec)}
                        </p>
                      </div>

                      <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                        {viewMode === "chart"
                          ? "Click to open chart section"
                          : "Click to open details"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

          </section>
        </section>
      </main>

      {viewMode === "dashboard" && isOverlayOpen && selectedWoCard ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/35 p-2 backdrop-blur-[2px] sm:p-5"
          onClick={closeOverlay}
        >
          <div
            className="mx-auto flex h-full w-full max-w-[1700px] flex-col rounded-[28px] border border-slate-300 bg-[#dce3ec] p-4 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.85)] sm:p-6 dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                <button
                  type="button"
                  onClick={closeAllDetails}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 hover:bg-slate-50"
                >
                  Machine Overview
                </button>
                <span
                  className="rounded-full bg-slate-900 px-3 py-1 text-white"
                >
                  WO Details
                </span>
              </div>

              <button
                type="button"
                onClick={closeOverlay}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold text-slate-800">{`WO-${selectedWoCard.woDisplayId}`}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {`${selectedWoCard.machineId != null ? getMachineLabel(selectedWoCard.machineId) : 'Machine -'} · ${selectedWoCard.operatorName}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getJobTypeBadgeClass(selectedWoCard.jobType)}`}
                  >
                    {selectedWoCard.jobType}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${executionStatusBadgeClass[selectedWoCard.executionStatus]}`}
                  >
                    {selectedWoCard.executionStatus}
                  </span>
                </div>
              </div>
            </div>

            <WoReportPanel
              key={selectedWoCard.woId}
              token={TOKEN}
              woId={selectedWoCard.woId}
              woDisplayId={selectedWoCard.woDisplayId}
              machineId={selectedWoCard.machineId}
              operatorName={selectedWoCard.operatorName}
              jobType={selectedWoCard.jobType}
              executionStatus={selectedWoCard.executionStatus}
              executionStatusClassName={
                executionStatusBadgeClass[selectedWoCard.executionStatus]
              }
              jobTypeClassName={getJobTypeBadgeClass(selectedWoCard.jobType)}
              fallbackRows={selectedWoRows}
              woDetails={selectedWoDetails}
              deviceNameMap={deviceNameMap}
              onBack={closeAllDetails}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
