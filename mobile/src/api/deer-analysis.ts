/**
 * Rack scoring through the DeerAge proxy.
 * Measurements are estimated tine by tine on the server, then explained locally.
 */

import {
  AntlerMeasurements,
  CircumferenceMeasurement,
  DeerAnalysisFrame,
  ScaleEstimation,
  TinePoint,
} from "../types/deer-scoring";
import { AnalysisError } from "./errors";
import { analyzeImages } from "./proxy";
import { useHunterProfile } from "../state/hunterProfile";

export { generateExplainableRackScoring } from "./explainable-rack";

export let lastProxyScale: ScaleEstimation | null = null;

export function rememberScale(scale: ScaleEstimation | null) {
  lastProxyScale = scale;
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function tine(length: number, side: "left" | "right"): TinePoint | undefined {
  if (length <= 0) return undefined;
  return { length, side };
}

function mass(raw: unknown): CircumferenceMeasurement {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: CircumferenceMeasurement = {};
  (["h1", "h2", "h3", "h4"] as const).forEach((key) => {
    const length = asNumber(source[key]);
    if (length > 0) out[key] = length;
  });
  return out;
}

function sideRecord(raw: unknown): Record<string, number> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  ["g1", "g2", "g3", "g4", "g5", "g6"].forEach((key) => {
    out[key] = asNumber(source[key]);
  });
  return out;
}

function countSide(beam: number, tines: Record<string, number>): number {
  const points = Object.values(tines).filter((length) => length > 0).length;
  if (beam <= 0 && points === 0) return 0;
  return (beam > 0 ? 1 : 0) + points;
}

function toScale(raw: unknown): ScaleEstimation {
  const source = (raw ?? {}) as Record<string, unknown>;
  const confidence = source.confidence === "High" || source.confidence === "Low" ? source.confidence : "Med";
  const method = source.method === "unknown" ? "skull-prior" : "hybrid";
  return {
    method,
    pixelsPerInch: asNumber(source.pixelsPerInch),
    confidence,
  };
}

function toMeasurements(result: Record<string, unknown>): AntlerMeasurements {
  const beams = (result.beams ?? {}) as Record<string, unknown>;
  const tines = (result.tines ?? {}) as Record<string, unknown>;
  const massRaw = (result.mass ?? {}) as Record<string, unknown>;
  const left = sideRecord(tines.left);
  const right = sideRecord(tines.right);
  const leftBeam = asNumber(beams.left);
  const rightBeam = asNumber(beams.right);
  const abnormalRaw = Array.isArray(result.abnormal) ? result.abnormal : [];
  const abnormalPoints: TinePoint[] = [];
  for (const item of abnormalRaw) {
    const row = item as Record<string, unknown>;
    const length = asNumber(row.length);
    if (length <= 0) continue;
    const side = row.side === "right" ? "right" : "left";
    abnormalPoints.push({ length, side, isAbnormal: true });
  }

  lastProxyScale = toScale(result.scale);

  return {
    rightMainBeam: { length: rightBeam, side: "right" },
    leftMainBeam: { length: leftBeam, side: "left" },
    rightG1: tine(right.g1, "right"),
    rightG2: tine(right.g2, "right"),
    rightG3: tine(right.g3, "right"),
    rightG4: tine(right.g4, "right"),
    rightG5: tine(right.g5, "right"),
    rightG6: tine(right.g6, "right"),
    leftG1: tine(left.g1, "left"),
    leftG2: tine(left.g2, "left"),
    leftG3: tine(left.g3, "left"),
    leftG4: tine(left.g4, "left"),
    leftG5: tine(left.g5, "left"),
    leftG6: tine(left.g6, "left"),
    abnormalPoints,
    rightCircumferences: mass(massRaw.right),
    leftCircumferences: mass(massRaw.left),
    insideSpread: asNumber(result.insideSpread),
    totalPoints: countSide(leftBeam, left) + countSide(rightBeam, right),
    leftSidePoints: countSide(leftBeam, left),
    rightSidePoints: countSide(rightBeam, right),
    totalAbnormalPoints: abnormalPoints.length,
    pointEnumeration: typeof result.pointEnumeration === "string" ? result.pointEnumeration : undefined,
  };
}

export async function fuseMultiFrameMeasurements(
  frames: DeerAnalysisFrame[],
  _scale?: ScaleEstimation,
): Promise<AntlerMeasurements> {
  if (frames.length === 0) {
    throw new AnalysisError("zero_frames");
  }
  const profile = useHunterProfile.getState();
  const response = await analyzeImages({
    mode: "score",
    imageUris: frames.map((frame) => frame.imageUri),
    species: profile.species,
  });
  if (response.result.isValidDeer === false) {
    const reason = typeof response.result.invalidReason === "string" ? response.result.invalidReason : "no_antlers";
    throw new AnalysisError(reason === "not_deer" ? "not_deer" : "no_antlers");
  }
  return toMeasurements(response.result);
}

/** The proxy already fused the frames. This stays so older call sites do not fire a second request. */
export async function refineWithCloudProcessing(
  measurements: AntlerMeasurements,
  _frames: DeerAnalysisFrame[],
  _scale: ScaleEstimation,
): Promise<AntlerMeasurements> {
  return measurements;
}
