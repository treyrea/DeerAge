import type { ExplainableAgeEstimation } from "../types/deer-scoring";
import { calculateBooneAndCrockettScore, hasRealScore } from "../utils/boone-crockett-calculator";
import { createAgeResult } from "./age-result";

const explainableAge: ExplainableAgeEstimation = {
  estimatedAge: "3.5-4.5 years",
  estimatedAgeYears: 3.5,
  overallConfidence: 70,
  meetsMinimumAge: false,
  minimumAgeThreshold: 3.5,
  shooterPassLabel: "LET WALK",
  shooterPassReason: "Below the minimum",
  detectedCues: [],
  bodyFeatureOverlays: [],
  netAgePush: 0,
  imageQuality: "good",
  occlusionLevel: "minimal",
};

function ageResult() {
  return createAgeResult({
    analysisId: "deer-age-test",
    timestamp: new Date("2026-11-26T12:00:00Z"),
    capturedFrames: [],
    scale: { method: "hybrid", pixelsPerInch: 10, confidence: "Med" },
    explainableAge,
    processingTime: 1200,
    distanceAdjusted: false,
  });
}

describe("age scan result", () => {
  it("has no numeric 0 rack score", () => {
    const result = ageResult();
    expect(result.analysisMode).toBe("age");
    expect(result.score).toBeUndefined();
    expect("score" in result).toBe(false);
    expect(hasRealScore(result.score)).toBe(false);
    const saved = JSON.stringify(result);
    expect(saved).not.toContain("grossTypical");
    expect(saved).not.toContain("netTypical");
    expect(saved).not.toContain("\"score\"");
  });

  it("still treats an older saved all-zero score as not scored", () => {
    const empty = calculateBooneAndCrockettScore({
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
    });
    const saved = { ...ageResult(), score: empty };
    expect(saved.score.netTypical).toBe(0);
    expect(hasRealScore(saved.score)).toBe(false);
  });
});
