export const REPORT_PROGRESS_STAGES = {
  logs: { start: 0, span: 60 },
  details: { start: 60, span: 25 },
  filter: { start: 85, span: 5 },
  build: { start: 90, span: 5 },
  overlaps: { start: 95, span: 4 },
  finalize: { start: 99, span: 1 },
} as const;

export type ReportProgressStage = keyof typeof REPORT_PROGRESS_STAGES;

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function getStageProgress(
  stage: ReportProgressStage,
  ratio = 1,
): number {
  const { start, span } = REPORT_PROGRESS_STAGES[stage];
  return clampProgress(start + span * clampRatio(ratio));
}
