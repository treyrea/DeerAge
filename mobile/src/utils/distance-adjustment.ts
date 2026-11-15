/**
 * Distance Adjustment Utilities
 * Core logic for adjusting analysis confidence based on distance
 */

import type {
  DistanceConfidence,
  DistanceAdjustmentResult,
  ZoomMeta,
} from "../types/distance";

/**
 * Compute confidence adjustment based on distance, confidence level, and zoom
 *
 * Rules:
 * - If distance missing: confidenceMultiplier = 0.85, warning about accuracy
 * - If distance provided with high confidence:
 *   - 50-100 yd: multiplier 1.0
 *   - 101-150 yd: multiplier 0.95
 *   - 151-200 yd: multiplier 0.90
 *   - >200 yd: multiplier 0.80 + warning
 * - Medium confidence: subtract 0.05 from above
 * - Low confidence: subtract 0.10 from above
 *
 * Trait adjustments at >125 yd:
 * - Reduce antler mass thickness and brisket sag weights by 15-25%
 * - Increase antler configuration weight by 10-15%
 */
export function computeDistanceAdjustment(
  distanceYards: number | undefined,
  distanceConfidence: DistanceConfidence | undefined,
  zoomMeta?: ZoomMeta
): DistanceAdjustmentResult {
  const warnings: string[] = [];
  let confidenceMultiplier = 1.0;
  let traitWeightAdjustments: DistanceAdjustmentResult["traitWeightAdjustments"];

  // Case 1: No distance provided
  if (distanceYards === undefined || distanceYards === null) {
    return {
      confidenceMultiplier: 0.85,
      warnings: ["No distance provided; results may be less accurate."],
    };
  }

  // Case 2: Distance provided - calculate base multiplier
  if (distanceYards <= 100) {
    confidenceMultiplier = 1.0;
  } else if (distanceYards <= 150) {
    confidenceMultiplier = 0.95;
  } else if (distanceYards <= 200) {
    confidenceMultiplier = 0.90;
    if (distanceYards > 175) {
      warnings.push("Distance over 175 yards may reduce measurement reliability.");
    }
  } else {
    // > 200 yards
    confidenceMultiplier = 0.80;
    warnings.push("Long distance (200+ yd) reduces reliability of body measurements.");
  }

  // Adjust for confidence level
  const confidenceAdjustment =
    distanceConfidence === "high" ? 0 :
    distanceConfidence === "medium" ? -0.05 :
    -0.10; // low confidence

  confidenceMultiplier = Math.max(0.5, confidenceMultiplier + confidenceAdjustment);

  // Add warning for estimated distances at long range
  if (distanceYards > 150 && distanceConfidence !== "high") {
    warnings.push("Estimated distance at 150+ yd; consider using a rangefinder.");
  }

  // Trait weight adjustments for distances > 125 yards
  if (distanceYards > 125) {
    // Calculate adjustment factor based on distance (linear scaling)
    // At 125 yd: 0%, at 200 yd: ~25%
    const distanceFactor = Math.min((distanceYards - 125) / 75, 1);

    // At long range, body mass and brisket are harder to judge
    const massReduction = -0.15 - (distanceFactor * 0.10); // -15% to -25%
    const brisketReduction = -0.15 - (distanceFactor * 0.10); // -15% to -25%

    // Antler configuration (shape, spread, points) is more visible at distance
    const configIncrease = 0.10 + (distanceFactor * 0.05); // +10% to +15%

    traitWeightAdjustments = {
      antlerMassThickness: massReduction,
      brisketSag: brisketReduction,
      antlerConfiguration: configIncrease,
    };
  }

  // Consider zoom if provided
  if (zoomMeta) {
    // Heavy digital zoom reduces reliability
    if (zoomMeta.isDigitalZoom && zoomMeta.zoomFactor && zoomMeta.zoomFactor > 3) {
      confidenceMultiplier *= 0.95;
      if (!warnings.some((w) => w.includes("digital zoom"))) {
        warnings.push("Heavy digital zoom may reduce image quality.");
      }
    }
  }

  // Limit to 2 warnings max
  const limitedWarnings = warnings.slice(0, 2);

  return {
    confidenceMultiplier,
    warnings: limitedWarnings,
    traitWeightAdjustments,
  };
}

/**
 * Get a human-readable confidence label based on multiplier
 */
export function getConfidenceLabel(multiplier: number): "High" | "Medium" | "Low" {
  if (multiplier >= 0.95) return "High";
  if (multiplier >= 0.85) return "Medium";
  return "Low";
}

/**
 * Format distance for display with optional source indicator
 */
export function formatDistanceDisplay(
  distanceYards: number,
  source?: string
): string {
  const sourceIndicator =
    source === "rangefinder_bluetooth" || source === "rangefinder_manual"
      ? " (Ranged)"
      : source === "estimated_ai"
      ? " (AI Est.)"
      : "";

  return `${distanceYards} yd${sourceIndicator}`;
}

/**
 * Calculate overall analysis confidence combining base confidence and distance adjustment
 */
export function calculateOverallConfidence(
  baseConfidence: number, // 0-1 or 0-100
  distanceAdjustment: DistanceAdjustmentResult
): number {
  // Normalize base confidence to 0-1 if needed
  const normalizedBase = baseConfidence > 1 ? baseConfidence / 100 : baseConfidence;

  // Apply multiplier
  const adjusted = normalizedBase * distanceAdjustment.confidenceMultiplier;

  // Return as percentage (0-100)
  return Math.round(Math.max(0, Math.min(100, adjusted * 100)));
}

/**
 * Apply trait weight adjustments to analysis weights
 */
export function applyTraitWeightAdjustments(
  baseWeights: Record<string, number>,
  adjustments: DistanceAdjustmentResult["traitWeightAdjustments"]
): Record<string, number> {
  if (!adjustments) return baseWeights;

  const adjusted = { ...baseWeights };

  // Apply adjustments to specific traits
  const traitMappings: Record<string, string[]> = {
    antlerMassThickness: ["mass", "thickness", "circumference", "h1", "h2", "h3", "h4"],
    brisketSag: ["brisket", "chest", "body_depth", "belly"],
    antlerConfiguration: ["spread", "configuration", "points", "tines", "beam"],
  };

  Object.entries(adjustments).forEach(([adjustmentKey, adjustmentValue]) => {
    if (adjustmentValue === undefined) return;

    const traits = traitMappings[adjustmentKey] || [];
    traits.forEach((trait) => {
      Object.keys(adjusted).forEach((key) => {
        if (key.toLowerCase().includes(trait.toLowerCase())) {
          adjusted[key] *= (1 + adjustmentValue);
        }
      });
    });
  });

  return adjusted;
}

/**
 * Check if distance should trigger a warning display
 */
export function shouldShowDistanceWarning(
  distanceYards: number | undefined,
  distanceConfidence: DistanceConfidence | undefined
): boolean {
  // No distance provided
  if (distanceYards === undefined) return true;

  // Long distance with estimated confidence
  if (distanceYards > 150 && distanceConfidence !== "high") return true;

  // Very long distance regardless of confidence
  if (distanceYards > 200) return true;

  return false;
}

/**
 * Get distance-based recommendations for improving accuracy
 */
export function getDistanceRecommendations(
  distanceYards: number | undefined,
  distanceConfidence: DistanceConfidence | undefined
): string[] {
  const recommendations: string[] = [];

  if (distanceYards === undefined) {
    recommendations.push("Add distance to improve accuracy");
    recommendations.push("Use a rangefinder for best results");
    return recommendations;
  }

  if (distanceYards > 150) {
    recommendations.push("Move closer (under 150 yd) for more accurate body measurements");
  }

  if (distanceConfidence !== "high") {
    recommendations.push("Use a rangefinder for exact distance");
  }

  if (distanceYards > 200) {
    recommendations.push("Focus on antler configuration rather than body details");
    recommendations.push("Consider waiting for the deer to move closer");
  }

  return recommendations.slice(0, 3);
}
