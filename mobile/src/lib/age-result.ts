/**
 * Age My Deer result. The age read is the result.
 * This scan does not score the rack, and it does not invent a 0" score.
 */

import type {
  AgeEstimation,
  AntlerMeasurements,
  DeerScoringResult,
  ExplainableAgeEstimation,
  ScaleEstimation,
} from "../types/deer-scoring";
import { estimateDeerAge } from "../utils/scale-and-age-estimation";

/** Kept only so the legacy age field stays filled. It is not stored as a rack score. */
function legacyAgeSeed(): AntlerMeasurements {
  return {
    rightMainBeam: { length: 0, side: "right" },
    leftMainBeam: { length: 0, side: "left" },
    abnormalPoints: [],
    rightCircumferences: {},
    leftCircumferences: {},
    insideSpread: 0,
    totalPoints: 0,
    leftSidePoints: 0,
    rightSidePoints: 0,
    totalAbnormalPoints: 0,
  };
}

export interface AgeResultInput {
  analysisId: string;
  timestamp: Date;
  capturedFrames: DeerScoringResult["capturedFrames"];
  scale: ScaleEstimation;
  explainableAge: ExplainableAgeEstimation;
  processingTime: number;
  analysisConfidence?: number;
  distanceAdjusted: boolean;
  distanceMeasurement?: DeerScoringResult["distanceMeasurement"];
  zoomMeta?: DeerScoringResult["zoomMeta"];
  shotReceipt?: DeerScoringResult["shotReceipt"];
}

export function createAgeResult(input: AgeResultInput): DeerScoringResult {
  const age: AgeEstimation = estimateDeerAge(legacyAgeSeed());
  return {
    analysisId: input.analysisId,
    timestamp: input.timestamp,
    analysisMode: "age",
    capturedFrames: input.capturedFrames,
    fusedFrameCount: 1,
    scale: input.scale,
    age,
    explainableAge: input.explainableAge,
    processingTime: input.processingTime,
    onDeviceProcessing: true,
    cloudRefinementUsed: false,
    distanceMeasurement: input.distanceMeasurement,
    zoomMeta: input.zoomMeta,
    analysisConfidence: input.analysisConfidence,
    distanceAdjusted: input.distanceAdjusted,
    shotReceipt: input.shotReceipt,
  };
}
