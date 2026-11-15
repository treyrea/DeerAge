/**
 * Local Boone & Crockett explanation built from measurements.
 * No network call. The measurements themselves come from the analysis proxy.
 */

import {
  AntlerMeasurements,
  BooneAndCrockettScore,
  ConfidenceLevel,
  ExplainableRackScoring,
  MeasurementRange,
  RackMeasurementOverlay,
  TinePoint,
  RackScoringCue,
} from "../types/deer-scoring";
import { generateContextualExplanation } from "../utils/rack-scoring-criteria-library";

const getMeasurementValue = (measurement: number | MeasurementRange | undefined): number => {
  if (!measurement) return 0;
  if (typeof measurement === "number") return measurement;
  return measurement.average || 0;
};

/**
 * Helper function to get confidence level from measurement
 */
const getMeasurementConfidence = (measurement: number | MeasurementRange | undefined): ConfidenceLevel => {
  if (!measurement) return "Low";
  if (typeof measurement === "number") return "Med";
  return measurement.confidence || "Med";
};

/**
 * Generate explainable rack scoring with detailed cues for each measurement
 */
export const generateExplainableRackScoring = (
  score: BooneAndCrockettScore,
  measurements: AntlerMeasurements
): ExplainableRackScoring => {
  const detectedCues: RackScoringCue[] = [];
  const rackMeasurementOverlays: RackMeasurementOverlay[] = [];

  // Helper to convert confidence to percentage
  const confidenceToPercent = (conf: ConfidenceLevel): number => {
    switch (conf) {
      case "High":
        return 90;
      case "Med":
        return 70;
      case "Low":
        return 50;
      default:
        return 60;
    }
  };

  // Main Beams Analysis
  const rightMainBeamLength = getMeasurementValue(measurements.rightMainBeam.length);
  const leftMainBeamLength = getMeasurementValue(measurements.leftMainBeam.length);
  const mainBeamTotal = rightMainBeamLength + leftMainBeamLength;
  const mainBeamAsymmetry = Math.abs(rightMainBeamLength - leftMainBeamLength);
  const mainBeamConfidence = getMeasurementConfidence(measurements.rightMainBeam.length);

  detectedCues.push({
    name: "main_beam_length",
    displayName: "Main Beam Length",
    category: "main_beam",
    detectedMeasurement: `Right: ${rightMainBeamLength.toFixed(1)}", Left: ${leftMainBeamLength.toFixed(1)}"`,
    contribution: mainBeamTotal,
    confidence: confidenceToPercent(mainBeamConfidence),
    explanation: generateContextualExplanation("main_beam_length", (rightMainBeamLength + leftMainBeamLength) / 2, mainBeamConfidence),
    scoringWeight: "high",
  });

  if (mainBeamAsymmetry > 0) {
    detectedCues.push({
      name: "main_beam_symmetry",
      displayName: "Main Beam Symmetry",
      category: "symmetry",
      detectedMeasurement: `Difference: ${mainBeamAsymmetry.toFixed(1)}"`,
      contribution: -mainBeamAsymmetry,
      confidence: confidenceToPercent(mainBeamConfidence),
      explanation: `The ${mainBeamAsymmetry.toFixed(1)}" difference between left and right main beams results in a deduction of ${mainBeamAsymmetry.toFixed(1)}" from the net score. Symmetrical racks with minimal differences are more valuable.`,
      scoringWeight: "high",
    });
  }

  // Tines Analysis
  const tineData: Array<{
    name: string;
    right?: TinePoint;
    left?: TinePoint;
    displayName: string;
  }> = [
    { name: "g1", right: measurements.rightG1, left: measurements.leftG1, displayName: "G1 (Brow Tines)" },
    { name: "g2", right: measurements.rightG2, left: measurements.leftG2, displayName: "G2 Tines" },
    { name: "g3", right: measurements.rightG3, left: measurements.leftG3, displayName: "G3 Tines" },
    { name: "g4", right: measurements.rightG4, left: measurements.leftG4, displayName: "G4 Tines" },
    { name: "g5", right: measurements.rightG5, left: measurements.leftG5, displayName: "G5 Tines" },
    { name: "g6", right: measurements.rightG6, left: measurements.leftG6, displayName: "G6 Tines" },
  ];

  let totalTineLength = 0;
  let tineAsymmetryTotal = 0;

  tineData.forEach(({ name, right, left, displayName }) => {
    const rightLength = right ? getMeasurementValue(right.length) : 0;
    const leftLength = left ? getMeasurementValue(left.length) : 0;
    const tineTotal = rightLength + leftLength;
    const asymmetry = Math.abs(rightLength - leftLength);

    if (tineTotal > 0) {
      totalTineLength += tineTotal;
      tineAsymmetryTotal += asymmetry;

      const confidence = right ? getMeasurementConfidence(right.length) : getMeasurementConfidence(left?.length);
      const cueName = name === "g1" ? "g1_brow_tines" : name === "g2" ? "g2_tines" : name === "g3" ? "g3_tines" : "g4_plus_tines";

      detectedCues.push({
        name: cueName as any,
        displayName,
        category: "tines",
        detectedMeasurement: rightLength > 0 && leftLength > 0
          ? `Right: ${rightLength.toFixed(1)}", Left: ${leftLength.toFixed(1)}"`
          : rightLength > 0
          ? `Right: ${rightLength.toFixed(1)}" (Left missing)`
          : `Left: ${leftLength.toFixed(1)}" (Right missing)`,
        contribution: tineTotal,
        confidence: confidenceToPercent(confidence),
        explanation: generateContextualExplanation(cueName, (rightLength + leftLength) / 2, confidence),
        scoringWeight: name === "g2" ? "high" : "medium",
      });

      if (asymmetry > 0.5) {
        detectedCues.push({
          name: "tine_symmetry",
          displayName: `${displayName} Symmetry`,
          category: "symmetry",
          detectedMeasurement: `Difference: ${asymmetry.toFixed(1)}"`,
          contribution: -asymmetry,
          confidence: confidenceToPercent(confidence),
          explanation: `The ${asymmetry.toFixed(1)}" difference in ${displayName.toLowerCase()} results in a ${asymmetry.toFixed(1)}" deduction. Matching tine lengths on both sides minimize deductions.`,
          scoringWeight: "high",
        });
      }
    }
  });

  // Mass/Circumference Analysis
  const circumferenceData = [
    { name: "h1", right: measurements.rightCircumferences.h1, left: measurements.leftCircumferences.h1, displayName: "H1 (Base)" },
    { name: "h2", right: measurements.rightCircumferences.h2, left: measurements.leftCircumferences.h2, displayName: "H2" },
    { name: "h3", right: measurements.rightCircumferences.h3, left: measurements.leftCircumferences.h3, displayName: "H3" },
    { name: "h4", right: measurements.rightCircumferences.h4, left: measurements.leftCircumferences.h4, displayName: "H4" },
  ];

  let totalMass = 0;
  let massAsymmetryTotal = 0;

  circumferenceData.forEach(({ name, right, left, displayName }) => {
    const rightCirc = getMeasurementValue(right);
    const leftCirc = getMeasurementValue(left);
    const circTotal = rightCirc + leftCirc;
    const asymmetry = Math.abs(rightCirc - leftCirc);

    if (circTotal > 0) {
      totalMass += circTotal;
      massAsymmetryTotal += asymmetry;

      const confidence = getMeasurementConfidence(right);
      const cueName = name === "h1" ? "h1_base_circumference" : "h2_h4_circumferences";

      detectedCues.push({
        name: cueName as any,
        displayName: `${displayName} Circumference`,
        category: "mass",
        detectedMeasurement: `Right: ${rightCirc.toFixed(1)}", Left: ${leftCirc.toFixed(1)}"`,
        contribution: circTotal,
        confidence: confidenceToPercent(confidence),
        explanation: generateContextualExplanation(cueName, (rightCirc + leftCirc) / 2, confidence),
        scoringWeight: "medium",
      });

      if (asymmetry > 0.25) {
        detectedCues.push({
          name: "mass_symmetry",
          displayName: `${displayName} Symmetry`,
          category: "symmetry",
          detectedMeasurement: `Difference: ${asymmetry.toFixed(1)}"`,
          contribution: -asymmetry,
          confidence: confidenceToPercent(confidence),
          explanation: `The ${asymmetry.toFixed(1)}" mass difference at ${displayName} is deducted. Consistent mass throughout indicates quality genetics.`,
          scoringWeight: "medium",
        });
      }
    }
  });

  // Spread Analysis
  const insideSpread = getMeasurementValue(measurements.insideSpread);
  const spreadCredit = getMeasurementValue(score.spreadCredit);
  const spreadConfidence = getMeasurementConfidence(measurements.insideSpread);

  detectedCues.push({
    name: "inside_spread",
    displayName: "Inside Spread",
    category: "spread",
    detectedMeasurement: `${insideSpread.toFixed(1)}"`,
    contribution: 0, // Not directly added
    confidence: confidenceToPercent(spreadConfidence),
    explanation: generateContextualExplanation("inside_spread", insideSpread, spreadConfidence),
    scoringWeight: "medium",
  });

  detectedCues.push({
    name: "spread_credit",
    displayName: "Spread Credit",
    category: "spread",
    detectedMeasurement: `${spreadCredit.toFixed(1)}" (lesser of spread or longest main beam)`,
    contribution: spreadCredit,
    confidence: confidenceToPercent(spreadConfidence),
    explanation: generateContextualExplanation("spread_credit", spreadCredit, spreadConfidence),
    scoringWeight: "medium",
  });

  // Abnormal Points Analysis
  const abnormalTotal = measurements.abnormalPoints.reduce((sum, point) => sum + getMeasurementValue(point.length), 0);
  if (abnormalTotal > 0) {
    detectedCues.push({
      name: "abnormal_points",
      displayName: "Abnormal Points",
      category: "abnormal",
      detectedMeasurement: `${measurements.abnormalPoints.length} point(s), ${abnormalTotal.toFixed(1)}" total`,
      contribution: abnormalTotal,
      confidence: 75,
      explanation: generateContextualExplanation("abnormal_points", abnormalTotal, "Med"),
      scoringWeight: "high",
    });
  }

  // Overall Symmetry
  const totalDeductions = getMeasurementValue(score.symmetryDeductions);
  if (totalDeductions > 0) {
    detectedCues.push({
      name: "overall_symmetry",
      displayName: "Total Symmetry Deductions",
      category: "symmetry",
      detectedMeasurement: `${totalDeductions.toFixed(1)}" total deductions`,
      contribution: -totalDeductions,
      confidence: 80,
      explanation: `All asymmetries between left and right measurements total ${totalDeductions.toFixed(1)}". These deductions are subtracted from the gross score to calculate the net score.`,
      scoringWeight: "high",
    });
  }

  // Build component breakdown
  const componentBreakdown = {
    mainBeams: {
      value: mainBeamTotal,
      cues: detectedCues.filter(c => c.category === "main_beam"),
    },
    tines: {
      value: totalTineLength,
      cues: detectedCues.filter(c => c.category === "tines"),
    },
    mass: {
      value: totalMass,
      cues: detectedCues.filter(c => c.category === "mass"),
    },
    spread: {
      value: spreadCredit,
      cues: detectedCues.filter(c => c.category === "spread"),
    },
    abnormal: {
      value: abnormalTotal,
      cues: detectedCues.filter(c => c.category === "abnormal"),
    },
  };

  // Build deduction breakdown
  const deductionBreakdown = {
    mainBeamAsymmetry: {
      value: mainBeamAsymmetry,
      cue: detectedCues.find(c => c.name === "main_beam_symmetry"),
    },
    tineAsymmetry: {
      value: tineAsymmetryTotal,
      cues: detectedCues.filter(c => c.name === "tine_symmetry"),
    },
    massAsymmetry: {
      value: massAsymmetryTotal,
      cues: detectedCues.filter(c => c.name === "mass_symmetry"),
    },
    total: totalDeductions,
  };

  // Determine measurement quality
  const avgConfidence = detectedCues.reduce((sum, c) => sum + c.confidence, 0) / detectedCues.length;
  const measurementQuality: "excellent" | "good" | "fair" | "poor" =
    avgConfidence >= 85 ? "excellent" : avgConfidence >= 70 ? "good" : avgConfidence >= 55 ? "fair" : "poor";

  // Get final scores
  const grossScore = getMeasurementValue(score.category === "Typical" ? score.grossTypical : score.grossNonTypical);
  const netScore = getMeasurementValue(score.category === "Typical" ? score.netTypical : score.netNonTypical);
  const minimumThreshold = score.category === "Typical" ? 160 : 185;
  const qualifies = netScore >= minimumThreshold;

  const measurementTips: string[] = [];
  if (measurementQuality === "fair" || measurementQuality === "poor") {
    measurementTips.push("For more accurate measurements, take photos from directly in front of the rack");
    measurementTips.push("Ensure good lighting and the entire rack is visible");
    measurementTips.push("Avoid shadows and reflections that can obscure measurements");
  }

  return {
    grossScore,
    netScore,
    category: score.category,
    qualifies,
    minimumThreshold,
    detectedCues,
    rackMeasurementOverlays, // Can be populated with actual overlay data if needed
    totalContribution: grossScore,
    componentBreakdown,
    deductionBreakdown,
    pointEnumeration: measurements.pointEnumeration,
    measurementQuality,
    angleQuality: "straight_on", // Could be enhanced with actual angle detection
    measurementTips: measurementTips.length > 0 ? measurementTips : undefined,
  };
};
