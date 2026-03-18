import React, { useEffect, useRef, useState, useCallback } from "react";

interface BoxLoadingPreloaderProps {
  /** Is the actual API fetch still in progress? */
  loading: boolean;
  /** Called after the 100 % animation + fade-out finishes */
  onDone: () => void;
  /** Optional device id shown in the sub-label */
  deviceId?: number;
  /** Card label – defaults to "LOADER" */
  label?: string;
  /**
   * When true the overlay uses position:absolute so it fills a
   * relative-positioned parent (e.g. the results section below the form).
   * When false (default) it uses position:fixed and covers the whole viewport.
   */
  contained?: boolean;
  /** Controlled progress value. When omitted, the component simulates progress. */
  progress?: number;
  /** Real loading stage shown above the box row. */
  statusLabel?: string;
  /** Real loading detail shown in the footer. */
  detailLabel?: string;
}

// ─── colour helpers ──────────────────────────────────────────────────────────

const DARK = { r: 73, g: 73, b: 73 }; // #494949 — loaded box
const LIGHT = { r: 220, g: 220, b: 220 }; // #DCDCDC — pending box

/** Linearly interpolate LIGHT → DARK based on fill level 0-1 */
function boxColor(fill: number): string {
  const r = Math.round(LIGHT.r + (DARK.r - LIGHT.r) * fill);
  const g = Math.round(LIGHT.g + (DARK.g - LIGHT.g) * fill);
  const b = Math.round(LIGHT.b + (DARK.b - LIGHT.b) * fill);
  return `rgb(${r},${g},${b})`;
}

/**
 * Fill level (0–1) for box i (0–9) at a given progress (0–100).
 *
 * A ~1-box-wide gradient wave sweeps left → right:
 *   fillLevel_i = clamp( (progress − i×10 + 5) / 10, 0, 1 )
 *
 * At progress = 60 %:
 *   box 0–5 → 1.0  (dark)
 *   box 6   → 0.5  (mid-grey)
 *   box 7–9 → 0.0  (light)
 */
function boxFillLevel(progress: number, i: number): number {
  const v = (progress - i * 10 + 5) / 10;
  return Math.min(1, Math.max(0, v));
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

// ─── phase type ─────────────────────────────────────────────────────────────

type Phase = "simulating" | "completing" | "holding" | "fading";

// ─── component ──────────────────────────────────────────────────────────────

export default function BoxLoadingPreloader({
  loading,
  onDone,
  deviceId,
  label = "LOADER",
  contained = false,
  progress,
  statusLabel,
  detailLabel,
}: BoxLoadingPreloaderProps) {
  const [displayProgress, setDisplayProgress] = useState(() =>
    clampProgress(progress ?? 0),
  );
  const [opacity, setOpacity] = useState(1);

  const controlledProgress =
    typeof progress === "number" ? clampProgress(progress) : null;
  const isControlled = controlledProgress !== null;
  const phase = useRef<Phase>("simulating");
  const simInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafId = useRef<number | null>(null);
  const holdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(0); // mirror for use inside RAF callbacks

  const updateProgress = useCallback((p: number) => {
    const next = clampProgress(p);
    progressRef.current = next;
    setDisplayProgress(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (simInterval.current) clearInterval(simInterval.current);
    if (rafId.current) cancelAnimationFrame(rafId.current);
    if (holdTimeout.current) clearTimeout(holdTimeout.current);
    if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
  }, []);

  const startFadeOut = useCallback(() => {
    holdTimeout.current = setTimeout(() => {
      phase.current = "fading";
      setOpacity(0);
      fadeTimeout.current = setTimeout(onDone, 380);
    }, 700);
  }, [onDone]);

  const animateToCompletion = useCallback(
    (duration: number) => {
      clearTimers();
      phase.current = "completing";

      const start = Date.now();
      const startProgress = progressRef.current;

      function tick() {
        const elapsed = Date.now() - start;
        const t = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        updateProgress(startProgress + (100 - startProgress) * eased);

        if (t < 1) {
          rafId.current = requestAnimationFrame(tick);
          return;
        }

        phase.current = "holding";
        startFadeOut();
      }

      rafId.current = requestAnimationFrame(tick);
    },
    [clearTimers, startFadeOut, updateProgress],
  );

  // ── Controlled mode: reflect real progress pushed by the caller ──────────
  useEffect(() => {
    if (!isControlled || controlledProgress === null) {
      return;
    }

    setOpacity(1);
    updateProgress(controlledProgress);
  }, [controlledProgress, isControlled, updateProgress]);

  // ── Phase 1: simulate 0 → ~88 % while the API is in flight ──────────────
  useEffect(() => {
    if (isControlled) {
      return;
    }

    phase.current = "simulating";
    setOpacity(1);
    updateProgress(0);
    simInterval.current = setInterval(() => {
      if (phase.current !== "simulating") return;
      setDisplayProgress((prev) => {
        const remaining = 88 - prev;
        const increment = Math.max(0.12, remaining * 0.032);
        const next = Math.min(88, prev + increment);
        progressRef.current = next;
        return next;
      });
    }, 80);

    return () => {
      clearTimers();
    };
  }, [clearTimers, isControlled, updateProgress]);

  // ── Phase 2: loading finished → race to 100 %, hold, fade ───────────────
  useEffect(() => {
    if (loading) return; // still fetching
    if (phase.current === "holding" || phase.current === "fading") return;

    animateToCompletion(isControlled ? 220 : 520);
  }, [animateToCompletion, isControlled, loading]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const pct = Math.round(displayProgress);
  const footerDetail =
    detailLabel ??
    (deviceId !== undefined ? `Device #${deviceId}` : "Fetching data");

  // ── overlay position: fixed (full-screen) or absolute (contained) ────────
  const overlayStyle: React.CSSProperties = {
    position: contained ? "absolute" : "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EBEBEB",
    opacity,
    transition: "opacity 0.35s ease",
    overflow: "hidden",
    // small radius so it hugs the parent card when contained
    borderRadius: contained ? "inherit" : 0,
  };

  return (
    <div aria-live="polite" aria-label="Generating report" style={overlayStyle}>
      {/* ── White loader card ─────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "18px",
          padding: "20px 24px 18px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.10)",
          border: "1px solid rgba(0,0,0,0.06)",
          minWidth: "420px",
          userSelect: "none",
        }}
      >
        {/* ── Header row: label + 2 macOS-style dots ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "18px",
          }}
        >
          <span
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "13px",
              fontWeight: 500,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "#3D3D3D",
            }}
          >
            {label}
          </span>

          <div style={{ display: "flex", gap: "6px" }}>
            {[0, 1].map((d) => (
              <div
                key={d}
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: "#C8C8C8",
                }}
              />
            ))}
          </div>
        </div>

        {statusLabel ? (
          <div
            style={{
              marginBottom: "14px",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#6B7280",
            }}
          >
            {statusLabel}
          </div>
        ) : null}

        {/* ── 10 boxes row ── */}
        <div aria-hidden="true" style={{ display: "flex", gap: "7px" }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                backgroundColor: boxColor(boxFillLevel(displayProgress, i)),
                flexShrink: 0,
                transition: "background-color 0.08s linear",
              }}
            />
          ))}
        </div>

        {/* ── Footer row: device label + percentage ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: "14px",
          }}
        >
          <span
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "11px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#ABABAB",
            }}
          >
            {footerDetail}
          </span>

          <span
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "14px",
              fontWeight: 500,
              color: "#3D3D3D",
              letterSpacing: "0.04em",
              minWidth: "44px",
              textAlign: "right",
            }}
          >
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
