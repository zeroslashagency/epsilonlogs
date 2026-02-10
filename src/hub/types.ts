import { LucideIcon } from "lucide-react";

export interface HubKpi {
    id: string;
    label: string;
    value: string | number;
    subValue?: string;
    icon: LucideIcon;
    color: "blue" | "emerald" | "amber" | "rose" | "slate" | "indigo";
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
}

export interface HubFilter {
    id: string;
    label: string;
    color?: string;
}

export interface ProductionCycle {
    id: number;
    wo_id: string;
    part_no: string;
    operator: string;
    status: "Good" | "Warning" | "Bad" | "Running";
    cycleTime: string; // e.g., "1m 20s"
    efficiency: number; // percentage
    timestamp: Date;
}
