/**
 * Boone & Crockett Scoring Calculator
 * Official scoring rules implementation for whitetail deer
 */

import {
  AntlerMeasurements,
  BooneAndCrockettScore,
  MeasurementRange,
  ConfidenceLevel,
  ScoreCategory,
} from "../types/deer-scoring";

/**
 * Helper to get numeric value from measurement or range
 */
const getValue = (measurement: number | MeasurementRange | undefined): number => {
  if (!measurement) return 0;
  if (typeof measurement === "number") return measurement;
  return measurement.average;
};

/**
 * Helper to determine if measurement is a range
 */
const isRange = (measurement: number | MeasurementRange | undefined): boolean => {
  return measurement !== undefined && typeof measurement !== "number";
};

/**
 * Calculate symmetry deductions between left and right measurements
 */
const calculateSymmetryDeductions = (measurements: AntlerMeasurements): number => {
  let deductions = 0;

  // Main beam length difference
  const rightBeam = getValue(measurements.rightMainBeam.length);
  const leftBeam = getValue(measurements.leftMainBeam.length);
  deductions += Math.abs(rightBeam - leftBeam);

  // Tine length differences
  const tinePositions = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;

  for (const pos of tinePositions) {
    const rightKey = `right${pos}` as keyof AntlerMeasurements;
    const leftKey = `left${pos}` as keyof AntlerMeasurements;

    const rightTine = measurements[rightKey];
    const leftTine = measurements[leftKey];

    const rightLength = rightTine && typeof rightTine === "object" && "length" in rightTine
      ? getValue(rightTine.length)
      : 0;
    const leftLength = leftTine && typeof leftTine === "object" && "length" in leftTine
      ? getValue(leftTine.length)
      : 0;

    deductions += Math.abs(rightLength - leftLength);
  }

  // Circumference differences
  const circumPositions = ["h1", "h2", "h3", "h4"] as const;

  for (const pos of circumPositions) {
    const rightCirc = getValue(measurements.rightCircumferences[pos]);
    const leftCirc = getValue(measurements.leftCircumferences[pos]);
    deductions += Math.abs(rightCirc - leftCirc);
  }

  return deductions;
};

/**
 * Calculate total abnormal points
 */
const calculateAbnormalPoints = (measurements: AntlerMeasurements): number => {
  return measurements.abnormalPoints.reduce((total, point) => {
    return total + getValue(point.length);
  }, 0);
};

/**
 * Calculate spread credit
 * Credit is given for inside spread, but cannot exceed the longer main beam
 */
const calculateSpreadCredit = (measurements: AntlerMeasurements): number => {
  const insideSpread = getValue(measurements.insideSpread);
  const rightBeam = getValue(measurements.rightMainBeam.length);
  const leftBeam = getValue(measurements.leftMainBeam.length);
  const longerBeam = Math.max(rightBeam, leftBeam);

  // Spread credit cannot exceed the longer main beam
  return Math.min(insideSpread, longerBeam);
};

/**
 * Calculate total main beam length
 */
const calculateTotalMainBeamLength = (measurements: AntlerMeasurements): number => {
  return getValue(measurements.rightMainBeam.length) + getValue(measurements.leftMainBeam.length);
};

/**
 * Calculate total tine length (all normal points)
 */
const calculateTotalTineLength = (measurements: AntlerMeasurements): number => {
  let total = 0;

  const tinePositions = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;

  for (const pos of tinePositions) {
    const rightKey = `right${pos}` as keyof AntlerMeasurements;
    const leftKey = `left${pos}` as keyof AntlerMeasurements;

    const rightTine = measurements[rightKey];
    const leftTine = measurements[leftKey];

    if (rightTine && typeof rightTine === "object" && "length" in rightTine) {
      total += getValue(rightTine.length);
    }
    if (leftTine && typeof leftTine === "object" && "length" in leftTine) {
      total += getValue(leftTine.length);
    }
  }

  return total;
};

/**
 * Calculate total mass (all circumferences)
 */
const calculateTotalMass = (measurements: AntlerMeasurements): number => {
  let total = 0;

  const circumPositions = ["h1", "h2", "h3", "h4"] as const;

  for (const pos of circumPositions) {
    total += getValue(measurements.rightCircumferences[pos]);
    total += getValue(measurements.leftCircumferences[pos]);
  }

  return total;
};

/**
 * Count actual normal points (typical tines)
 * In Boone & Crockett scoring, each main beam counts as 1 point,
 * plus each normal tine (G1-G6) on both sides
 */
const countNormalPoints = (measurements: AntlerMeasurements): number => {
  let count = 0;

  // Count 2 for the main beams (always present)
  count += 2;

  // Count normal tines (G1-G6) on both sides
  const tinePositions = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;

  for (const pos of tinePositions) {
    const rightKey = `right${pos}` as keyof AntlerMeasurements;
    const leftKey = `left${pos}` as keyof AntlerMeasurements;

    const rightTine = measurements[rightKey];
    const leftTine = measurements[leftKey];

    // Count right tine if it exists and has measurable length
    if (rightTine && typeof rightTine === "object" && "length" in rightTine) {
      const length = getValue(rightTine.length);
      if (length >= 1.0) { // B&C rules: tines must be at least 1 inch
        count++;
      }
    }

    // Count left tine if it exists and has measurable length
    if (leftTine && typeof leftTine === "object" && "length" in leftTine) {
      const length = getValue(leftTine.length);
      if (length >= 1.0) { // B&C rules: tines must be at least 1 inch
        count++;
      }
    }
  }

  return count;
};

/**
 * Determine overall confidence level based on individual measurements
 */
const determineOverallConfidence = (measurements: AntlerMeasurements): ConfidenceLevel => {
  let lowCount = 0;
  let medCount = 0;
  let highCount = 0;

  const checkConfidence = (measurement: number | MeasurementRange | undefined) => {
    if (isRange(measurement)) {
      const range = measurement as MeasurementRange;
      if (range.confidence === "Low") lowCount++;
      else if (range.confidence === "Med") medCount++;
      else highCount++;
    } else if (measurement !== undefined) {
      highCount++; // Assume high confidence for direct measurements
    }
  };

  // Check main beams
  checkConfidence(measurements.rightMainBeam.length);
  checkConfidence(measurements.leftMainBeam.length);

  // Check all tines
  const tinePositions = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
  for (const pos of tinePositions) {
    const rightKey = `right${pos}` as keyof AntlerMeasurements;
    const leftKey = `left${pos}` as keyof AntlerMeasurements;

    const rightTine = measurements[rightKey];
    const leftTine = measurements[leftKey];

    if (rightTine && typeof rightTine === "object" && "length" in rightTine) {
      checkConfidence(rightTine.length);
    }
    if (leftTine && typeof leftTine === "object" && "length" in leftTine) {
      checkConfidence(leftTine.length);
    }
  }

  // Determine overall confidence
  if (lowCount > 0) return "Low";
  if (medCount > 2) return "Med";
  return "High";
};

/**
 * Calculate complete Boone & Crockett score
 */
export const calculateBooneAndCrockettScore = (
  measurements: AntlerMeasurements
): BooneAndCrockettScore => {
  // Calculate component totals
  const totalMainBeamLength = calculateTotalMainBeamLength(measurements);
  const totalTineLength = calculateTotalTineLength(measurements);
  const totalMass = calculateTotalMass(measurements);
  const spreadCredit = calculateSpreadCredit(measurements);

  // Calculate deductions
  const symmetryDeductions = calculateSymmetryDeductions(measurements);
  const abnormalPointsTotal = calculateAbnormalPoints(measurements);

  // Calculate gross scores (before deductions)
  const grossTypicalBase =
    totalMainBeamLength +
    totalTineLength +
    totalMass +
    spreadCredit;

  const grossTypical = grossTypicalBase;
  const grossNonTypical = grossTypicalBase + abnormalPointsTotal;

  // Calculate net scores (after deductions)
  const netTypical = grossTypical - symmetryDeductions;
  const netNonTypical = grossNonTypical - symmetryDeductions;

  // Determine recommended category
  // If abnormal points are significant (>10 inches), Non-Typical is recommended
  const recommendedCategory: ScoreCategory =
    abnormalPointsTotal > 10 ? "Non-Typical" : "Typical";

  // Determine overall confidence
  const overallConfidence = determineOverallConfidence(measurements);

  return {
    category: recommendedCategory,
    grossTypical,
    grossNonTypical,
    netTypical,
    netNonTypical,
    symmetryDeductions,
    abnormalPointsTotal,
    spreadCredit,
    totalMainBeamLength,
    totalTineLength,
    totalMass,
    overallConfidence,
    recommendedCategory,
    measurements,
  };
};

/** Hunter-facing label when a rack was not scored. Never show this as 0.00. */
export const NOT_SCORED = "Not scored";

function positiveAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
  if (value && typeof value === "object" && "average" in value) {
    const average = (value as { average?: unknown }).average;
    return typeof average === "number" && Number.isFinite(average) && average > 0 ? average : 0;
  }
  return 0;
}

const TINE_KEYS = [
  "rightG1", "rightG2", "rightG3", "rightG4", "rightG5", "rightG6",
  "leftG1", "leftG2", "leftG3", "leftG4", "leftG5", "leftG6",
] as const;

function tineInches(tine: unknown): number {
  if (!tine || typeof tine !== "object" || !("length" in tine)) return 0;
  return positiveAmount((tine as { length?: unknown }).length);
}

/** True when a beam, tine, spread, or mass measurement is actually present. */
export function hasAntlerMeasurements(measurements: AntlerMeasurements | null | undefined): boolean {
  if (!measurements) return false;
  if (positiveAmount(measurements.rightMainBeam?.length) > 0) return true;
  if (positiveAmount(measurements.leftMainBeam?.length) > 0) return true;
  if (positiveAmount(measurements.insideSpread) > 0) return true;
  if (positiveAmount(measurements.greatestSpread) > 0) return true;
  for (const key of TINE_KEYS) {
    if (tineInches(measurements[key]) > 0) return true;
  }
  for (const point of measurements.abnormalPoints ?? []) {
    if (tineInches(point) > 0) return true;
  }
  for (const side of [measurements.rightCircumferences, measurements.leftCircumferences]) {
    if (!side) continue;
    if (positiveAmount(side.h1) > 0 || positiveAmount(side.h2) > 0 || positiveAmount(side.h3) > 0 || positiveAmount(side.h4) > 0) {
      return true;
    }
  }
  return false;
}

/** True when the score job counted points. A missing count is not zero points. */
export function hasCountedPoints(score: BooneAndCrockettScore | null | undefined): boolean {
  const measurements = score?.measurements;
  if (!measurements) return false;
  return measurements.totalPoints > 0
    || measurements.totalAbnormalPoints > 0
    || measurements.leftSidePoints > 0
    || measurements.rightSidePoints > 0;
}

/**
 * False for a missing score and for the all-zero score age scans used to save.
 * True when any total or measurement is a real length.
 */
export function hasRealScore(score: BooneAndCrockettScore | null | undefined): boolean {
  if (!score) return false;
  const totals = [
    score.grossTypical,
    score.grossNonTypical,
    score.netTypical,
    score.netNonTypical,
    score.spreadCredit,
    score.totalMainBeamLength,
    score.totalTineLength,
    score.totalMass,
    score.abnormalPointsTotal,
  ];
  if (totals.some((value) => positiveAmount(value) > 0)) return true;
  return hasAntlerMeasurements(score.measurements);
}

/**
 * Use the server gross when the tine list was empty. The local calculator
 * would otherwise turn that into a score of 0.
 */
export function scoreFromServerGross(score: BooneAndCrockettScore, gross: number): BooneAndCrockettScore {
  if (!(typeof gross === "number" && Number.isFinite(gross) && gross > 0)) return score;
  return {
    ...score,
    grossTypical: gross,
    grossNonTypical: gross,
    netTypical: gross,
    netNonTypical: gross,
  };
}

/**
 * Format score for display (handles ranges).
 * Null and undefined are not a score of zero.
 */
export const formatScore = (score: number | MeasurementRange | undefined | null): string => {
  if (score === undefined || score === null) {
    return NOT_SCORED;
  }

  if (typeof score === "number") {
    if (!Number.isFinite(score)) return NOT_SCORED;
    return score.toFixed(2);
  }

  // Handle MeasurementRange with null checks
  const min = score.min ?? 0;
  const max = score.max ?? 0;
  const avg = score.average ?? 0;

  return `${min.toFixed(2)}-${max.toFixed(2)} (avg: ${avg.toFixed(2)})`;
};

/**
 * Validate minimum B&C entry scores
 * Typical: 160 inches (net)
 * Non-Typical: 185 inches (net)
 */
export const meetsBooneAndCrockettMinimum = (score: BooneAndCrockettScore): {
  typical: boolean;
  nonTypical: boolean;
} => {
  const typicalNet = getValue(score.netTypical);
  const nonTypicalNet = getValue(score.netNonTypical);

  return {
    typical: typicalNet >= 160,
    nonTypical: nonTypicalNet >= 185,
  };
};
