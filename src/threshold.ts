import type { ThresholdWindow } from "./types.js";

export interface BuildThresholdInput {
  idealCycleSec: number;
  thresholdPct?: number;
  minThresholdSec?: number;
  warningPct?: number;
}

export const buildThresholdWindow = ({
  idealCycleSec,
  thresholdPct = 0.1,
  minThresholdSec = 5,
  warningPct = 0.25,
}: BuildThresholdInput): ThresholdWindow => {
  const greenBuffer = Math.max(minThresholdSec, idealCycleSec * thresholdPct);
  const warningBuffer = Math.max(greenBuffer, idealCycleSec * warningPct);
  return {
    greenLowerSec: idealCycleSec - greenBuffer,
    greenUpperSec: idealCycleSec + greenBuffer,
    warningLowerSec: idealCycleSec - warningBuffer,
    warningUpperSec: idealCycleSec + warningBuffer,
  };
};
