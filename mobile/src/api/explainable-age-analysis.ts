/**
 * Age analysis through the DeerAge proxy.
 * The server runs the frames in parallel and returns the median age.
 */

import {
  AgeBand,
  AgeCue,
  AgeCueName,
  ExplainableAgeEstimation,
  PropertyRules,
} from "../types/deer-scoring";
import { analyzeImages } from "./proxy";
import { rememberScale } from "./deer-analysis";
import { useHunterProfile } from "../state/hunterProfile";
import { normalizeFieldCall } from "../utils/field-call";
import type { ScaleEstimation } from "../types/deer-scoring";

const BANDS: AgeBand[] = ["1.5-2.5 years", "2.5-3.5 years", "3.5-4.5 years", "4.5-5.5 years", "5.5+ years"];
const CUE_NAMES = new Set<AgeCueName>([
  "neck_thickness",
  "chest_depth",
  "brisket",
  "backline",
  "belly",
  "leg_proportion",
  "face_shape",
  "rump_ham",
  "waist_tuck",
  "muscle_definition",
]);

function bandFor(years: number, reported: unknown): AgeBand {
  if (typeof reported === "string" && BANDS.includes(reported as AgeBand)) return reported as AgeBand;
  if (years < 2.5) return "1.5-2.5 years";
  if (years < 3.5) return "2.5-3.5 years";
  if (years < 4.5) return "3.5-4.5 years";
  if (years < 5.5) return "4.5-5.5 years";
  return "5.5+ years";
}

function weight(indicator: unknown): number {
  if (indicator === "post-mature") return 3;
  if (indicator === "mature") return 2;
  if (indicator === "immature") return -2;
  return 0;
}

function cuesFrom(raw: unknown, topCues: string[]): AgeCue[] {
  const rows = Array.isArray(raw) ? raw : [];
  const cues: AgeCue[] = rows.map((row) => {
    const item = row as Record<string, unknown>;
    const name = CUE_NAMES.has(item.name as AgeCueName) ? (item.name as AgeCueName) : "chest_depth";
    const confidence = Math.max(0, Math.min(100, Math.round(Number(item.confidence) || 50)));
    return {
      name,
      displayName: typeof item.displayName === "string" ? item.displayName : name.replace(/_/g, " "),
      detectedPattern: typeof item.pattern === "string" ? item.pattern : "",
      confidence,
      ageWeight: weight(item.indicator),
      explanation: typeof item.pattern === "string" ? item.pattern : "",
    };
  });
  if (cues.length > 0) return cues;
  return topCues.map((cue) => ({
    name: "chest_depth" as const,
    displayName: cue,
    detectedPattern: cue,
    confidence: 60,
    ageWeight: 0,
    explanation: cue,
  }));
}

export async function analyzeExplainableAge(
  imageUri: string,
  minimumShooterAge: number = 3.5,
  rules?: PropertyRules,
  extraImageUris: string[] = [],
): Promise<ExplainableAgeEstimation> {
  const profile = useHunterProfile.getState();
  const uris = [imageUri, ...extraImageUris.filter((uri) => uri && uri !== imageUri)];
  const response = await analyzeImages({
    mode: "age",
    imageUris: uris,
    minimumShooterAge,
    species: rules?.species ?? profile.species,
  });
  const result = response.result;
  const scaleRaw = (result.scale ?? {}) as Record<string, unknown>;
  const confidence = scaleRaw.confidence === "High" || scaleRaw.confidence === "Low" ? scaleRaw.confidence : "Med";
  const scale: ScaleEstimation = {
    method: scaleRaw.method === "unknown" ? "skull-prior" : "hybrid",
    pixelsPerInch: Number(scaleRaw.pixelsPerInch) || 0,
    confidence,
  };
  rememberScale(scale);
  const ageLabel = typeof result.ageLabel === "string" && result.ageLabel.trim() ? result.ageLabel.trim() : undefined;
  const hydrogen = result.pipeline === "hydrogen" || Boolean(ageLabel);
  const years = Number(result.estimatedAgeYears) || 2.5;
  const topCues = Array.isArray(result.topCues) ? result.topCues.filter((cue): cue is string => typeof cue === "string") : [];
  const detectedCues = cuesFrom(result.cues, topCues);
  const quality = result.imageQuality === "good" || result.imageQuality === "poor" ? result.imageQuality : "fair";
  const label = result.shooterPassLabel;
  const shooterPassLabel = label === "SHOOTER" || label === "LET WALK" || label === "NICE HARVEST" || label === "NICE MOUNT" ? label : years >= minimumShooterAge ? "SHOOTER" : "LET WALK";

  return {
    estimatedAge: bandFor(years, result.estimatedAge),
    estimatedAgeYears: years,
    overallConfidence: hydrogen ? 0 : Math.max(0, Math.min(100, Math.round(Number(result.overallConfidence) || 50))),
    meetsMinimumAge: Boolean(result.meetsMinimumAge),
    minimumAgeThreshold: minimumShooterAge,
    shooterPassLabel,
    shooterPassReason: typeof result.shooterPassReason === "string" ? result.shooterPassReason : topCues.join(". "),
    detectedCues,
    bodyFeatureOverlays: [],
    netAgePush: detectedCues.reduce((total, cue) => total + cue.ageWeight, 0),
    imageQuality: quality,
    occlusionLevel: "minimal",
    photoTips: quality === "poor" ? ["Use a broadside photo with the whole body in daylight."] : undefined,
    fieldCall: normalizeFieldCall(result.fieldCall),
    fieldCallNote: typeof result.fieldCallNote === "string" ? result.fieldCallNote : undefined,
    cueBullets: Array.isArray(result.cueBullets) ? result.cueBullets as { area: string; text: string }[] : undefined,
    fastAge: Number.isFinite(Number(result.fastAge)) ? Number(result.fastAge) : null,
    mainAge: Number.isFinite(Number(result.mainAge)) ? Number(result.mainAge) : null,
    bodyOnlyAge: Number.isFinite(Number(result.bodyOnlyAge)) ? Number(result.bodyOnlyAge) : null,
    betterAngle: typeof result.betterAngle === "string" ? result.betterAngle : "",
    ageLabel,
    isRange: result.isRange === true,
    hunterCue: typeof result.hunterCue === "string" && result.hunterCue.trim() ? result.hunterCue.trim() : undefined,
    lookFor: typeof result.lookFor === "string" && result.lookFor.trim() ? result.lookFor.trim() : undefined,
    reasons: Array.isArray(result.reasons)
      ? result.reasons.filter((line): line is string => typeof line === "string" && line.trim().length > 0).map((line) => line.trim())
      : undefined,
    pipeline: hydrogen ? "hydrogen" : "openai",
    scanJobId: response.jobId,
  };
}
