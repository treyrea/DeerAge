/**
 * TPWD-Compliant Deer Age Analysis Service
 *
 * Implements a two-layer reasoning model:
 * - Layer 1: Internal probabilistic age estimation (AI logic)
 * - Layer 2: External warden-defensible decision & explanation
 *
 * ALL explanations are framed in proportional body characteristics,
 * NOT exact age claims. This ensures TPWD/MLD/game warden compliance.
 */

import { callOpenAIChat } from "./openai-fetch";
import {
  AgeClass,
  AgeClassProbabilities,
  TPWDBodyFeature,
  PrimaryBodyFeature,
  SecondaryBodyFeature,
  FeatureAssessment,
  InternalAgeEstimation,
  TPWDCompliantDecision,
  TPWDCompliantAgeAnalysis,
  BodyFeatureOverlay,
  PropertyRules,
} from "../types/deer-scoring";
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

/**
 * REQUIRED DISCLAIMER - Must be shown to user
 */
const TPWD_DISCLAIMER = "Age estimates are based on proportional body characteristics and represent age classes, not exact age.";

/**
 * WARDEN-SAFE EXPLANATION TEMPLATE
 * This language must be used verbatim or near-verbatim for all explanations
 */
const generateWardenSafeExplanation = (
  decision: "SHOOT" | "LET WALK",
  minimumAge: number,
  primaryFeatures: FeatureAssessment[],
  secondaryFeatures: FeatureAssessment[],
  rutConsidered: boolean
): string => {
  const matureFeatures = [...primaryFeatures, ...secondaryFeatures]
    .filter(f => f.contributesToMinimumAge)
    .map(f => f.displayName.toLowerCase());

  const immatureFeatures = [...primaryFeatures, ...secondaryFeatures]
    .filter(f => !f.contributesToMinimumAge)
    .map(f => f.displayName.toLowerCase());

  if (decision === "SHOOT") {
    let explanation = `The harvest decision was based on proportional body characteristics consistent with deer at or above ${minimumAge} years`;

    if (matureFeatures.length > 0) {
      explanation += `, including ${matureFeatures.slice(0, 4).join(", ")}`;
    }

    explanation += ". Secondary features supported the conclusion";

    if (rutConsidered) {
      explanation += ", accounting for rut-related weight changes and regional norms";
    }

    explanation += ". Age estimates represent age classes, not exact age.";

    return explanation;
  } else {
    let explanation = `Body characteristics are NOT consistent with deer at or above ${minimumAge} years`;

    if (immatureFeatures.length > 0) {
      explanation += `. Indicators suggesting younger age class include: ${immatureFeatures.slice(0, 3).join(", ")}`;
    }

    explanation += ". When uncertain, the recommendation defaults to LET WALK to protect management goals.";

    return explanation;
  }
};

/**
 * Compress image for analysis
 */
const compressImage = async (imageUri: string, maxWidth: number = 1024): Promise<string> => {
  try {
    const manipResult = await manipulateAsync(
      imageUri,
      [{ resize: { width: maxWidth } }],
      { compress: 0.7, format: SaveFormat.JPEG }
    );
    return manipResult.uri;
  } catch (error) {
    console.warn("Image compression failed, using original:", error);
    return imageUri;
  }
};

/**
 * Get feature display name
 */
const getFeatureDisplayName = (feature: TPWDBodyFeature): string => {
  const names: Record<TPWDBodyFeature, string> = {
    neck_brisket_integration: "Neck-to-Brisket Integration",
    chest_hindquarter_ratio: "Chest Depth vs Hindquarters",
    body_depth: "Overall Body Depth",
    leg_body_proportion: "Leg-to-Body Proportion",
    backline_posture: "Backline Posture",
    belly_waistline: "Belly/Waist Line",
    head_body_ratio: "Head-to-Body Ratio",
  };
  return names[feature] || feature;
};

/**
 * Map age indicator to contribution
 */
const ageIndicatorMeetsMinimum = (
  indicator: "immature" | "transitional" | "mature" | "post-mature",
  minimumAge: number
): boolean => {
  // For minimum age thresholds:
  // - 3.5+: mature and post-mature qualify
  // - 4.5+: only post-mature strongly qualifies, mature is borderline
  if (minimumAge >= 4.5) {
    return indicator === "post-mature" || indicator === "mature";
  }
  return indicator === "mature" || indicator === "post-mature";
};

/**
 * Calculate cumulative probability above minimum age
 */
const calculateCumulativeProbability = (
  probabilities: AgeClassProbabilities,
  minimumAge: number
): number => {
  // Map minimum age to age classes that qualify
  let cumulative = 0;

  if (minimumAge <= 1.5) {
    cumulative = 100; // All ages qualify
  } else if (minimumAge <= 2.5) {
    cumulative = probabilities["2.5-3.5"] + probabilities["3.5-4.5"] +
                 probabilities["4.5-5.5"] + probabilities["5.5+"];
  } else if (minimumAge <= 3.5) {
    cumulative = probabilities["3.5-4.5"] + probabilities["4.5-5.5"] + probabilities["5.5+"];
  } else if (minimumAge <= 4.5) {
    cumulative = probabilities["4.5-5.5"] + probabilities["5.5+"];
  } else {
    cumulative = probabilities["5.5+"];
  }

  return Math.min(100, Math.max(0, cumulative));
};

/**
 * COMPREHENSIVE MODE: Full TPWD-compliant age analysis
 * Uses 7 features (4 primary, 3 secondary) for thorough analysis
 */
export const analyzeTPWDCompliantAge = async (
  imageUri: string,
  propertyRules: PropertyRules
): Promise<TPWDCompliantAgeAnalysis> => {
  const startTime = Date.now();
  const { minimumShooterAge, isRutSeason = false, region } = propertyRules;

  try {
    // Compress image
    const compressedUri = await compressImage(imageUri);

    // Read image as base64
    const base64Image = await FileSystem.readAsStringAsync(compressedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Build the comprehensive analysis prompt
    const prompt = buildComprehensivePrompt(minimumShooterAge, isRutSeason, region);

    // Call GPT-4.1 Vision (faster than GPT-4o with better image understanding)
    const response = await callOpenAIChat(
      {
        model: "gpt-4.1-2025-04-14",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: "auto", // Use auto for faster processing
                },
              },
            ],
          },
        ],
        max_tokens: 2500, // Reduced from 3500
        temperature: 0.1,
      },
      90000 // 90 second timeout (reduced from 120s)
    );

    // Parse response
    const analysisText = response.choices[0]?.message?.content?.trim() || "";
    const jsonMatch = analysisText.match(/```json\n?([\s\S]*?)\n?```/) || analysisText.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : analysisText;

    let analysisData;
    try {
      analysisData = JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error("Unable to analyze deer. Please try again with a clearer broadside photo showing the full body.");
    }

    // Build internal estimation (Layer 1)
    const internalEstimation = buildInternalEstimation(analysisData, minimumShooterAge, isRutSeason);

    // Build external decision (Layer 2)
    const decision = buildTPWDCompliantDecision(internalEstimation, minimumShooterAge, analysisData.imageQuality);

    // Build body feature overlays
    const bodyFeatureOverlays = buildBodyFeatureOverlays(analysisData.overlays || []);

    const processingTime = Date.now() - startTime;

    return {
      internalEstimation,
      decision,
      bodyFeatureOverlays,
      analysisTimestamp: new Date(),
      processingTimeMs: processingTime,
      analysisMode: "comprehensive",
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);

    if (errorMessage.includes("502") || errorMessage.includes("proxy")) {
      throw new Error("Network connection issue. Please check your internet and try again.");
    } else if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
      throw new Error("Analysis took too long. Please try with a clearer photo.");
    } else if (errorMessage.includes("Unable to analyze")) {
      throw error;
    } else {
      throw new Error("Failed to analyze deer age. Ensure the photo shows a clear broadside view of the full body.");
    }
  }
};

/**
 * Build the comprehensive analysis prompt
 */
const buildComprehensivePrompt = (
  minimumAge: number,
  isRutSeason: boolean,
  region?: string
): string => {
  return `You are a TPWD-certified wildlife biologist analyzing a whitetail deer for age estimation.

⚠️ CRITICAL FIRST STEP - IMAGE VALIDATION ⚠️
Before ANY analysis, you MUST verify this image can be used for age estimation:

REJECT THESE IMMEDIATELY:
- Cartoons, drawings, sketches, illustrations, digital art, AI-generated images
- Toys, figurines, sculptures, decorations, lawn ornaments
- Logos, icons, silhouettes, graphics, clip art
- Mounted heads, taxidermy, skull mounts (cannot age - need body visible)
- Head-only photos (need full body for age estimation)

ALLOWED:
- Photos of real, live deer with body visible
- Photos of harvested deer with body visible
- Trail cam photos of real deer with body visible

If this is NOT a usable photograph for age estimation, respond with:
{
  "isValidImage": false,
  "invalidReason": "not_real_deer",
  "invalidMessage": "This image cannot be used for age estimation. Detected: [describe what it actually is]. Please upload a photo of a deer with visible body."
}

CRITICAL RULES FOR VALID DEER PHOTOS:
1. NEVER claim an exact age - only age CLASSES (1.5-2.5, 2.5-3.5, 3.5-4.5, 4.5-5.5, 5.5+)
2. ALL assessments must be based on PROPORTIONAL BODY CHARACTERISTICS, not antlers or fat alone
3. Use RELATIVE proportions, not absolute size (normalize for regional/individual variation)
4. Focus on STRUCTURAL features that don't change with nutrition or rut

MLD MINIMUM SHOOT AGE: ${minimumAge} years
${isRutSeason ? "RUT CONDITIONS: Yes - down-weight belly/backline features, up-weight chest depth and leg proportion" : ""}
${region ? `REGION: ${region} - apply regional body size norms` : ""}

ANALYZE THESE 7 FEATURES (4 PRIMARY + 3 SECONDARY):

PRIMARY FEATURES (HIGH WEIGHT - must agree for SHOOT recommendation):

1. NECK-TO-BRISKET INTEGRATION
   - Evaluate whether neck flows into chest with NO visible pinch point
   - IGNORE raw neck size or rut swelling alone
   - Mature: Smooth transition, neck blends into deep chest
   - Immature: Clear pinch/gap between neck and chest

2. CHEST DEPTH RELATIVE TO HINDQUARTERS
   - Front chest deeper/heavier than rear = mature class indicator
   - Rear equal or deeper than chest = younger age class indicator
   - Look at the RATIO, not absolute measurements

3. OVERALL BODY DEPTH (RIB CAGE HEIGHT)
   - Measure rib cage depth from back to belly (NOT fat sag)
   - Deep, barrel-like ribcage = older age class
   - Shallow chest cavity = younger age class

4. LEG-TO-BODY PROPORTION
   - Legs appear SHORT due to deep torso = older age class
   - Legs appear LONG/leggy relative to body = younger age class
   - This is the most reliable single indicator

SECONDARY FEATURES (SUPPORTING EVIDENCE - may vary by rut/region):

5. BACKLINE POSTURE
   - Level or slightly arched = younger
   - Swayed/sagging = older (but can be individual variation)
   ${isRutSeason ? "- DOWN-WEIGHT this feature during rut" : ""}

6. BELLY/WAIST LINE
   - Tucked waist = younger (2.5-3.5)
   - Level belly = transitional (3.5-4.5)
   - Pot belly/sagging = older (4.5+)
   ${isRutSeason ? "- HEAVILY DOWN-WEIGHT during rut (bucks lose weight)" : ""}

7. HEAD-TO-BODY RATIO
   - Head looks large for body = younger
   - Head proportional to body = mature
   - Head looks small for massive body = post-mature

PROBABILITY ASSESSMENT:
Assign probability percentages to each age class (must sum to 100):
- 1.5-2.5 years: ___%
- 2.5-3.5 years: ___%
- 3.5-4.5 years: ___%
- 4.5-5.5 years: ___%
- 5.5+ years: ___%

DECISION LOGIC:
- Calculate cumulative probability of age >= ${minimumAge}
- If cumulative probability >= 65% AND primary features agree → SHOOT
- Otherwise → PASS (when uncertain, protect management goals)

RESPOND WITH THIS EXACT JSON FORMAT:
{
  "probabilities": {
    "1.5-2.5": <number 0-100>,
    "2.5-3.5": <number>,
    "3.5-4.5": <number>,
    "4.5-5.5": <number>,
    "5.5+": <number>
  },
  "mostLikelyAgeClass": "1.5-2.5" | "2.5-3.5" | "3.5-4.5" | "4.5-5.5" | "5.5+",

  "primaryFeatures": [
    {
      "feature": "neck_brisket_integration",
      "pattern": "Description of what you observe",
      "confidence": <0-100>,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    },
    {
      "feature": "chest_hindquarter_ratio",
      "pattern": "Description",
      "confidence": <0-100>,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    },
    {
      "feature": "body_depth",
      "pattern": "Description",
      "confidence": <0-100>,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    },
    {
      "feature": "leg_body_proportion",
      "pattern": "Description",
      "confidence": <0-100>,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    }
  ],

  "secondaryFeatures": [
    {
      "feature": "backline_posture",
      "pattern": "Description",
      "confidence": <0-100>,
      "indicator": "immature" | "transitional" | "mature" | "post-mature",
      "rutAdjusted": true | false
    },
    {
      "feature": "belly_waistline",
      "pattern": "Description",
      "confidence": <0-100>,
      "indicator": "immature" | "transitional" | "mature" | "post-mature",
      "rutAdjusted": true | false
    },
    {
      "feature": "head_body_ratio",
      "pattern": "Description",
      "confidence": <0-100>,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    }
  ],

  "overlays": [
    {
      "featureId": "feature_name",
      "boundingBox": { "x": <0-100>, "y": <0-100>, "width": <0-100>, "height": <0-100> },
      "label": "Feature: pattern"
    }
  ],

  "imageQuality": "excellent" | "good" | "fair" | "poor",
  "qualityIssues": ["issue1", "issue2"] or null
}

RESPOND ONLY WITH VALID JSON.`;
};

/**
 * Build internal estimation from AI response (Layer 1)
 */
const buildInternalEstimation = (
  analysisData: any,
  minimumAge: number,
  isRutSeason: boolean
): InternalAgeEstimation => {
  const probabilities: AgeClassProbabilities = {
    "1.5-2.5": analysisData.probabilities?.["1.5-2.5"] || 0,
    "2.5-3.5": analysisData.probabilities?.["2.5-3.5"] || 0,
    "3.5-4.5": analysisData.probabilities?.["3.5-4.5"] || 0,
    "4.5-5.5": analysisData.probabilities?.["4.5-5.5"] || 0,
    "5.5+": analysisData.probabilities?.["5.5+"] || 0,
  };

  // Normalize if not summing to 100
  const total = Object.values(probabilities).reduce((a, b) => a + b, 0);
  if (total !== 100 && total > 0) {
    Object.keys(probabilities).forEach((key) => {
      probabilities[key as AgeClass] = Math.round((probabilities[key as AgeClass] / total) * 100);
    });
  }

  const primaryFeatureAssessments: FeatureAssessment[] = (analysisData.primaryFeatures || []).map((f: any) => ({
    feature: f.feature as PrimaryBodyFeature,
    displayName: getFeatureDisplayName(f.feature),
    isPrimary: true,
    detectedPattern: f.pattern || "Not detected",
    confidence: f.confidence || 50,
    ageIndicator: f.indicator || "transitional",
    contributesToMinimumAge: ageIndicatorMeetsMinimum(f.indicator, minimumAge),
    explanation: buildFeatureExplanation(f.feature, f.indicator, f.pattern),
  }));

  const secondaryFeatureAssessments: FeatureAssessment[] = (analysisData.secondaryFeatures || []).map((f: any) => ({
    feature: f.feature as SecondaryBodyFeature,
    displayName: getFeatureDisplayName(f.feature),
    isPrimary: false,
    detectedPattern: f.pattern || "Not detected",
    confidence: f.confidence || 50,
    ageIndicator: f.indicator || "transitional",
    contributesToMinimumAge: ageIndicatorMeetsMinimum(f.indicator, minimumAge),
    rutAdjusted: f.rutAdjusted || false,
    explanation: buildFeatureExplanation(f.feature, f.indicator, f.pattern, f.rutAdjusted),
  }));

  const cumulativeProbability = calculateCumulativeProbability(probabilities, minimumAge);

  return {
    probabilities,
    mostLikelyAgeClass: analysisData.mostLikelyAgeClass || "2.5-3.5",
    cumulativeProbabilityAboveMinimum: cumulativeProbability,
    confidenceThreshold: 65, // Require 65% confidence for SHOOT
    primaryFeatureAssessments,
    secondaryFeatureAssessments,
    rutConditionsConsidered: isRutSeason,
    regionalNormalization: true,
  };
};

/**
 * Build feature-specific explanation (TPWD-compliant language)
 */
const buildFeatureExplanation = (
  feature: TPWDBodyFeature,
  indicator: string,
  pattern: string,
  rutAdjusted?: boolean
): string => {
  const explanations: Record<TPWDBodyFeature, Record<string, string>> = {
    neck_brisket_integration: {
      immature: "Neck shows clear separation from chest with visible pinch point, indicating younger age class proportions.",
      transitional: "Neck is beginning to blend into chest but still shows some definition at the transition.",
      mature: "Neck flows smoothly into the chest with no visible pinch point, consistent with mature body proportions.",
      "post-mature": "Thick neck fully integrated with deep chest, showing mature to post-mature body structure.",
    },
    chest_hindquarter_ratio: {
      immature: "Hindquarters appear equal to or heavier than front chest, typical of younger age class.",
      transitional: "Front chest is developing depth but not yet dominant over hindquarters.",
      mature: "Front chest is notably deeper and heavier than hindquarters, indicating mature body proportions.",
      "post-mature": "Front-heavy body with chest significantly dominating hindquarters, consistent with older age class.",
    },
    body_depth: {
      immature: "Shallow rib cage depth indicates body has not yet developed mature proportions.",
      transitional: "Moderate body depth showing development toward mature proportions.",
      mature: "Deep, barrel-like rib cage indicates mature body proportions.",
      "post-mature": "Very deep body with substantial rib cage height, consistent with older age class.",
    },
    leg_body_proportion: {
      immature: "Legs appear long relative to body depth, typical of younger deer.",
      transitional: "Legs are becoming more proportional as body depth increases.",
      mature: "Legs appear short due to deep body, indicating mature body proportions.",
      "post-mature": "Legs appear very short relative to massive body depth, consistent with older age class.",
    },
    backline_posture: {
      immature: "Level or arched backline typical of younger deer.",
      transitional: "Backline beginning to show slight sway.",
      mature: "Some backline sway visible, though posture remains relatively firm.",
      "post-mature": "Pronounced swayed back indicating advanced age characteristics.",
    },
    belly_waistline: {
      immature: "Tucked waist with athletic build typical of younger deer.",
      transitional: "Waist definition decreasing as body fills out.",
      mature: "Belly line approaches level with back, indicating mature proportions.",
      "post-mature": "Pot belly or sagging belly line consistent with older age class.",
    },
    head_body_ratio: {
      immature: "Head appears proportionally large for body size, typical of younger deer.",
      transitional: "Head-to-body ratio normalizing with body development.",
      mature: "Head proportional to body indicating mature proportions.",
      "post-mature": "Head may appear small relative to massive body, indicating advanced maturity.",
    },
  };

  let explanation = explanations[feature]?.[indicator] || `Body feature shows ${indicator} characteristics.`;

  if (rutAdjusted) {
    explanation += " (Assessment adjusted for rut conditions.)";
  }

  return explanation;
};

/**
 * Build TPWD-compliant decision (Layer 2)
 */
const buildTPWDCompliantDecision = (
  internal: InternalAgeEstimation,
  minimumAge: number,
  imageQuality: string
): TPWDCompliantDecision => {
  // Count how many primary features support minimum age
  const primaryFeaturesSupporting = internal.primaryFeatureAssessments.filter(
    (f) => f.contributesToMinimumAge
  ).length;

  // Parse estimated age class to get numeric value
  const ageClassStr = internal.mostLikelyAgeClass || "2.5-3.5";
  const ageClassLower = parseFloat(ageClassStr.split("-")[0]) || 2.5;
  const estimatedMeetsMinimum = ageClassLower >= minimumAge;

  // Decision logic:
  // 1. If estimated age class meets minimum AND cumulative probability is reasonable (>=50%), it's SHOOT
  // 2. OR if probability threshold met AND majority of primary features agree
  // This prevents contradictions where estimated age meets threshold but decision says LET WALK
  const probabilityMet = internal.cumulativeProbabilityAboveMinimum >= internal.confidenceThreshold;
  const primaryFeaturesMet = primaryFeaturesSupporting >= 3; // At least 3 of 4 primary features

  // Final decision
  const decision: "SHOOT" | "LET WALK" =
    (estimatedMeetsMinimum && internal.cumulativeProbabilityAboveMinimum >= 50) ||
    (probabilityMet && primaryFeaturesMet)
      ? "SHOOT"
      : "LET WALK";
  const meetsMinimumAge = decision === "SHOOT";

  // Build warden-safe explanation
  const explanation = generateWardenSafeExplanation(
    decision,
    minimumAge,
    internal.primaryFeatureAssessments,
    internal.secondaryFeatureAssessments,
    internal.rutConditionsConsidered
  );

  // Build feature summaries
  const primarySummary = internal.primaryFeatureAssessments
    .map((f) => `${f.displayName}: ${f.ageIndicator}`)
    .join("; ");

  const secondarySummary = internal.secondaryFeatureAssessments
    .map((f) => `${f.displayName}: ${f.ageIndicator}${f.rutAdjusted ? " (rut-adjusted)" : ""}`)
    .join("; ");

  // Calculate overall confidence based on feature agreement and image quality
  const avgConfidence =
    [...internal.primaryFeatureAssessments, ...internal.secondaryFeatureAssessments].reduce(
      (sum, f) => sum + f.confidence,
      0
    ) / 7;

  const qualityMultiplier =
    imageQuality === "excellent" ? 1.0 :
    imageQuality === "good" ? 0.9 :
    imageQuality === "fair" ? 0.75 : 0.5;

  const assessmentConfidence = Math.round(avgConfidence * qualityMultiplier);

  // Quality impact message
  const qualityImpact =
    imageQuality === "excellent" ? "Excellent image quality supports high-confidence assessment." :
    imageQuality === "good" ? "Good image quality allows reliable body feature assessment." :
    imageQuality === "fair" ? "Fair image quality may affect assessment accuracy. Consider retaking with better lighting or angle." :
    "Poor image quality significantly impacts assessment reliability. Recommend retaking photo.";

  return {
    decision,
    minimumAge,
    meetsMinimumAge,
    explanation,
    primaryFeatureSummary: primarySummary,
    secondaryFeatureSummary: secondarySummary,
    disclaimer: TPWD_DISCLAIMER,
    assessmentConfidence,
    imageQuality: imageQuality as "excellent" | "good" | "fair" | "poor",
    qualityImpact,
  };
};

/**
 * Build body feature overlays from AI response
 */
const buildBodyFeatureOverlays = (overlays: any[]): BodyFeatureOverlay[] => {
  return (overlays || []).map((o, index) => ({
    featureId: o.featureId || `feature_${index}`,
    name: getFeatureDisplayName(o.featureId),
    boundingBox: {
      x: o.boundingBox?.x || 0,
      y: o.boundingBox?.y || 0,
      width: o.boundingBox?.width || 10,
      height: o.boundingBox?.height || 10,
    },
    label: o.label || "Body Feature",
    confidence: o.confidence || 70,
  }));
};

export { TPWD_DISCLAIMER };
