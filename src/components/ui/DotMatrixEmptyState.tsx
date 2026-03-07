import React from "react";

// ─── 5×7 dot-matrix bitmap font ─────────────────────────────────────────────
// Each entry: 7 rows × 5 cols, 1 = filled dot, 0 = empty
type G = number[][];

const FONT: Record<string, G> = {
  A: [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ],
  B: [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
  ],
  C: [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  D: [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
  ],
  E: [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
  ],
  F: [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
  ],
  G: [
    [0,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  H: [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ],
  I: [
    [1,1,1,1,1],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [1,1,1,1,1],
  ],
  J: [
    [0,0,1,1,1],
    [0,0,0,1,0],
    [0,0,0,1,0],
    [0,0,0,1,0],
    [0,0,0,1,0],
    [1,0,0,1,0],
    [0,1,1,0,0],
  ],
  K: [
    [1,0,0,0,1],
    [1,0,0,1,0],
    [1,0,1,0,0],
    [1,1,0,0,0],
    [1,0,1,0,0],
    [1,0,0,1,0],
    [1,0,0,0,1],
  ],
  L: [
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
  ],
  M: [
    [1,0,0,0,1],
    [1,1,0,1,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ],
  N: [
    [1,0,0,0,1],
    [1,1,0,0,1],
    [1,0,1,0,1],
    [1,0,0,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ],
  O: [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  P: [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
  ],
  Q: [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,0,0,1,0],
    [0,1,1,0,1],
  ],
  R: [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,1,0,0],
    [1,0,0,1,0],
    [1,0,0,0,1],
  ],
  S: [
    [0,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [0,1,1,1,0],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,0],
  ],
  T: [
    [1,1,1,1,1],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
  ],
  U: [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  V: [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,1,0,1,0],
    [0,0,1,0,0],
  ],
  W: [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,1,0,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ],
  X: [
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,1,0,1,0],
    [1,0,0,0,1],
  ],
  Y: [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
  ],
  Z: [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
    [0,1,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
  ],
};

// ─── single character renderer ───────────────────────────────────────────────

interface DotCharProps {
  ch: string;
  dotSize: number;
  dotGap: number;
  color: string;
}

function DotChar({ ch, dotSize, dotGap, color }: DotCharProps) {
  const matrix = FONT[ch.toUpperCase()];
  if (!matrix) return null;

  const cell = dotSize + dotGap;
  const w = 5 * cell - dotGap;
  const h = 7 * cell - dotGap;

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        flexShrink: 0,
      }}
    >
      {matrix.map((row, ri) =>
        row.map((bit, ci) =>
          bit === 1 ? (
            <div
              key={`${ri}-${ci}`}
              style={{
                position: "absolute",
                left: ci * cell,
                top: ri * cell,
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                backgroundColor: color,
              }}
            />
          ) : null
        )
      )}
    </div>
  );
}

// ─── word / line renderer ────────────────────────────────────────────────────

interface DotWordProps {
  text: string;
  dotSize: number;
  dotGap: number;
  charGap: number;
  color: string;
}

function DotWord({ text, dotSize, dotGap, charGap, color }: DotWordProps) {
  return (
    <div style={{ display: "flex", gap: charGap, alignItems: "flex-start" }}>
      {text.split("").map((ch, i) => (
        <DotChar
          key={i}
          ch={ch}
          dotSize={dotSize}
          dotGap={dotGap}
          color={color}
        />
      ))}
    </div>
  );
}

// ─── small label (GET YOUR / NOW style) ─────────────────────────────────────

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: "12px",
        fontWeight: 500,
        letterSpacing: "0.40em",
        textTransform: "uppercase",
        color: "#c8c8c8",
        margin: 0,
        userSelect: "none",
      }}
    >
      {children}
    </p>
  );
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Dot-matrix empty-state display — shown in the results area
 * before any report has been generated.
 *
 * Exact visual style of the Skiper-15 "Box loading preloader" page:
 *   • small monospace label top
 *   • EPSILON   in large black dot-matrix
 *   • REPORT    in large dark-grey dot-matrix
 *   • small monospace label bottom
 */
export default function DotMatrixEmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 36,
        padding: "72px 32px",
        backgroundColor: "#ffffff",
        borderRadius: 16,
        minHeight: 380,
        width: "100%",
        boxSizing: "border-box",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* ── top label ── */}
      <SmallLabel>Select your</SmallLabel>

      {/* ── EPSILON — large, pure black ── */}
      <DotWord
        text="EPSILON"
        dotSize={12}
        dotGap={3}
        charGap={16}
        color="#111111"
      />

      {/* ── REPORT — same scale, slightly lighter ── */}
      <DotWord
        text="REPORT"
        dotSize={12}
        dotGap={3}
        charGap={16}
        color="#4a4a4a"
      />

      {/* ── bottom label ── */}
      <SmallLabel>Now</SmallLabel>
    </div>
  );
}
