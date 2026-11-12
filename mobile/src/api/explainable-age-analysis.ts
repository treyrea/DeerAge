/**
 * TPWD-Compliant Explainable Age Analysis Service
 *
 * COMPREHENSIVE MODE: Uses 7 body features (4 primary + 3 secondary)
 * for thorough, warden-defensible age estimation.
 *
 * Implements two-layer reasoning:
 * - Layer 1: Internal probabilistic age estimation
 * - Layer 2: External warden-safe decision & explanation
 *
 * ALL explanations use proportional body characteristics language.
 */

import { callOpenAIChat } from "./openai-fetch";
import {
  ExplainableAgeEstimation,
  AgeCue,
  BodyFeatureOverlay,
  AgeBand,
  AgeCueName,
  PropertyRules,
} from "../types/deer-scoring";
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

/**
 * REQUIRED TPWD DISCLAIMER - Must be displayed to users
 */
const TPWD_DISCLAIMER = "Age estimates are based on proportional body characteristics and represent age classes, not exact age.";

/**
 * Map of new TPWD features to legacy AgeCueName for compatibility
 */
const TPWD_TO_LEGACY_CUE: Record<string, AgeCueName> = {
  neck_brisket_integration: "neck_thickness",
  chest_hindquarter_ratio: "chest_depth",
  body_depth: "brisket",
  leg_body_proportion: "leg_proportion",
  backline_posture: "backline",
  belly_waistline: "belly",
  head_body_ratio: "face_shape",
};

/**
 * Compress and resize image for analysis
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
 * Map age band to numeric years (midpoint)
 */
const ageBandToYears = (ageBand: AgeBand): number => {
  switch (ageBand) {
    case "1.5-2.5 years":
      return 2.0;
    case "2.5-3.5 years":
      return 3.0;
    case "3.5-4.5 years":
      return 4.0;
    case "4.5-5.5 years":
      return 5.0;
    case "5.5+ years":
      return 6.0;
    default:
      return 3.5;
  }
};

/**
 * Get display name for TPWD feature
 */
const getFeatureDisplayName = (feature: string): string => {
  const names: Record<string, string> = {
    neck_brisket_integration: "Neck-to-Brisket Integration",
    chest_hindquarter_ratio: "Chest vs Hindquarters",
    body_depth: "Overall Body Depth",
    leg_body_proportion: "Leg-to-Body Proportion",
    backline_posture: "Backline Posture",
    belly_waistline: "Belly/Waist Line",
    head_body_ratio: "Head-to-Body Ratio",
  };
  return names[feature] || feature.replace(/_/g, " ");
};

/**
 * Convert indicator to age weight
 */
const indicatorToAgeWeight = (indicator: string): number => {
  switch (indicator) {
    case "immature":
      return -2;
    case "transitional":
      return 0;
    case "mature":
      return 2;
    case "post-mature":
      return 3;
    default:
      return 0;
  }
};

/**
 * Generate warden-safe explanation based on features
 */
const generateWardenSafeExplanation = (
  decision: "SHOOTER" | "LET WALK",
  minimumAge: number,
  features: any[],
  rutConsidered: boolean
): string => {
  const matureFeatures = features
    .filter(f => f.indicator === "mature" || f.indicator === "post-mature")
    .map(f => getFeatureDisplayName(f.feature).toLowerCase());

  const immatureFeatures = features
    .filter(f => f.indicator === "immature" || f.indicator === "transitional")
    .map(f => getFeatureDisplayName(f.feature).toLowerCase());

  if (decision === "SHOOTER") {
    let explanation = `The harvest decision was based on proportional body characteristics consistent with deer at or above ${minimumAge} years`;

    if (matureFeatures.length > 0) {
      explanation += `, including ${matureFeatures.slice(0, 4).join(", ")}`;
    }

    explanation += ". Secondary features supported the conclusion";

    if (rutConsidered) {
      explanation += ", accounting for rut-related weight changes and regional norms";
    }

    explanation += ". " + TPWD_DISCLAIMER;

    return explanation;
  } else {
    let explanation = `Body characteristics are NOT consistent with deer at or above ${minimumAge} years`;

    if (immatureFeatures.length > 0) {
      explanation += `. Indicators suggesting younger age class include: ${immatureFeatures.slice(0, 3).join(", ")}`;
    }

    explanation += ". When uncertain, the recommendation defaults to PASS to protect management goals.";

    return explanation;
  }
};

/**
 * Build feature-specific TPWD-compliant explanation
 */
const buildFeatureExplanation = (
  feature: string,
  indicator: string,
  pattern: string,
  rutAdjusted?: boolean
): string => {
  const explanations: Record<string, Record<string, string>> = {
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
 * TPWD-Compliant Comprehensive Age Analysis
 *
 * Analyzes 7 body features:
 * - PRIMARY (4): neck-brisket integration, chest-hindquarter ratio, body depth, leg-body proportion
 * - SECONDARY (3): backline posture, belly/waistline, head-body ratio
 *
 * Returns warden-defensible results with proper disclaimers.
 */
export const analyzeExplainableAge = async (
  imageUri: string,
  minimumShooterAge: number = 3.5,
  propertyRules?: Partial<PropertyRules>
): Promise<ExplainableAgeEstimation> => {
  const isRutSeason = propertyRules?.isRutSeason || false;
  const region = propertyRules?.region;

  try {
    // Compress image
    const compressedUri = await compressImage(imageUri);

    // Read image as base64
    const base64Image = await FileSystem.readAsStringAsync(compressedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Build TPWD-compliant comprehensive analysis prompt
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
                  detail: "auto", // Use auto for faster processing while maintaining quality
                },
              },
            ],
          },
        ],
        max_tokens: 2000, // Reduced from 3000 - response typically fits in less
        temperature: 0.1,
      },
      90000 // 90 second timeout (reduced from 120s)
    );

    // Parse response
    const analysisText = response.choices[0]?.message?.content?.trim() || "";

    // Extract JSON
    const jsonMatch = analysisText.match(/```json\n?([\s\S]*?)\n?```/) || analysisText.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : analysisText;

    let analysisData;
    try {
      analysisData = JSON.parse(jsonText);
      console.log("[Age Analysis] Parsed response - isValidDeerImage:", analysisData.isValidDeerImage, "invalidImageReason:", analysisData.invalidImageReason, "invalidImageMessage:", analysisData.invalidImageMessage);
    } catch (parseError) {
      throw new Error("Unable to analyze deer age. Please try again with a clearer, broadside photo showing the full body.");
    }

    // Check image validation - throw appropriate errors for non-deer images
    if (analysisData.isValidDeerImage === false) {
      const reason = analysisData.invalidImageReason;
      const detectedMessage = analysisData.invalidImageMessage || "";
      console.log("[Age Analysis] Invalid image detected - reason:", reason, "message:", detectedMessage);

      if (reason === "not_deer") {
        // Include the detected object info if available
        throw new Error(detectedMessage || "Not a deer - this image does not appear to contain a deer. Please use a photo that clearly shows a deer.");
      } else if (reason === "head_only") {
        throw new Error("Only the deer's head is visible in this image. Please use a broadside photo showing the deer's full body for age analysis.");
      } else if (reason === "poor_quality") {
        throw new Error("The image quality is too poor for accurate analysis. Please try with a clearer, well-lit photo.");
      } else if (reason === "not_visible") {
        throw new Error("Not a deer - the deer's body is not clearly visible. Please use a photo with a clear view of the deer's full body.");
      } else {
        // Default case - treat as not_deer to be safe
        throw new Error(detectedMessage || "Not a deer - unable to analyze this image. Please try with a clear photo of a deer showing the full body.");
      }
    }

    // Additional validation: if no features were detected, this is likely not a deer
    const allFeatures = [
      ...(analysisData.primaryFeatures || []).map((f: any) => ({ ...f, isPrimary: true })),
      ...(analysisData.secondaryFeatures || []).map((f: any) => ({ ...f, isPrimary: false })),
    ];

    // If we have no features at all, or very low confidence across the board, likely not a deer
    if (allFeatures.length === 0) {
      console.log("[Age Analysis] No features detected - likely not a deer");
      throw new Error("Not a deer - no deer body features could be detected in this image. Please use a photo that clearly shows a deer.");
    }

    // Process features into AgeCue format

    const detectedCues: AgeCue[] = allFeatures.map((f: any) => ({
      name: TPWD_TO_LEGACY_CUE[f.feature] || f.feature as AgeCueName,
      displayName: getFeatureDisplayName(f.feature),
      detectedPattern: f.pattern || "Not detected",
      confidence: f.confidence || 50,
      ageWeight: indicatorToAgeWeight(f.indicator),
      explanation: buildFeatureExplanation(f.feature, f.indicator, f.pattern, f.rutAdjusted),
    }));

    // Calculate net age push
    const netAgePush = detectedCues.reduce((sum, cue) => sum + cue.ageWeight, 0);

    // Build body feature overlays
    const bodyFeatureOverlays: BodyFeatureOverlay[] = (analysisData.overlays || []).map((o: any, index: number) => {
      const matchingCue = detectedCues.find(
        (cue) => o.featureId?.toLowerCase().includes(cue.name.split("_")[0])
      );
      return {
        featureId: o.featureId || `feature_${index}`,
        name: o.name || getFeatureDisplayName(o.featureId),
        boundingBox: {
          x: o.boundingBox?.x || 0,
          y: o.boundingBox?.y || 0,
          width: o.boundingBox?.width || 10,
          height: o.boundingBox?.height || 10,
        },
        label: o.label || "Body Feature",
        confidence: o.confidence || 70,
        cue: matchingCue,
      };
    });

    // Determine decision based on primary feature agreement
    const primaryFeatures = allFeatures.filter((f: any) => f.isPrimary);
    const matureCount = primaryFeatures.filter(
      (f: any) => f.indicator === "mature" || f.indicator === "post-mature"
    ).length;

    // Calculate cumulative probability above minimum age
    const probabilities = analysisData.probabilities || {};
    let cumulativeProbability = 0;
    if (minimumShooterAge <= 2.5) {
      cumulativeProbability = (probabilities["2.5-3.5"] || 0) + (probabilities["3.5-4.5"] || 0) +
                             (probabilities["4.5-5.5"] || 0) + (probabilities["5.5+"] || 0);
    } else if (minimumShooterAge <= 3.5) {
      cumulativeProbability = (probabilities["3.5-4.5"] || 0) + (probabilities["4.5-5.5"] || 0) + (probabilities["5.5+"] || 0);
    } else if (minimumShooterAge <= 4.5) {
      cumulativeProbability = (probabilities["4.5-5.5"] || 0) + (probabilities["5.5+"] || 0);
    } else {
      cumulativeProbability = probabilities["5.5+"] || 0;
    }

    // Convert probabilities to estimated age band
    const estimatedAge: AgeBand = analysisData.mostLikelyAgeClass
      ? `${analysisData.mostLikelyAgeClass} years` as AgeBand
      : "2.5-3.5 years";

    const estimatedAgeYears = ageBandToYears(estimatedAge);

    // Decision logic:
    // 1. If estimated age class meets or exceeds minimum AND confidence is reasonable (>50%), it's a SHOOTER
    // 2. OR if majority of primary features show mature AND cumulative probability is high (>=60%)
    // This prevents contradictions where estimated age meets threshold but decision says LET WALK
    const estimatedMeetsMinimum = estimatedAgeYears >= minimumShooterAge;
    const rawConfidence = analysisData.overallConfidence || cumulativeProbability;
    const meetsMinimumAge = (estimatedMeetsMinimum && rawConfidence >= 50) ||
                           (matureCount >= 3 && cumulativeProbability >= 60);

    // Determine shooter/let walk/harvest/mount status
    const isHarvestedDeer = analysisData.isHarvestedDeer || false;
    const isMountedDeer = analysisData.isMountedDeer || false;

    let shooterPassLabel: "SHOOTER" | "LET WALK" | "NICE HARVEST" | "NICE MOUNT";
    let shooterPassReason: string;

    if (isMountedDeer) {
      shooterPassLabel = "NICE MOUNT";
      shooterPassReason = "Great looking mount! Body features cannot be assessed from head-only photos. " + TPWD_DISCLAIMER;
    } else if (isHarvestedDeer) {
      shooterPassLabel = "NICE HARVEST";
      shooterPassReason = generateWardenSafeExplanation(
        meetsMinimumAge ? "SHOOTER" : "LET WALK",
        minimumShooterAge,
        allFeatures,
        isRutSeason
      );
    } else if (meetsMinimumAge) {
      shooterPassLabel = "SHOOTER";
      shooterPassReason = generateWardenSafeExplanation("SHOOTER", minimumShooterAge, allFeatures, isRutSeason);
    } else {
      shooterPassLabel = "LET WALK";
      shooterPassReason = generateWardenSafeExplanation("LET WALK", minimumShooterAge, allFeatures, isRutSeason);
    }

    // Parse photo tips
    let photoTips: string[] | undefined;
    if (Array.isArray(analysisData.qualityIssues) && analysisData.qualityIssues.length > 0) {
      photoTips = analysisData.qualityIssues;
    } else if (analysisData.imageQuality === "poor") {
      photoTips = [
        "Take photos in good natural lighting",
        "Get a broadside (side) view showing the full body",
        "Ensure legs, belly, chest, and back are clearly visible",
        "Avoid heavy brush or trees blocking the body",
        "Stand 20-50 yards away for best results",
      ];
    }

    // Calculate overall confidence
    const avgConfidence = detectedCues.length > 0
      ? detectedCues.reduce((sum, c) => sum + c.confidence, 0) / detectedCues.length
      : 50;

    const qualityMultiplier =
      analysisData.imageQuality === "excellent" ? 1.0 :
      analysisData.imageQuality === "good" ? 0.9 :
      analysisData.imageQuality === "fair" ? 0.75 : 0.5;

    const overallConfidence = Math.round(avgConfidence * qualityMultiplier);

    return {
      estimatedAge,
      estimatedAgeYears,
      overallConfidence,
      meetsMinimumAge,
      minimumAgeThreshold: minimumShooterAge,
      shooterPassLabel,
      shooterPassReason,
      detectedCues,
      bodyFeatureOverlays,
      netAgePush,
      imageQuality: analysisData.imageQuality || "fair",
      occlusionLevel: analysisData.occlusionLevel || "minimal",
      photoTips,
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);

    if (errorMessage.includes("502") || errorMessage.includes("proxy")) {
      throw new Error("Network connection issue. Please check your internet and try again.");
    } else if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
      throw new Error("Analysis took too long. Please try with a clearer, simpler photo.");
    } else if (errorMessage.includes("Unable to analyze") ||
               errorMessage.includes("Not a deer") ||
               errorMessage.includes("not a deer") ||
               errorMessage.includes("not a photograph") ||
               errorMessage.includes("Only the deer") ||
               errorMessage.includes("image quality") ||
               errorMessage.includes("no deer body")) {
      // Pass through specific error messages that should be shown to the user
      throw error;
    } else {
      throw new Error("Failed to analyze deer age. Ensure the photo shows a clear broadside view of the full body.");
    }
  }
};

/**
 * Build TPWD-compliant comprehensive analysis prompt
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
  "isValidDeerImage": false,
  "invalidImageReason": "not_deer",
  "invalidImageMessage": "This is not a photograph of a real deer. Detected: [describe what it actually is - cartoon/toy/drawing/etc]. Please upload a photo of a live whitetail deer."
}

FOR REAL PHOTOGRAPHS, also check:
1. Is this a DEER? Look for:
   - A four-legged ungulate (deer, whitetail, mule deer)
   - Characteristic deer body shape (not elk, moose, cattle, or other animals)
   - NOT furniture, objects, people, vehicles, or non-animal subjects

2. If this is NOT A DEER:
   Set "isValidDeerImage": false and "invalidImageReason": "not_deer"
   DO NOT attempt to analyze age - return early with error fields

3. If this IS a deer, continue with body analysis:
   - Is this a mounted deer (taxidermy head only)? Set "invalidImageReason": "head_only" - cannot age without body
   - Is this a harvested/downed deer with body visible? Set isHarvestedDeer: true - CAN be aged
   - Is the BODY visible (not just head)? If only head visible, set "invalidImageReason": "head_only"

CRITICAL RULES FOR VALID DEER IMAGES:
1. NEVER claim an exact age - only age CLASSES (1.5-2.5, 2.5-3.5, 3.5-4.5, 4.5-5.5, 5.5+)
2. ALL assessments must be based on PROPORTIONAL BODY CHARACTERISTICS, not antlers or fat alone
3. Use RELATIVE proportions, not absolute size
4. Focus on STRUCTURAL features that don't change with nutrition or rut

MLD MINIMUM SHOOT AGE: ${minimumAge} years
${isRutSeason ? "RUT CONDITIONS: Yes - down-weight belly/backline, up-weight chest depth and leg proportion" : ""}
${region ? `REGION: ${region}` : ""}

ANALYZE THESE 7 FEATURES:

PRIMARY FEATURES (4) - HIGH WEIGHT, must agree for SHOOT:

1. NECK-TO-BRISKET INTEGRATION
   - Does neck flow into chest with NO visible pinch point?
   - IGNORE raw neck size or rut swelling
   - Mature: Smooth transition into deep chest
   - Immature: Clear pinch/gap between neck and chest

2. CHEST DEPTH RELATIVE TO HINDQUARTERS
   - Is front chest deeper/heavier than rear?
   - Front > Rear = mature class
   - Rear >= Front = younger class

3. OVERALL BODY DEPTH (RIB CAGE HEIGHT)
   - Rib cage depth from back to belly (NOT fat sag)
   - Deep barrel = older class
   - Shallow = younger class

4. LEG-TO-BODY PROPORTION
   - Legs SHORT due to deep torso = older class
   - Legs LONG/leggy = younger class
   - Most reliable single indicator

SECONDARY FEATURES (3) - SUPPORTING EVIDENCE:

5. BACKLINE POSTURE
   - Level/arched = younger
   - Swayed = older
   ${isRutSeason ? "- DOWN-WEIGHT during rut" : ""}

6. BELLY/WAIST LINE
   - Tucked = younger
   - Level = transitional
   - Pot belly = older
   ${isRutSeason ? "- HEAVILY DOWN-WEIGHT during rut" : ""}

7. HEAD-TO-BODY RATIO
   - Large head for body = younger
   - Proportional = mature
   - Small head for massive body = post-mature

RESPOND WITH THIS JSON:
{
  "isValidDeerImage": true | false,
  "invalidImageReason": null | "not_deer" | "head_only" | "poor_quality" | "not_visible",

  "probabilities": {
    "1.5-2.5": <0-100>,
    "2.5-3.5": <0-100>,
    "3.5-4.5": <0-100>,
    "4.5-5.5": <0-100>,
    "5.5+": <0-100>
  },
  "mostLikelyAgeClass": "1.5-2.5" | "2.5-3.5" | "3.5-4.5" | "4.5-5.5" | "5.5+",

  "primaryFeatures": [
    {
      "feature": "neck_brisket_integration",
      "pattern": "Description",
      "confidence": 0-100,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    },
    {
      "feature": "chest_hindquarter_ratio",
      "pattern": "Description",
      "confidence": 0-100,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    },
    {
      "feature": "body_depth",
      "pattern": "Description",
      "confidence": 0-100,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    },
    {
      "feature": "leg_body_proportion",
      "pattern": "Description",
      "confidence": 0-100,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    }
  ],

  "secondaryFeatures": [
    {
      "feature": "backline_posture",
      "pattern": "Description",
      "confidence": 0-100,
      "indicator": "immature" | "transitional" | "mature" | "post-mature",
      "rutAdjusted": true | false
    },
    {
      "feature": "belly_waistline",
      "pattern": "Description",
      "confidence": 0-100,
      "indicator": "immature" | "transitional" | "mature" | "post-mature",
      "rutAdjusted": true | false
    },
    {
      "feature": "head_body_ratio",
      "pattern": "Description",
      "confidence": 0-100,
      "indicator": "immature" | "transitional" | "mature" | "post-mature"
    }
  ],

  "overlays": [
    {
      "featureId": "feature_name",
      "boundingBox": { "x": 0-100, "y": 0-100, "width": 0-100, "height": 0-100 },
      "label": "Feature: pattern",
      "confidence": 0-100
    }
  ],

  "imageQuality": "excellent" | "good" | "fair" | "poor",
  "occlusionLevel": "none" | "minimal" | "moderate" | "high",
  "qualityIssues": ["issue1"] or null,
  "isHarvestedDeer": true | false,
  "isMountedDeer": true | false
}

RESPOND ONLY WITH VALID JSON.`;
};

export { TPWD_DISCLAIMER };
