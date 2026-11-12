/**
 * Scale Estimation and Age Estimation Utilities
 */

import {
  ScaleEstimation,
  AgeEstimation,
  ConfidenceLevel,
  AgeBand,
  AntlerMeasurements,
} from "../types/deer-scoring";
import type { DistanceMeasurement } from "../types/distance";

/**
 * Distance info for scale estimation
 */
interface DistanceInfo {
  distanceYards: number;
  confidence: "high" | "medium" | "low";
}

/**
 * Estimate scale from depth data
 * Uses device depth sensor data to estimate real-world scale
 */
export const estimateScaleFromDepth = (
  depthData: number[][] | undefined,
  targetDepth?: number
): ScaleEstimation => {
  if (!depthData || depthData.length === 0) {
    return {
      method: "skull-prior",
      pixelsPerInch: 20, // Fallback estimate
      confidence: "Low",
    };
  }

  // Find median depth in the center region (where deer head is likely to be)
  const centerRegion = depthData
    .slice(Math.floor(depthData.length * 0.3), Math.floor(depthData.length * 0.7))
    .map(row => row.slice(Math.floor(row.length * 0.3), Math.floor(row.length * 0.7)))
    .flat()
    .filter(d => d > 0);

  if (centerRegion.length === 0) {
    return {
      method: "skull-prior",
      pixelsPerInch: 20,
      confidence: "Low",
    };
  }

  centerRegion.sort((a, b) => a - b);
  const medianDepth = centerRegion[Math.floor(centerRegion.length / 2)];

  // Estimate pixels per inch based on depth
  // Typical deer skull width: 6-7 inches
  // We use camera FOV and depth to calculate scale
  const estimatedSkullWidthInches = 6.5;
  const focalLengthMM = 4.2; // Typical smartphone camera
  const sensorWidthMM = 5.76; // Typical smartphone sensor
  const imageWidthPixels = depthData[0]?.length || 1920;

  // Calculate pixels per inch
  const pixelsPerInch =
    (focalLengthMM * imageWidthPixels * 25.4) / (medianDepth * 1000 * sensorWidthMM);

  return {
    method: "depth",
    pixelsPerInch: pixelsPerInch || 20,
    confidence: pixelsPerInch > 0 ? "Med" : "Low",
    calibrationDistance: medianDepth,
  };
};

/**
 * Estimate scale from multi-view photogrammetry
 * Analyzes multiple frames to triangulate scale
 * Now accepts optional distance info to boost confidence
 */
export const estimateScaleFromMultiView = (
  frames: { imageUri: string; depthData?: number[][] }[],
  distanceInfo?: DistanceInfo
): ScaleEstimation => {
  // If we have depth data in multiple frames, average them
  const depthFrames = frames.filter(f => f.depthData);

  let baseScale: ScaleEstimation;

  if (depthFrames.length >= 2) {
    const scales = depthFrames.map(f => estimateScaleFromDepth(f.depthData));
    const avgPixelsPerInch =
      scales.reduce((sum, s) => sum + s.pixelsPerInch, 0) / scales.length;

    baseScale = {
      method: "hybrid",
      pixelsPerInch: avgPixelsPerInch,
      confidence: depthFrames.length >= 3 ? "High" : "Med",
    };
  } else {
    // Fallback to skull prior
    baseScale = estimateScaleFromSkullPrior();
  }

  // Boost confidence if distance was provided
  if (distanceInfo) {
    return applyDistanceToScale(baseScale, distanceInfo);
  }

  return baseScale;
};

/**
 * Estimate scale using known skull dimensions as prior
 * Average whitetail buck skull dimensions
 */
export const estimateScaleFromSkullPrior = (): ScaleEstimation => {
  return {
    method: "skull-prior",
    pixelsPerInch: 18, // Conservative estimate
    confidence: "Med",
  };
};

/**
 * Apply distance information to boost scale confidence
 * Known distance helps calibrate the scale estimation
 */
const applyDistanceToScale = (
  baseScale: ScaleEstimation,
  distanceInfo: DistanceInfo
): ScaleEstimation => {
  const { distanceYards, confidence: distanceConfidence } = distanceInfo;

  // Distance in optimal range (50-150 yards) with high confidence = best boost
  const isOptimalRange = distanceYards >= 50 && distanceYards <= 150;
  const isGoodRange = distanceYards >= 30 && distanceYards <= 200;

  let newConfidence: ConfidenceLevel = baseScale.confidence;
  // When combining skull-prior with distance, it becomes a hybrid approach
  let newMethod: ScaleEstimation["method"] = baseScale.method === "skull-prior" ? "hybrid" : baseScale.method;

  // Upgrade confidence based on distance quality
  if (distanceConfidence === "high" && isOptimalRange) {
    // High confidence distance in optimal range: boost to High
    newConfidence = "High";
  } else if (distanceConfidence === "high" && isGoodRange) {
    // High confidence distance in good range: at least Med
    if (baseScale.confidence === "Low") {
      newConfidence = "Med";
    }
  } else if (distanceConfidence === "medium" && isOptimalRange) {
    // Medium confidence but optimal range: boost Low to Med
    if (baseScale.confidence === "Low") {
      newConfidence = "Med";
    }
  }
  // Low confidence distance doesn't boost scale confidence

  // Adjust pixelsPerInch based on distance (rough calibration)
  // At 100 yards, a typical deer body is ~100 pixels wide on phone camera
  // This helps refine the skull-prior estimate
  let adjustedPixelsPerInch = baseScale.pixelsPerInch;
  if (baseScale.method === "skull-prior" && distanceConfidence !== "low") {
    // Rough distance-based calibration factor
    // Closer = more pixels per inch, farther = fewer
    const distanceFactor = 100 / distanceYards; // Normalized to 100 yards
    adjustedPixelsPerInch = baseScale.pixelsPerInch * Math.sqrt(distanceFactor);
    // Clamp to reasonable range
    adjustedPixelsPerInch = Math.max(8, Math.min(40, adjustedPixelsPerInch));
  }

  return {
    method: newMethod,
    pixelsPerInch: adjustedPixelsPerInch,
    confidence: newConfidence,
    calibrationDistance: distanceYards,
  };
};

/**
 * Estimate deer age from antler measurements and body characteristics
 */
export const estimateDeerAge = (
  measurements: AntlerMeasurements,
  bodyFactors?: {
    neckThickness?: "thin" | "moderate" | "thick";
    bodySize?: "small" | "medium" | "large";
  }
): AgeEstimation => {
  // Factors that indicate age
  const mainBeamLength =
    (getValue(measurements.rightMainBeam.length) + getValue(measurements.leftMainBeam.length)) / 2;
  const totalPoints = measurements.totalPoints;

  // Calculate average mass (circumference)
  const circumPositions = ["h1", "h2", "h3", "h4"] as const;
  let totalCircum = 0;
  let circumCount = 0;

  for (const pos of circumPositions) {
    const right = getValue(measurements.rightCircumferences[pos]);
    const left = getValue(measurements.leftCircumferences[pos]);
    if (right > 0) {
      totalCircum += right;
      circumCount++;
    }
    if (left > 0) {
      totalCircum += left;
      circumCount++;
    }
  }

  const avgMass = circumCount > 0 ? totalCircum / circumCount : 3.5;
  const insideSpread = getValue(measurements.insideSpread);

  // Age estimation logic based on known patterns
  let estimatedAge: AgeBand;
  let confidence: ConfidenceLevel;
  let massConfidence: ConfidenceLevel;
  let beamConfidence: ConfidenceLevel;

  // Young bucks (1.5-2.5)
  if (mainBeamLength < 18 && totalPoints <= 6 && avgMass < 3.5) {
    estimatedAge = "1.5-2.5 years";
    confidence = "Med";
    massConfidence = "Med";
    beamConfidence = "High";
  }
  // Prime early (2.5-3.5)
  else if (mainBeamLength >= 18 && mainBeamLength < 22 && totalPoints <= 8 && avgMass < 4.5) {
    estimatedAge = "2.5-3.5 years";
    confidence = "Med";
    massConfidence = "Med";
    beamConfidence = "Med";
  }
  // Prime middle (3.5-4.5)
  else if (mainBeamLength >= 20 && totalPoints >= 8 && avgMass >= 4.0 && avgMass < 5.0) {
    estimatedAge = "3.5-4.5 years";
    confidence = "Med";
    massConfidence = "High";
    beamConfidence = "High";
  }
  // Prime late (4.5-5.5)
  else if (mainBeamLength >= 22 && avgMass >= 4.5 && insideSpread > 18) {
    estimatedAge = "4.5-5.5 years";
    confidence = "High";
    massConfidence = "High";
    beamConfidence = "High";
  }
  // Mature (5.5+)
  else if (avgMass >= 5.0 && totalPoints >= 10) {
    estimatedAge = "5.5+ years";
    confidence = "Med";
    massConfidence = "High";
    beamConfidence = "Med";
  }
  // Default to prime if unclear
  else {
    estimatedAge = "3.5-4.5 years";
    confidence = "Low";
    massConfidence = "Med";
    beamConfidence = "Med";
  }

  // Adjust based on body factors if provided
  const bodySizeConfidence: ConfidenceLevel = bodyFactors?.bodySize ? "Med" : "Low";
  const neckSizeConfidence: ConfidenceLevel = bodyFactors?.neckThickness ? "Med" : "Low";

  // If body is small but antlers are large, likely younger with good genetics
  if (bodyFactors?.bodySize === "small" && totalPoints >= 10) {
    estimatedAge = "2.5-3.5 years";
    confidence = "Med";
  }

  // If neck is thick and body is large, likely mature
  if (bodyFactors?.neckThickness === "thick" && bodyFactors?.bodySize === "large") {
    if (estimatedAge === "2.5-3.5 years" || estimatedAge === "3.5-4.5 years") {
      estimatedAge = "4.5-5.5 years";
      confidence = "High";
    }
  }

  return {
    estimatedAge,
    confidence,
    factors: {
      bodySize: bodySizeConfidence,
      antlerMass: massConfidence,
      beamDiameter: beamConfidence,
      neckSize: neckSizeConfidence,
    },
    regionalPrior: "North American Whitetail Average",
  };
};

/**
 * Helper to get numeric value from measurement or range
 */
const getValue = (measurement: number | { min: number; max: number; average: number; confidence: ConfidenceLevel } | undefined): number => {
  if (!measurement) return 0;
  if (typeof measurement === "number") return measurement;
  return measurement.average;
};
