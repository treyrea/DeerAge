/**
 * TPWD-Compliant Quick Age Check Service
 *
 * Purpose: Fast field decision aligned with MLD minimum age
 * Time target: ~1-2 seconds
 * Feature count: EXACTLY 3 (high-signal only)
 *
 * Uses the same two-layer reasoning model as comprehensive analysis
 * but optimized for speed with only the most reliable body indicators.
 */

import { callOpenAIChat } from "./openai-fetch";
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { AgeClass } from "../types/deer-scoring";

/**
 * Quick Age Check Result - TPWD Compliant
 */
export interface QuickAgeResult {
  // Binary decision
  decision: "SHOOT" | "LET WALK";

  // Image validation status
  isValidImage: boolean;
  invalidImageReason?: "head_mount" | "not_deer" | "no_body_visible" | "poor_quality";
  invalidImageMessage?: string;

  // Age class estimate (NOT exact age)
  estimatedAgeClass: AgeClass;

  // Confidence in the decision (0-100)
  confidence: number;

  // Warden-safe explanation using ONLY body characteristics
  explanation: string;

  // The 3 key features evaluated
  features: {
    neckBrisketIntegration: {
      pattern: string;
      indicator: "immature" | "transitional" | "mature" | "post-mature";
      confidence: number;
    };
    chestHindquarterRatio: {
      pattern: string;
      indicator: "immature" | "transitional" | "mature" | "post-mature";
      confidence: number;
    };
    legBodyProportion: {
      pattern: string;
      indicator: "immature" | "transitional" | "mature" | "post-mature";
      confidence: number;
    };
  };

  // Key deciding feature
  keyFeature: "neck_brisket" | "chest_hindquarter" | "leg_body";

  // Can deeper analysis help?
  canAnalyzeFurther: boolean;

  // Photo quality assessment
  imageQuality: "good" | "fair" | "poor";

  // Required disclaimer
  disclaimer: string;
}

/**
 * REQUIRED DISCLAIMER
 */
const TPWD_DISCLAIMER = "Age estimates are based on proportional body characteristics and represent age classes, not exact age.";

/**
 * Compress image aggressively for speed
 */
const compressImageFast = async (imageUri: string): Promise<string> => {
  try {
    const manipResult = await manipulateAsync(
      imageUri,
      [{ resize: { width: 768 } }], // Smaller for speed
      { compress: 0.6, format: SaveFormat.JPEG }
    );
    return manipResult.uri;
  } catch (error) {
    console.warn("Fast compression failed, using original:", error);
    return imageUri;
  }
};

/**
 * Sleep helper for retry delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate warden-safe explanation for quick check
 */
const generateQuickExplanation = (
  decision: "SHOOT" | "LET WALK",
  minimumAge: number,
  features: QuickAgeResult["features"]
): string => {
  const matureFeatures: string[] = [];
  const immatureFeatures: string[] = [];

  if (features.neckBrisketIntegration.indicator === "mature" ||
      features.neckBrisketIntegration.indicator === "post-mature") {
    matureFeatures.push("neck-to-brisket integration");
  } else {
    immatureFeatures.push("neck-to-brisket separation");
  }

  if (features.chestHindquarterRatio.indicator === "mature" ||
      features.chestHindquarterRatio.indicator === "post-mature") {
    matureFeatures.push("chest depth exceeding hindquarters");
  } else {
    immatureFeatures.push("chest-to-hindquarter ratio");
  }

  if (features.legBodyProportion.indicator === "mature" ||
      features.legBodyProportion.indicator === "post-mature") {
    matureFeatures.push("shortened leg appearance from body depth");
  } else {
    immatureFeatures.push("leg-to-body proportion");
  }

  if (decision === "SHOOT") {
    return `Body characteristics consistent with ${minimumAge}+ years: ${matureFeatures.join(", ")}.`;
  } else {
    return `Body characteristics suggest below ${minimumAge} years: ${immatureFeatures.join(", ")} indicate younger age class.`;
  }
};

/**
 * TPWD-Compliant Quick Age Check
 *
 * Evaluates EXACTLY 3 body features:
 * 1. Neck-to-Brisket Integration
 * 2. Chest Depth Relative to Hindquarters
 * 3. Leg-to-Body Proportion
 *
 * Returns SHOOT/LET WALK decision with warden-safe explanation
 */
export const quickAgeCheck = async (
  imageUri: string,
  minimumShooterAge: number = 3.5
): Promise<QuickAgeResult> => {
  const MAX_RETRIES = 2;
  let lastError: any = null;

  // Fast compression (do this once, outside retry loop)
  const compressedUri = await compressImageFast(imageUri);

  // Read image as base64
  const base64Image = await FileSystem.readAsStringAsync(compressedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // TPWD-compliant quick check prompt - EXACTLY 3 features + image validation
  const prompt = `QUICK DEER AGE CHECK - MLD COMPLIANT

You are a TPWD wildlife biologist making a fast field assessment.
Target time: <2 seconds.

FIRST: VALIDATE THE IMAGE
Before analyzing, determine if this image can be aged:

⚠️ CRITICAL: REJECT THESE ⚠️
- REJECT: Cartoons, drawings, sketches, illustrations, digital art, AI-generated images
- REJECT: Toys, figurines, sculptures, decorations, lawn ornaments
- REJECT: Logos, icons, silhouettes, graphics, clip art
- REJECT: Mounted heads, taxidermy, skull mounts (cannot age - no body visible)
- REJECT: Head-only photos (need full body for age estimation)

ALLOWED:
- Photos of real, live deer with body visible
- Photos of harvested deer with body visible
- Trail cam photos of real deer

If this is NOT a photograph that can be used for aging, respond with:
{
  "isValidImage": false,
  "invalidReason": "not_deer",
  "invalidMessage": "This is not a photograph of a real deer. Detected: [describe what it actually is]. Please upload a photo of a live whitetail deer."
}

Additional validation checks:
- Is this a LIVE deer or harvested deer with BODY visible (not a mounted head/taxidermy)?
- Is the full BODY visible (not just head/antlers)?
- Is this actually a deer (not another animal or object)?

If the image is INVALID, respond with:
{
  "isValidImage": false,
  "invalidReason": "head_mount" | "not_deer" | "no_body_visible" | "poor_quality",
  "invalidMessage": "Brief explanation of why this cannot be analyzed"
}

If the image IS VALID, continue with age analysis:

MLD MINIMUM SHOOT AGE: ${minimumShooterAge} years

EVALUATE EXACTLY THESE 3 FEATURES (in order of reliability):

1. NECK-TO-BRISKET INTEGRATION (MOST RELIABLE)
   - Does the neck flow into the chest with NO visible pinch point?
   - IGNORE raw neck size or rut swelling
   - Mature: Smooth transition, neck blends into deep chest
   - Immature: Clear pinch/gap between neck and chest

2. CHEST DEPTH RELATIVE TO HINDQUARTERS
   - Is front chest deeper/heavier than the rear?
   - Front > Rear = mature class indicator
   - Rear >= Front = younger age class indicator

3. LEG-TO-BODY PROPORTION (FASTEST SINGLE CHECK)
   - Do legs appear SHORT due to deep torso?
   - Short legs = older age class
   - Long/leggy legs = younger age class

DECISION LOGIC:
- If 2 or 3 features indicate "mature"/"post-mature" → SHOOT
- If 2 or 3 features indicate "immature"/"transitional" → LET WALK
- If uncertain → default to LET WALK (protect management goals)

RESPOND WITH ONLY THIS JSON (no comments, <100 tokens):
{
  "isValidImage": true,
  "decision": "SHOOT" | "LET WALK",
  "ageClass": "1.5-2.5" | "2.5-3.5" | "3.5-4.5" | "4.5-5.5" | "5.5+",
  "confidence": 0-100,
  "neckBrisket": {
    "pattern": "Brief description",
    "indicator": "immature" | "transitional" | "mature" | "post-mature",
    "confidence": 0-100
  },
  "chestHindquarter": {
    "pattern": "Brief description",
    "indicator": "immature" | "transitional" | "mature" | "post-mature",
    "confidence": 0-100
  },
  "legBody": {
    "pattern": "Brief description",
    "indicator": "immature" | "transitional" | "mature" | "post-mature",
    "confidence": 0-100
  },
  "keyFeature": "neck_brisket" | "chest_hindquarter" | "leg_body",
  "imageQuality": "good" | "fair" | "poor"
}`;

  console.log("[QuickAgeCheck] Starting analysis...");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[QuickAgeCheck] Retry attempt ${attempt}/${MAX_RETRIES}`);
        await sleep(1000 * attempt); // Exponential backoff: 1s, 2s
      }

      console.log(`[QuickAgeCheck] Attempt ${attempt + 1}: Calling OpenAI API...`);

      // Call GPT-4.1 with minimal tokens and low timeout (faster than GPT-4o with better image understanding)
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
                    detail: "low", // Low detail for speed
                  },
                },
              ],
            },
          ],
          max_tokens: 200, // Very limited for speed
          temperature: 0.1,
        },
        15000 // 15 second timeout (should complete in 1-2)
      );

      // Parse response
      console.log("[QuickAgeCheck] API call successful, parsing response...");
      const analysisText = response.choices[0]?.message?.content?.trim() || "";
      console.log("[QuickAgeCheck] Raw response length:", analysisText.length);
      console.log("[QuickAgeCheck] Raw response preview:", analysisText.substring(0, 200));

      // Extract JSON
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : analysisText;

      let data;
      try {
        data = JSON.parse(jsonText);
        console.log("[QuickAgeCheck] JSON parsed successfully, isValidImage:", data.isValidImage);
      } catch (parseError) {
        // Fallback if JSON parsing fails
        console.error("[QuickAgeCheck] JSON parse failed:", parseError);
        console.error("[QuickAgeCheck] Failed to parse:", jsonText.substring(0, 300));
        return createDefaultPassResult(minimumShooterAge);
      }

      // Check if image validation failed
      if (data.isValidImage === false) {
        return createInvalidImageResult(
          data.invalidReason || "poor_quality",
          data.invalidMessage || "This image cannot be analyzed for deer aging."
        );
      }

      // Build features object
      const features: QuickAgeResult["features"] = {
        neckBrisketIntegration: {
          pattern: data.neckBrisket?.pattern || "Unable to assess",
          indicator: data.neckBrisket?.indicator || "transitional",
          confidence: data.neckBrisket?.confidence || 50,
        },
        chestHindquarterRatio: {
          pattern: data.chestHindquarter?.pattern || "Unable to assess",
          indicator: data.chestHindquarter?.indicator || "transitional",
          confidence: data.chestHindquarter?.confidence || 50,
        },
        legBodyProportion: {
          pattern: data.legBody?.pattern || "Unable to assess",
          indicator: data.legBody?.indicator || "transitional",
          confidence: data.legBody?.confidence || 50,
        },
      };

      // Determine decision (require 2 of 3 features to agree)
      const matureCount = [
        features.neckBrisketIntegration.indicator,
        features.chestHindquarterRatio.indicator,
        features.legBodyProportion.indicator,
      ].filter(i => i === "mature" || i === "post-mature").length;

      // Parse estimated age class to get numeric value
      const ageClassStr = data.ageClass || "2.5-3.5";
      const ageClassLower = parseFloat(ageClassStr.split("-")[0]) || 2.5;

      // Decision logic:
      // 1. If estimated age class meets minimum AND confidence is reasonable (>50%), it's SHOOT
      // 2. OR if majority of features show mature (2+ of 3)
      // This prevents contradictions where estimated age meets threshold but decision says LET WALK
      const estimatedMeetsMinimum = ageClassLower >= minimumShooterAge;
      const confidence = data.confidence || 50;
      const decision: "SHOOT" | "LET WALK" =
        (estimatedMeetsMinimum && confidence >= 50) || matureCount >= 2
          ? "SHOOT"
          : "LET WALK";

      // Generate warden-safe explanation
      const explanation = generateQuickExplanation(decision, minimumShooterAge, features);

      // Determine if full analysis could help
      const avgConfidence = (
        features.neckBrisketIntegration.confidence +
        features.chestHindquarterRatio.confidence +
        features.legBodyProportion.confidence
      ) / 3;

      const canAnalyzeFurther = data.imageQuality !== "poor" && avgConfidence >= 40;

      return {
        decision,
        isValidImage: true,
        estimatedAgeClass: data.ageClass || "2.5-3.5",
        confidence: data.confidence || 50,
        explanation,
        features,
        keyFeature: data.keyFeature || "leg_body",
        canAnalyzeFurther,
        imageQuality: data.imageQuality || "fair",
        disclaimer: TPWD_DISCLAIMER,
      };
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || String(error);

      // Check if this is a retryable error
      const isRetryable =
        errorMsg.includes("temporarily unavailable") ||
        errorMsg.includes("503") ||
        errorMsg.includes("502") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("network");

      if (!isRetryable || attempt === MAX_RETRIES) {
        console.error(`[QuickAgeCheck] Final error after ${attempt + 1} attempts:`, error);
        break;
      }

      console.warn(`[QuickAgeCheck] Retryable error on attempt ${attempt + 1}:`, errorMsg);
    }
  }

  // Return safe default on error
  console.error("[QuickAgeCheck] All attempts failed, returning error fallback result");
  console.error("[QuickAgeCheck] Last error was:", lastError?.message || lastError);
  return createDefaultPassResult(minimumShooterAge);
};

/**
 * Create default LET WALK result for error cases
 */
const createDefaultPassResult = (minimumAge: number): QuickAgeResult => {
  return {
    decision: "LET WALK",
    isValidImage: false,
    invalidImageReason: "poor_quality",
    invalidImageMessage: "Analysis failed due to a connection error. Please check your internet connection and try again.",
    estimatedAgeClass: "2.5-3.5",
    confidence: 0,
    explanation: `Unable to assess body characteristics. When uncertain, let it walk to protect ${minimumAge}+ year management goals.`,
    features: {
      neckBrisketIntegration: {
        pattern: "Unable to assess",
        indicator: "transitional",
        confidence: 0,
      },
      chestHindquarterRatio: {
        pattern: "Unable to assess",
        indicator: "transitional",
        confidence: 0,
      },
      legBodyProportion: {
        pattern: "Unable to assess",
        indicator: "transitional",
        confidence: 0,
      },
    },
    keyFeature: "leg_body",
    canAnalyzeFurther: false,
    imageQuality: "poor",
    disclaimer: TPWD_DISCLAIMER,
  };
};

/**
 * Create result for invalid images (head mounts, non-deer, etc.)
 */
const createInvalidImageResult = (
  reason: "head_mount" | "not_deer" | "no_body_visible" | "poor_quality",
  message: string
): QuickAgeResult => {
  return {
    decision: "LET WALK",
    isValidImage: false,
    invalidImageReason: reason,
    invalidImageMessage: message,
    estimatedAgeClass: "2.5-3.5",
    confidence: 0,
    explanation: message,
    features: {
      neckBrisketIntegration: {
        pattern: "Not applicable",
        indicator: "transitional",
        confidence: 0,
      },
      chestHindquarterRatio: {
        pattern: "Not applicable",
        indicator: "transitional",
        confidence: 0,
      },
      legBodyProportion: {
        pattern: "Not applicable",
        indicator: "transitional",
        confidence: 0,
      },
    },
    keyFeature: "leg_body",
    canAnalyzeFurther: false,
    imageQuality: "poor",
    disclaimer: TPWD_DISCLAIMER,
  };
};
