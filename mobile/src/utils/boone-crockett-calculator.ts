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

/**
 * Format score for display (handles ranges)
 */
export const formatScore = (score: number | MeasurementRange | undefined | null): string => {
  if (score === undefined || score === null) {
    return "0.00";
  }

  if (typeof score === "number") {
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
