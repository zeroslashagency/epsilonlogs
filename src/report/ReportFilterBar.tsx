import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronDown,
  Zap,
  User,
  Tag,
  Briefcase,
  Monitor,
  SlidersHorizontal,
  Search,
  CheckCheck,
  Check,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ReportRow } from "./report-types";
import { getMachineLabel } from "./machine-config";

/* ─── Utils ──────────────────────────────────────────────────────────────── */

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ─── Public Types ───────────────────────────────────────────────────────── */

export interface ReportFilters {
  actions: string[];
  jobTypes: string[];
  operators: string[];
  labels: string[];
  machines: string[];
}

export const EMPTY_FILTERS: ReportFilters = {
  actions: [],
  jobTypes: [],
  operators: [],
  labels: [],
  machines: [],
};

export function isFiltersEmpty(f: ReportFilters): boolean {
  return (
    f.actions.length === 0 &&
    f.jobTypes.length === 0 &&
    f.operators.length === 0 &&
    f.labels.length === 0 &&
    f.machines.length === 0
  );
}

/* ─── Action Color Map ───────────────────────────────────────────────────── */

interface ActionColor {
  dot: string;
  bg: string;
  text: string;
  border: string;
}

const ACTION_COLORS: Record<string, ActionColor> = {
  WO_START: {
    dot: "bg-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  WO_STOP: {
    dot: "bg-rose-500",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  WO_PAUSE: {
    dot: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  WO_RESUME: {
    dot: "bg-blue-500",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  SPINDLE_ON: {
    dot: "bg-teal-500",
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
  },
  SPINDLE_OFF: {
    dot: "bg-slate-400",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
  },
  KEY_ON: {
    dot: "bg-cyan-500",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
  },
  KEY_OFF: {
    dot: "bg-purple-500",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
};

const DEFAULT_ACTION_COLOR: ActionColor = {
  dot: "bg-slate-400",
  bg: "bg-slate-100",
  text: "text-slate-600",
  border: "border-slate-200",
};

function getActionColor(action: string): ActionColor {
  return ACTION_COLORS[action] ?? DEFAULT_ACTION_COLOR;
}

/* ─── Accent Config ──────────────────────────────────────────────────────── */

interface AccentCfg {
  activeTrigger: string;
  badge: string;
  checkboxActive: string;
  rowActive: string;
}

const ACCENT: Record<string, AccentCfg> = {
  indigo: {
    activeTrigger:
      "bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100",
    badge: "bg-indigo-600 text-white",
    checkboxActive: "bg-indigo-500 border-indigo-500",
    rowActive: "bg-indigo-50/70",
  },
  violet: {
    activeTrigger:
      "bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100",
    badge: "bg-violet-600 text-white",
    checkboxActive: "bg-violet-500 border-violet-500",
    rowActive: "bg-violet-50/70",
  },
  emerald: {
    activeTrigger:
      "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100",
    badge: "bg-emerald-600 text-white",
    checkboxActive: "bg-emerald-500 border-emerald-500",
    rowActive: "bg-emerald-50/70",
  },
  amber: {
    activeTrigger:
      "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100",
    badge: "bg-amber-500 text-white",
    checkboxActive: "bg-amber-500 border-amber-500",
    rowActive: "bg-amber-50/70",
  },
};

function getAccent(color: string): AccentCfg {
  return ACCENT[color] ?? ACCENT["indigo"]!;
}

/* ─── Portal Dropdown ────────────────────────────────────────────────────── */

interface DropdownPortalProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  children: React.ReactNode;
}

function DropdownPortal({ anchorRef, open, children }: DropdownPortalProps) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      minWidth: Math.max(rect.width, 220),
      zIndex: 9999,
    });
  }, [open, anchorRef]);

  if (!open) return null;
  return createPortal(<div style={style}>{children}</div>, document.body);
}

/* ─── Multi-Select Dropdown ──────────────────────────────────────────────── */

interface MultiSelectDropdownProps {
  label: string;
  icon: React.ReactNode;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  renderOption?: (opt: string) => React.ReactNode;
  accentColor?: string;
  disabled?: boolean;
}

function MultiSelectDropdown({
  label,
  icon,
  options,
  selected,
  onChange,
  renderOption,
  accentColor = "indigo",
  disabled = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  const ac = getAccent(accentColor);
  const hasSelection = selected.length > 0;
  const allSelected = options.length > 0 && selected.length === options.length;

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    return options.filter((o) =>
      o.toLowerCase().includes(search.toLowerCase()),
    );
  }, [options, search]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset search when closed
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const toggle = useCallback(
    (opt: string) => {
      onChange(
        selected.includes(opt)
          ? selected.filter((s) => s !== opt)
          : [...selected, opt],
      );
    },
    [selected, onChange],
  );

  if (options.length === 0) return null;

  return (
    <div className="relative flex-shrink-0">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium",
          "border transition-all duration-150 select-none whitespace-nowrap",
          "focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:ring-offset-1",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          hasSelection
            ? ac.activeTrigger
            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300",
          open &&
            !hasSelection &&
            "bg-slate-50 border-slate-300 ring-2 ring-indigo-200/60",
          open && hasSelection && "ring-2 ring-indigo-200/60",
        )}
      >
        <span
          className={cn(
            "flex-shrink-0",
            hasSelection ? "opacity-80" : "text-slate-400",
          )}
        >
          {icon}
        </span>
        <span>{label}</span>
        {hasSelection && (
          <span
            className={cn(
              "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
              ac.badge,
            )}
          >
            {selected.length}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200",
            hasSelection ? "opacity-70" : "text-slate-400",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown via Portal */}
      <DropdownPortal anchorRef={triggerRef} open={open}>
        <div
          ref={panelRef}
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
          style={{
            boxShadow:
              "0 12px 40px -8px rgba(0,0,0,0.15), 0 4px 12px -4px rgba(0,0,0,0.08)",
            animation: "fadeInDown 0.15s ease forwards",
          }}
          role="listbox"
          aria-multiselectable="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Filter by {label}
            </span>
            <button
              type="button"
              onClick={() => onChange(allSelected ? [] : [...options])}
              className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          {/* Inline search (if many options) */}
          {options.length > 6 && (
            <div className="px-3 pt-2 pb-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50
                    focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-300
                    placeholder:text-slate-400 transition-all"
                />
              </div>
            </div>
          )}

          {/* Options list */}
          <div className="py-1.5 max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">
                No matches
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={isChecked}
                    onClick={() => toggle(opt)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-left",
                      "transition-colors duration-100",
                      isChecked ? ac.rowActive : "hover:bg-slate-50",
                    )}
                  >
                    {/* Custom checkbox */}
                    <span
                      className={cn(
                        "flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center",
                        "transition-all duration-100",
                        isChecked
                          ? ac.checkboxActive
                          : "border-slate-300 bg-white",
                      )}
                    >
                      {isChecked && (
                        <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                      )}
                    </span>
                    {/* Option label */}
                    <span className="flex-1 min-w-0 font-medium text-slate-700 truncate">
                      {renderOption ? renderOption(opt) : opt}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer — clear */}
          {hasSelection && (
            <div className="border-t border-slate-100 px-3.5 py-2 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                {selected.length} selected
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setOpen(false);
                }}
                className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </DropdownPortal>
    </div>
  );
}

/* ─── Filter Bar Props ───────────────────────────────────────────────────── */

interface ReportFilterBarProps {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  availableActions: string[];
  availableJobTypes: string[];
  availableOperators: string[];
  availableLabels: string[];
  availableMachines: string[];
  totalRows: number;
  filteredRows: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  disabled?: boolean;
}

/* ─── Main FilterBar Component ───────────────────────────────────────────── */

export function ReportFilterBar({
  filters,
  onChange,
  availableActions,
  availableJobTypes,
  availableOperators,
  availableLabels,
  availableMachines,
  totalRows,
  filteredRows,
  searchQuery,
  onSearchChange,
  disabled = false,
}: ReportFilterBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const isEmpty = isFiltersEmpty(filters) && !searchQuery.trim();
  const isFiltered = !isEmpty;

  const activeCount =
    filters.actions.length +
    filters.jobTypes.length +
    filters.operators.length +
    filters.labels.length +
    filters.machines.length;

  const removePill = (key: keyof ReportFilters, value: string) => {
    onChange({
      ...filters,
      [key]: (filters[key] as string[]).filter((v) => v !== value),
    });
  };

  const clearAll = () => {
    onChange(EMPTY_FILTERS);
    onSearchChange("");
    searchRef.current?.focus();
  };

  // Keyboard shortcut: "/" focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 overflow-visible"
      style={{
        boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* ── Main toolbar row ── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        {/* ── Brand / Icon ── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="p-1.5 rounded-xl bg-indigo-50 border border-indigo-100">
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
          </div>
          <span className="text-xs font-extrabold text-slate-600 uppercase tracking-[0.14em] hidden sm:block select-none">
            Filters
          </span>
        </div>

        {/* ── Vertical divider ── */}
        <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1 flex-shrink-0" />

        {/* ── Search ── */}
        <div className="relative flex-shrink-0 min-w-[180px] sm:min-w-[240px] md:min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={disabled}
            placeholder="Search logs…"
            aria-label="Search logs"
            className={cn(
              "h-9 w-full pl-9 pr-8 rounded-full text-sm",
              "border border-slate-200 bg-white",
              "placeholder:text-slate-400 text-slate-800",
              "focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400",
              "transition-all duration-150",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              searchQuery && "border-indigo-300 ring-1 ring-indigo-200/60",
            )}
          />
          {searchQuery && (
            <button
              onClick={() => {
                onSearchChange("");
                searchRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full
                text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* ── Dropdown filters ── */}
        <MultiSelectDropdown
          label="Action"
          icon={<Zap className="h-3.5 w-3.5" />}
          options={availableActions}
          selected={filters.actions}
          onChange={(v) => onChange({ ...filters, actions: v })}
          accentColor="indigo"
          disabled={disabled}
          renderOption={(opt) => {
            const c = getActionColor(opt);
            return (
              <span className="flex items-center gap-2">
                <span
                  className={cn("w-2 h-2 rounded-full flex-shrink-0", c.dot)}
                />
                <span className="font-mono text-[11px] text-slate-700">
                  {opt}
                </span>
              </span>
            );
          }}
        />

        <MultiSelectDropdown
          label="Job Type"
          icon={<Briefcase className="h-3.5 w-3.5" />}
          options={availableJobTypes}
          selected={filters.jobTypes}
          onChange={(v) => onChange({ ...filters, jobTypes: v })}
          accentColor="violet"
          disabled={disabled}
        />

        <MultiSelectDropdown
          label="Operator"
          icon={<User className="h-3.5 w-3.5" />}
          options={availableOperators}
          selected={filters.operators}
          onChange={(v) => onChange({ ...filters, operators: v })}
          accentColor="emerald"
          disabled={disabled}
        />

        {availableLabels.length > 0 && (
          <MultiSelectDropdown
            label="Label"
            icon={<Tag className="h-3.5 w-3.5" />}
            options={availableLabels}
            selected={filters.labels}
            onChange={(v) => onChange({ ...filters, labels: v })}
            accentColor="amber"
            disabled={disabled}
          />
        )}

        {availableMachines.length > 0 && (
          <MultiSelectDropdown
            label="Machine"
            icon={<Monitor className="h-3.5 w-3.5" />}
            options={availableMachines}
            selected={filters.machines}
            onChange={(v) => onChange({ ...filters, machines: v })}
            accentColor="indigo"
            disabled={disabled}
          />
        )}

        {/* ── Spacer ── */}
        <div className="flex-1 min-w-0" />

        {/* ── Row count badge ── */}
        <div className="flex-shrink-0">
          {isFiltered ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <span className="font-bold text-slate-800 tabular-nums">
                {filteredRows.toLocaleString()}
              </span>
              <span className="text-slate-400">/</span>
              <span className="tabular-nums">{totalRows.toLocaleString()}</span>
              <span className="text-slate-400 ml-0.5">rows</span>
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              <span className="font-semibold text-slate-600 tabular-nums">
                {totalRows.toLocaleString()}
              </span>
              <span className="ml-1">rows</span>
            </span>
          )}
        </div>

        {/* ── Clear all ── */}
        {isFiltered && (
          <button
            type="button"
            onClick={clearAll}
            className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full
              text-xs font-medium text-slate-500 border border-slate-200 bg-white
              hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200
              transition-all duration-150"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {/* ── Active filter pills row ── */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 bg-indigo-50/40 border-t border-indigo-100/60">
          {/* "Active:" label */}
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-400 select-none mr-0.5">
            Active:
          </span>

          {/* Action pills */}
          {filters.actions.map((v) => {
            const c = getActionColor(v);
            return (
              <span
                key={`a-${v}`}
                className={cn(
                  "inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full",
                  "text-[11px] font-medium border",
                  c.bg,
                  c.text,
                  c.border,
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
                    c.dot,
                  )}
                />
                <span className="font-mono">{v}</span>
                <button
                  onClick={() => removePill("actions", v)}
                  className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
                  aria-label={`Remove action filter: ${v}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}

          {/* Job Type pills */}
          {filters.jobTypes.map((v) => (
            <span
              key={`jt-${v}`}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200"
            >
              <Briefcase className="h-2.5 w-2.5 flex-shrink-0" />
              {v}
              <button
                onClick={() => removePill("jobTypes", v)}
                className="p-0.5 rounded-full hover:bg-violet-200/50 transition-colors"
                aria-label={`Remove job type filter: ${v}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}

          {/* Operator pills */}
          {filters.operators.map((v) => (
            <span
              key={`op-${v}`}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
            >
              <User className="h-2.5 w-2.5 flex-shrink-0" />
              {v}
              <button
                onClick={() => removePill("operators", v)}
                className="p-0.5 rounded-full hover:bg-emerald-200/50 transition-colors"
                aria-label={`Remove operator filter: ${v}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}

          {/* Label pills */}
          {filters.labels.map((v) => (
            <span
              key={`lb-${v}`}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
            >
              <Tag className="h-2.5 w-2.5 flex-shrink-0" />
              {v}
              <button
                onClick={() => removePill("labels", v)}
                className="p-0.5 rounded-full hover:bg-amber-200/50 transition-colors"
                aria-label={`Remove label filter: ${v}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}

          {/* Machine pills */}
          {filters.machines.map((v) => (
            <span
              key={`mc-${v}`}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
            >
              <Monitor className="h-2.5 w-2.5 flex-shrink-0" />
              {v}
              <button
                onClick={() => removePill("machines", v)}
                className="p-0.5 rounded-full hover:bg-blue-200/50 transition-colors"
                aria-label={`Remove machine filter: ${v}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}

          {/* Applied count */}
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-indigo-500 font-semibold select-none">
            <CheckCheck className="h-3 w-3" />
            {activeCount} filter{activeCount > 1 ? "s" : ""} applied
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Filter Extraction ──────────────────────────────────────────────────── */

export function extractFilterOptions(rows: ReportRow[]): {
  actions: string[];
  jobTypes: string[];
  operators: string[];
  labels: string[];
  machines: string[];
} {
  const actions = new Set<string>();
  const jobTypes = new Set<string>();
  const operators = new Set<string>();
  const labels = new Set<string>();
  const machines = new Set<string>();

  for (const row of rows) {
    if (row.isWoHeader || row.isWoSummary || row.isPauseBanner) continue;
    if (row.action) actions.add(row.action);
    if (row.jobType && row.jobType !== "Unknown")
      jobTypes.add(String(row.jobType));
    if (row.operatorName) operators.add(row.operatorName);
    if (row.label) labels.add(row.label);
    const deviceId = row.originalLog?.device_id ?? row.woHeaderData?.deviceId;
    if (typeof deviceId === 'number' && deviceId > 0) {
      machines.add(getMachineLabel(deviceId));
    }
  }

  // Canonical action order
  const ACTION_ORDER = [
    "WO_START",
    "WO_STOP",
    "SPINDLE_ON",
    "SPINDLE_OFF",
    "WO_PAUSE",
    "WO_RESUME",
    "KEY_ON",
    "KEY_OFF",
  ];
  const sortedActions = ACTION_ORDER.filter((a) => actions.has(a));
  for (const a of actions) {
    if (!sortedActions.includes(a)) sortedActions.push(a);
  }

  return {
    actions: sortedActions,
    jobTypes: Array.from(jobTypes).sort(),
    operators: Array.from(operators).sort(),
    labels: Array.from(labels).sort(),
    machines: Array.from(machines).sort(),
  };
}

/* ─── Filter Application ─────────────────────────────────────────────────── */

export function applyFilters(
  rows: ReportRow[],
  filters: ReportFilters,
): ReportRow[] {
  if (isFiltersEmpty(filters)) return rows;

  // First pass — mark which regular data rows pass all filters
  const survived = new Set<string>();
  const keptWoIds = new Set<string>();

  for (const row of rows) {
    if (row.isWoHeader || row.isWoSummary || row.isPauseBanner) continue;

    let pass = true;

    // Action filter — only apply when the row actually has an action
    if (filters.actions.length > 0) {
      if (!row.action || !filters.actions.includes(row.action)) pass = false;
    }

    // Job Type filter
    if (pass && filters.jobTypes.length > 0) {
      const jt = String(row.jobType ?? "");
      if (!filters.jobTypes.includes(jt)) pass = false;
    }

    // Operator filter
    if (pass && filters.operators.length > 0) {
      if (!row.operatorName || !filters.operators.includes(row.operatorName))
        pass = false;
    }

    // Label filter — only apply when the row has a label
    if (pass && filters.labels.length > 0) {
      if (!row.label || !filters.labels.includes(row.label)) pass = false;
    }

    // Machine filter — match by getMachineLabel of the row's device_id
    if (pass && filters.machines.length > 0) {
      const deviceId = row.originalLog?.device_id;
      const machineLabel = typeof deviceId === 'number' ? getMachineLabel(deviceId) : null;
      if (!machineLabel || !filters.machines.includes(machineLabel)) pass = false;
    }

    if (pass) {
      survived.add(row.rowId);
      // Track WO IDs so we can keep their banner rows
      if (row.woSpecs?.woId) keptWoIds.add(row.woSpecs.woId);
      if (row.isJobBlock && row.jobBlockLabel) keptWoIds.add(row.jobBlockLabel);
    }
  }

  // Second pass — include: survived data rows + banner rows for matched WOs
  return rows.filter((row) => {
    // Always keep WO header/summary/pause banners that belong to a kept WO
    if (row.isWoHeader && row.woHeaderData) {
      return keptWoIds.size === 0 || keptWoIds.has(row.woHeaderData.woIdStr);
    }
    if (row.isWoSummary && row.woSummaryData) {
      return keptWoIds.size === 0 || keptWoIds.has(row.woSummaryData.woIdStr);
    }
    if (row.isPauseBanner) {
      // Keep pause banners — they belong to the surrounding WO context
      return true;
    }

    return survived.has(row.rowId);
  });
}
