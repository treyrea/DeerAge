/**
 * Quick Check through the DeerAge proxy. One photo, one short vision call.
 */

import { AgeClass } from "../types/deer-scoring";
import { AnalysisError } from "./errors";
import { analyzeImages } from "./proxy";
import { quickConfidence, quickKeyFeature, requireQuickAge, type QuickKeyFeature } from "./quick-result";
import { useHunterProfile } from "../state/hunterProfile";
import { normalizeFieldCall } from "../utils/field-call";

export interface QuickAgeResult {
  decision: "SHOOT" | "LET WALK";
  isValidImage: boolean;
  invalidImageReason?: "head_mount" | "not_deer" | "no_body_visible" | "poor_quality" | "too_small" | "retake";
  invalidImageMessage?: string;
  estimatedAgeClass: AgeClass;
  confidence: number;
  explanation: string;
  features: {
    neckBrisketIntegration: FeatureRead;
    chestHindquarterRatio: FeatureRead;
    legBodyProportion: FeatureRead;
  };
  /** Only when the server named one. */
  keyFeature?: QuickKeyFeature;
  canAnalyzeFurther: boolean;
  imageQuality: "good" | "fair" | "poor";
  disclaimer: string;
  ageYears?: number;
  topCues?: string[];
  fieldCall?: "SHOOTER" | "LET WALK" | "BORDERLINE";
  fieldCallNote?: string;
  cueBullets?: { area: string; text: string }[];
  shotReceipt?: import("../types/shot-record").ShotReceipt | null;
  fastAge?: number | null;
  mainAge?: number | null;
  bodyOnlyAge?: number | null;
  betterAngle?: string;
}

interface FeatureRead {
  pattern: string;
  indicator: "immature" | "transitional" | "mature" | "post-mature";
  confidence: number;
}

const CLASSES: AgeClass[] = ["1.5-2.5", "2.5-3.5", "3.5-4.5", "4.5-5.5", "5.5+"];
const DISCLAIMER = "Age estimates are based on proportional body characteristics and represent age classes, not exact age.";

function feature(raw: unknown): FeatureRead {
  const source = (raw ?? {}) as Record<string, unknown>;
  const indicator = source.indicator;
  const safe = indicator === "immature" || indicator === "mature" || indicator === "post-mature" || indicator === "transitional" ? indicator : "transitional";
  return {
    pattern: typeof source.pattern === "string" ? source.pattern : "",
    indicator: safe,
    confidence: Math.max(0, Math.min(100, Math.round(Number(source.confidence) || 50))),
  };
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ageClass(value: unknown, years: number): AgeClass {
  if (typeof value === "string" && CLASSES.includes(value as AgeClass)) return value as AgeClass;
  if (years < 2.5) return "1.5-2.5";
  if (years < 3.5) return "2.5-3.5";
  if (years < 4.5) return "3.5-4.5";
  if (years < 5.5) return "4.5-5.5";
  return "5.5+";
}

export async function quickAgeCheck(imageUri: string, minimumShooterAge: number = 3.5): Promise<QuickAgeResult> {
  const profile = useHunterProfile.getState();
  let response;
  try {
    response = await analyzeImages({
      mode: "quick",
      imageUris: [imageUri],
      minimumShooterAge,
      species: profile.species,
    });
  } catch (error) {
    if (error instanceof AnalysisError && (error.code === "not_deer" || error.code === "no_body" || error.code === "poor_quality" || error.code === "retake")) {
      const reason = error.code === "no_body" ? "no_body_visible" : error.code === "poor_quality" ? "poor_quality" : error.code === "retake" ? "too_small" : "not_deer";
      return {
        decision: "LET WALK",
        isValidImage: false,
        invalidImageReason: reason,
        invalidImageMessage: error.message,
        estimatedAgeClass: "1.5-2.5",
        confidence: 0,
        explanation: error.message,
        features: {
          neckBrisketIntegration: feature(null),
          chestHindquarterRatio: feature(null),
          legBodyProportion: feature(null),
        },
        canAnalyzeFurther: false,
        imageQuality: "poor",
        disclaimer: DISCLAIMER,
      };
    }
    throw error;
  }

  const result = response.result;
  const featuresRaw = (result.features ?? {}) as Record<string, unknown>;
  // No age back means the read failed. Show an error, never the lease minimum as a stand-in.
  const years = requireQuickAge(result.ageYears);
  const key = quickKeyFeature(result.keyFeature);
  const quality = result.imageQuality === "good" || result.imageQuality === "poor" ? result.imageQuality : "fair";
  const topCues = Array.isArray(result.topCues) ? result.topCues.filter((cue): cue is string => typeof cue === "string") : [];

  return {
    decision: result.decision === "SHOOT" ? "SHOOT" : "LET WALK",
    isValidImage: result.isValidImage !== false,
    estimatedAgeClass: ageClass(result.estimatedAgeClass, years),
    confidence: quickConfidence(result.confidence),
    explanation: typeof result.explanation === "string" ? result.explanation : "",
    features: {
      neckBrisketIntegration: feature(featuresRaw.neckBrisketIntegration),
      chestHindquarterRatio: feature(featuresRaw.chestHindquarterRatio),
      legBodyProportion: feature(featuresRaw.legBodyProportion),
    },
    keyFeature: key,
    canAnalyzeFurther: result.canAnalyzeFurther !== false && quality !== "poor",
    imageQuality: quality,
    disclaimer: DISCLAIMER,
    ageYears: years,
    topCues,
    fieldCall: normalizeFieldCall(result.fieldCall),
    fieldCallNote: typeof result.fieldCallNote === "string" ? result.fieldCallNote : undefined,
    cueBullets: Array.isArray(result.cueBullets) ? result.cueBullets as { area: string; text: string }[] : undefined,
    shotReceipt: response.receipt,
    fastAge: numberOrNull(result.fastAge),
    mainAge: numberOrNull(result.mainAge),
    bodyOnlyAge: numberOrNull(result.bodyOnlyAge),
    betterAngle: typeof result.betterAngle === "string" ? result.betterAngle : "",
  };
}
