/**
 * Deer Antler Detection and Analysis Service
 * Uses GPT-4o Vision API or Grok-3 Vision API to detect and measure antlers across multiple frames
 */

import { callOpenAIChat } from "./openai-fetch";
import { getGrokClient } from "./grok";
import {
  AntlerMeasurements,
  DeerAnalysisFrame,
  ScaleEstimation,
  ConfidenceLevel,
  TinePoint,
  MeasurementRange,
  BooneAndCrockettScore,
  ExplainableRackScoring,
  RackScoringCue,
  RackMeasurementOverlay,
} from "../types/deer-scoring";
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { generateContextualExplanation } from "../utils/rack-scoring-criteria-library";

// Model selection - automatically falls back to GPT-4o if Grok API key not available
const USE_GROK = false; // Set to true to use Grok-3 (requires GROK_API_KEY), false for GPT-4o

/**
 * OPTIMIZED POINT COUNTING PROMPT
 * This prompt is specifically designed for accurate antler point counting
 * with the gpt-4.1-2025-04-14 model. Use this for the most reliable results.
 */
export const ACCURATE_POINT_COUNTING_PROMPT = `You are an expert scorer counting antler points on a whitetail deer buck.

⚠️ CRITICAL: IMAGE VALIDATION FIRST ⚠️
Before counting points, verify this image contains REAL deer antlers:
- REJECT: Cartoons, drawings, sketches, illustrations, digital art
- REJECT: Toys, figurines, sculptures, decorations
- REJECT: Logos, icons, silhouettes, graphics

ALLOWED for scoring (antlers can still be measured):
- Live deer with visible antlers
- Mounted heads/taxidermy
- Skull mounts/european mounts
- Harvested deer with visible antlers
- Photos of real deer/antlers

If this image does NOT contain real deer antlers, respond ONLY with:
{
  "error": true,
  "errorType": "invalid_image",
  "errorMessage": "This is not a photograph of real deer antlers. Please upload a photo of a whitetail buck's antlers."
}

If this IS an image with real deer antlers, proceed with counting:

⚠️ CRITICAL WARNING - READ THIS FIRST ⚠️
Most AI models have a STRONG BIAS toward reporting SYMMETRICAL counts (5x5, 4x4, etc.).
This is WRONG! In reality, approximately 70% of wild bucks have ASYMMETRICAL racks (6x5, 5x4, 6x4, etc.).
You MUST fight this bias and count each side COMPLETELY INDEPENDENTLY.

DEFINITION OF A POINT: Any projection at least 1 inch long that you can hang a ring on.

COUNTING METHOD - Follow this EXACTLY:

STEP 1: COVER THE LEFT SIDE OF THE IMAGE (mentally block it out)
Now count ONLY the RIGHT ANTLER (deer's right - on LEFT side of image when deer faces right):
- Start at skull base, find brow tine (G1) - points forward/down
- Trace main beam outward, count EVERY upright tine (G2, G3, G4, G5, G6...)
- Count the main beam TIP as final point
- Write your count: "RIGHT: G1[y/n] G2[y/n] G3[y/n] G4[y/n] G5[y/n] G6[y/n] tip = X points"

STEP 2: COVER THE RIGHT SIDE OF THE IMAGE (mentally block it out)
Now count ONLY the LEFT ANTLER (deer's left - on RIGHT side of image when deer faces right):
- Start FRESH - do NOT copy or refer to your right side count!
- Start at skull base, find brow tine (G1)
- Trace main beam outward, count EVERY upright tine
- Count the main beam TIP as final point
- Write your count: "LEFT: G1[y/n] G2[y/n] G3[y/n] G4[y/n] G5[y/n] G6[y/n] tip = Y points"

STEP 3: ASYMMETRY CHECK (MANDATORY)
Compare X and Y. If they are EQUAL, you probably made an error:
- Re-examine BOTH sides independently again
- One side likely has an extra tine you missed, OR is missing one
- Common: One side has G5, other doesn't. One side has smaller brow tine.
- It's statistically MORE LIKELY to be asymmetrical than symmetrical!

IMPORTANT: Do NOT force symmetry. If you genuinely see different counts, REPORT THEM.
Example correct responses: 6x5=11, 5x4=9, 6x4=10, 5x6=11

Respond ONLY with valid JSON (no comments, no // annotations):
{
  "rightAntlerPoints": <number>,
  "leftAntlerPoints": <number>,
  "totalCount": <number>,
  "confidence": "high|medium|low",
  "rightGtines": ["G1", "G2", ...list present on RIGHT],
  "leftGtines": ["G1", "G2", ...list present on LEFT],
  "explanation": "<your independent count for each side>"
}`;

/**
 * Check if Grok API is available
 */
const isGrokAvailable = (): boolean => {
  return !!process.env.EXPO_PUBLIC_VIBECODE_GROK_API_KEY;
};

/**
 * Point count result from the accurate counting function
 */
export interface AccuratePointCountResult {
  leftAntlerPoints: number;
  rightAntlerPoints: number;
  totalCount: number;
  confidence: "high" | "medium" | "low";
  leftGtines: string[];
  rightGtines: string[];
  explanation: string;
}

/**
 * Accurately count antler points using the optimized prompt with gpt-4.1
 * This function is specifically designed for the most accurate point counting results
 * Uses a two-pass approach: initial count, then verification if count seems low
 */
export const countAntlerPointsAccurately = async (
  imageUri: string
): Promise<AccuratePointCountResult> => {
  try {
    // Use higher resolution for point counting (more detail = better accuracy)
    const compressedUri = await compressImageHighRes(imageUri);

    // Read image as base64
    const base64Image = await FileSystem.readAsStringAsync(compressedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // PASS 1: Initial count
    console.log("[POINT COUNT] Pass 1: Initial count...");
    const pass1Result = await runPointCountPass(base64Image, ACCURATE_POINT_COUNTING_PROMPT);
    console.log(`[POINT COUNT] Pass 1 result: ${pass1Result.leftAntlerPoints}x${pass1Result.rightAntlerPoints}=${pass1Result.totalCount}`);

    // PASS 2: Verification if count seems low or symmetrical
    // Mature bucks typically have 8-12+ points, and asymmetry is common
    const needsVerification =
      pass1Result.totalCount < 10 || // Seems low for a mature buck
      pass1Result.leftAntlerPoints === pass1Result.rightAntlerPoints; // Symmetrical (suspicious)

    if (needsVerification) {
      console.log("[POINT COUNT] Pass 2: Verification (count seems low or symmetrical)...");

      const verificationPrompt = `VERIFICATION PASS - A previous analysis may have UNDERCOUNTED points on this deer.

Previous count: Left=${pass1Result.leftAntlerPoints}, Right=${pass1Result.rightAntlerPoints}, Total=${pass1Result.totalCount}

YOUR TASK: Look VERY CAREFULLY for any points that may have been missed.

⚠️ COMMON MISSED POINTS:
1. BROW TINES (G1) - Small tines near skull base pointing forward/down - OFTEN MISSED!
2. G5 TINES - Extra tines between G4 and main beam tip - look carefully!
3. Small tines hidden by angle or overlapping with others

INSTRUCTIONS:
1. Count the RIGHT antler (deer's right, LEFT side of image): Look for G1 brow tine, then count EVERY upright tine (G2, G3, G4, G5, G6), plus main beam tip
2. Count the LEFT antler (deer's right, RIGHT side of image): Same process, count independently
3. If you see MORE points than the previous count, report the HIGHER count
4. Most mature bucks have 10-12 points total. If you count less than 10, look again!

Respond with JSON only (no comments):
{
  "rightAntlerPoints": <number>,
  "leftAntlerPoints": <number>,
  "totalCount": <number>,
  "confidence": "high|medium|low",
  "rightGtines": ["G1", "G2", ...],
  "leftGtines": ["G1", "G2", ...],
  "explanation": "<what you found>"
}`;

      const pass2Result = await runPointCountPass(base64Image, verificationPrompt);
      console.log(`[POINT COUNT] Pass 2 result: ${pass2Result.leftAntlerPoints}x${pass2Result.rightAntlerPoints}=${pass2Result.totalCount}`);

      // Use the HIGHER count (more likely to be accurate)
      if (pass2Result.totalCount > pass1Result.totalCount) {
        console.log("[POINT COUNT] Using Pass 2 result (higher count)");
        return pass2Result;
      } else {
        console.log("[POINT COUNT] Using Pass 1 result (Pass 2 didn't find more)");
        return pass1Result;
      }
    }

    return pass1Result;
  } catch (error: any) {
    // Log as warning since this step is optional - fusion analysis will still work
    const errorMessage = error?.message || String(error);
    console.log("[POINT COUNT] Pre-count step failed (will fall back to fusion analysis):", errorMessage.substring(0, 150));

    // Re-throw with cleaner message
    throw new Error(`Point count pre-analysis unavailable: ${errorMessage.includes("timed out") ? "Analysis timed out, continuing with main analysis" : errorMessage}`);
  }
};

/**
 * Run a single point counting pass with the given prompt
 */
const runPointCountPass = async (
  base64Image: string,
  prompt: string
): Promise<AccuratePointCountResult> => {
  let lastError: any = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Use gpt-4.1-2025-04-14 for most accurate point counting
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
          max_tokens: 600,
          temperature: 0.2, // Slightly higher for verification diversity
        },
        90000 // 90 second timeout (increased from 60s for reliability)
      );

      const responseText = response.choices[0]?.message?.content?.trim() || "";

      // Check if the AI couldn't find a deer/antlers in the image
      const noDeerPhrases = [
        "no whitetail deer",
        "no deer",
        "no antlers",
        "cannot perform",
        "can't perform",
        "unable to",
        "not visible",
        "no buck",
        "cannot see",
        "can't see",
        "no visible antlers",
      ];
      const lowerResponse = responseText.toLowerCase();
      if (noDeerPhrases.some(phrase => lowerResponse.includes(phrase))) {
        console.log("[POINT COUNT] No deer detected in image");
        return {
          leftAntlerPoints: 0,
          rightAntlerPoints: 0,
          totalCount: 0,
          confidence: "low" as const,
          leftGtines: [],
          rightGtines: [],
          explanation: "No deer or antlers detected in this image. Please provide a clear photo of a whitetail buck with visible antlers.",
        };
      }

      // Parse JSON response - handle various response formats
      // First try to find JSON in code blocks
      let jsonText = "";
      const codeBlockMatch = responseText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      } else {
        // Try to find a JSON object in the response
        const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonText = jsonObjectMatch[0];
        } else {
          // No JSON found - log and return graceful error
          console.warn("[POINT COUNT] No JSON found in response:", responseText.substring(0, 200));
          return {
            leftAntlerPoints: 0,
            rightAntlerPoints: 0,
            totalCount: 0,
            confidence: "low" as const,
            leftGtines: [],
            rightGtines: [],
            explanation: "Could not analyze the image. Please try again with a clearer photo.",
          };
        }
      }

      // Clean comments from JSON (LLMs sometimes add // comments)
      jsonText = jsonText
        .split('\n')
        .map(line => {
          // Remove single-line comments but be careful not to break URLs
          const commentIndex = line.indexOf('//');
          if (commentIndex !== -1) {
            // Check if this looks like a comment (not in a string value)
            const beforeComment = line.substring(0, commentIndex);
            const quoteCount = (beforeComment.match(/"/g) || []).length;
            // If even number of quotes, we're not inside a string
            if (quoteCount % 2 === 0) {
              return beforeComment;
            }
          }
          return line;
        })
        .join('\n')
        .trim();

      const result = JSON.parse(jsonText);

      // Check if the AI returned an error (e.g., not a real deer photo)
      if (result.error === true || result.errorType === "invalid_image") {
        console.log("[POINT COUNT] Invalid image detected:", result.errorMessage);
        return {
          leftAntlerPoints: 0,
          rightAntlerPoints: 0,
          totalCount: 0,
          confidence: "low" as const,
          leftGtines: [],
          rightGtines: [],
          explanation: result.errorMessage || "This is not a valid deer photograph. Please upload a photo of a real, live whitetail buck.",
        };
      }

      return {
        leftAntlerPoints: result.leftAntlerPoints || 0,
        rightAntlerPoints: result.rightAntlerPoints || 0,
        totalCount: result.totalCount || 0,
        confidence: result.confidence || "low",
        leftGtines: result.leftGtines || [],
        rightGtines: result.rightGtines || [],
        explanation: result.explanation || "Unable to determine explanation",
      };
    } catch (err: any) {
      lastError = err;

      const errorMessage = err?.message || String(err);
      const errorStatus = err?.status || err?.response?.status;
      const isRetryable =
        errorMessage.includes("502") ||
        errorMessage.includes("proxy") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("timed out") ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("network") ||
        errorMessage.includes("did not return valid JSON") ||
        errorMessage.includes("JSON Parse error") ||
        errorStatus === 502 ||
        errorStatus === 503 ||
        errorStatus === 504;

      if (isRetryable && attempt < maxRetries) {
        const delay = 2000 * Math.pow(2, attempt); // Longer delays: 2s, 4s
        console.log(`[POINT COUNT] Retry ${attempt + 1}/${maxRetries} in ${delay}ms due to: ${errorMessage.substring(0, 100)}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      } else {
        console.log(`[POINT COUNT] Failed after ${attempt + 1} attempts: ${errorMessage.substring(0, 100)}`);
        throw err;
      }
    }
  }

  throw lastError;
};

/**
 * Compress and resize image to reduce payload size
 * OpenAI recommends images under 20MB, and smaller images process faster
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
 * Compress image with higher resolution for point counting accuracy
 * Uses larger size and less compression to preserve antler detail
 */
const compressImageHighRes = async (imageUri: string): Promise<string> => {
  try {
    const manipResult = await manipulateAsync(
      imageUri,
      [{ resize: { width: 1536 } }], // Higher resolution for detail
      { compress: 0.85, format: SaveFormat.JPEG } // Less compression
    );
    return manipResult.uri;
  } catch (error) {
    console.warn("High-res image compression failed, using original:", error);
    return imageUri;
  }
};

/**
 * Sanitize measurement range to ensure all properties are valid numbers
 */
const sanitizeMeasurementRange = (range: any): MeasurementRange => {
  return {
    min: typeof range?.min === "number" ? range.min : 0,
    max: typeof range?.max === "number" ? range.max : 0,
    average: typeof range?.average === "number" ? range.average : 0,
    confidence: range?.confidence || "Low",
  };
};

/**
 * Analyze a single frame for antler detection and measurements
 */
export const analyzeSingleFrame = async (
  imageUri: string,
  frameIndex: number,
  scale: ScaleEstimation
): Promise<DeerAnalysisFrame> => {
  try {
    // Compress image first to reduce payload size
    const compressedUri = await compressImage(imageUri);

    // Read image as base64
    const base64Image = await FileSystem.readAsStringAsync(compressedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Construct detailed prompt for GPT-4o
    const prompt = `You are an expert whitetail deer antler scorer certified by Boone & Crockett. Analyze this image and provide detailed measurements.

CRITICAL INSTRUCTIONS:
1. Detect if deer antlers are visible (respond with "ANTLERS_DETECTED: YES/NO")
2. If visible, identify ALL tines including:
   - G1 (brow tines) - closest to skull
   - G2, G3, G4, G5, G6 (numbered from base to tip)
   - Any abnormal points (non-typical tines, sticker points)
3. Measure main beam length (base to tip curve)
4. Estimate circumferences at H1, H2, H3, H4 locations
5. Measure inside spread (widest inside point between main beams)
6. Note any partial occlusion or obscured areas
7. Provide confidence: LOW, MED, or HIGH

Scale reference: ${scale.pixelsPerInch.toFixed(2)} pixels per inch

Return JSON format:
{
  "antlersDetected": true/false,
  "confidence": "LOW/MED/HIGH",
  "partialOcclusion": true/false,
  "occludedSide": "left/right/none",
  "leftSide": {
    "mainBeam": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G1": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G2": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G3": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G4": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G5": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G6": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "h1": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "h2": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "h3": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "h4": {"inches": number, "confidence": "LOW/MED/HIGH"}
  },
  "rightSide": {
    "mainBeam": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G1": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G2": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G3": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G4": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G5": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "G6": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "h1": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "h2": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "h3": {"inches": number, "confidence": "LOW/MED/HIGH"},
    "h4": {"inches": number, "confidence": "LOW/MED/HIGH"}
  },
  "insideSpread": {"inches": number, "confidence": "LOW/MED/HIGH"},
  "abnormalPoints": [
    {"inches": number, "side": "left/right", "confidence": "LOW/MED/HIGH"}
  ]
}

Respond ONLY with valid JSON, no additional text.`;

    // Call GPT-4o Vision using direct fetch
    let lastError: any = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await callOpenAIChat(
          {
            model: "gpt-4o-2024-11-20",
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
            max_tokens: 1500, // Reduced for faster response
            temperature: 0.1, // Low temperature for more consistent measurements
          },
          90000 // 90 second timeout (reduced from 120s)
        );

        // Parse response
        const analysisText = response.choices[0]?.message?.content?.trim() || "";
        let analysisData;

        try {
          // Try to extract JSON if wrapped in markdown code blocks
          const jsonMatch = analysisText.match(/```json\n?([\s\S]*?)\n?```/) || analysisText.match(/\{[\s\S]*\}/);
          const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : analysisText;
          analysisData = JSON.parse(jsonText);
        } catch (error) {
          console.error("Failed to parse analysis JSON:", error);
          return {
            frameIndex,
            imageUri,
            detectedAntlers: false,
            confidence: "Low",
            partialOcclusion: true,
          };
        }

        return {
          frameIndex,
          imageUri,
          detectedAntlers: analysisData.antlersDetected || false,
          confidence: (analysisData.confidence || "Low") as ConfidenceLevel,
          partialOcclusion: analysisData.partialOcclusion || false,
          depthData: undefined, // Depth data handled separately
        };
      } catch (err: any) {
        lastError = err;

        // Log detailed error information for debugging
        console.log("API call attempt failed:", {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          errorType: err?.constructor?.name,
          errorMessage: err?.message,
          errorStatus: err?.status,
          errorCode: err?.code,
        });

        // Check if it's a network/proxy error that we should retry
        const errorMessage = err?.message || String(err);
        const errorStatus = err?.status || err?.response?.status;
        const isRetryable =
          errorMessage.includes("502") ||
          errorMessage.includes("proxy") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("ECONNRESET") ||
          errorMessage.includes("network") ||
          errorStatus === 502 ||
          errorStatus === 503 ||
          errorStatus === 504;

        if (isRetryable && attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          // Non-retryable error or max retries exceeded
          throw err;
        }
      }
    }

    // If we get here, all retries failed
    throw lastError;
  } catch (error) {
    console.error("Frame analysis error:", error);
    return {
      frameIndex,
      imageUri,
      detectedAntlers: false,
      confidence: "Low",
      partialOcclusion: true,
    };
  }
};

/**
 * Fuse measurements from multiple frames to create comprehensive antler measurements
 */
export const fuseMultiFrameMeasurements = async (
  frames: DeerAnalysisFrame[],
  scale: ScaleEstimation
): Promise<AntlerMeasurements> => {
  // Use all frames - detection happens during analysis
  if (frames.length === 0) {
    throw new Error("No frames provided for analysis");
  }

  // STEP 1: First, get accurate point counts using dedicated counting function
  console.log("[TWO-STEP ANALYSIS] Step 1: Getting accurate point counts...");
  let confirmedLeftPoints = 0;
  let confirmedRightPoints = 0;
  let confirmedTotalPoints = 0;

  try {
    const pointCountResult = await countAntlerPointsAccurately(frames[0].imageUri);
    confirmedLeftPoints = pointCountResult.leftAntlerPoints;
    confirmedRightPoints = pointCountResult.rightAntlerPoints;
    confirmedTotalPoints = pointCountResult.totalCount;
    console.log("[TWO-STEP ANALYSIS] Confirmed point counts - Left:", confirmedLeftPoints, "Right:", confirmedRightPoints, "Total:", confirmedTotalPoints);
    console.log("[TWO-STEP ANALYSIS] Point count explanation:", pointCountResult.explanation);
  } catch (error) {
    // Point counting is optional - continue with fusion analysis which will count points too
    console.log("[TWO-STEP ANALYSIS] Point counting step skipped, relying on fusion analysis for counts");
  }

  // Prepare multi-image prompt
  const imagePromises = frames.map(async frame => {
    // Compress each image to reduce payload
    const compressedUri = await compressImage(frame.imageUri);
    const base64 = await FileSystem.readAsStringAsync(compressedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return {
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${base64}`,
        detail: "high" as const,
      },
    };
  });

  const images = await Promise.all(imagePromises);

  // STEP 2: Build fusion prompt with confirmed point counts if available
  const pointCountInstruction = confirmedTotalPoints > 0
    ? `
⚠️ CONFIRMED POINT COUNTS (from separate analysis - USE THESE EXACT VALUES):
- LEFT ANTLER: ${confirmedLeftPoints} points
- RIGHT ANTLER: ${confirmedRightPoints} points
- TOTAL: ${confirmedTotalPoints} points

You MUST structure your G-tines to match these counts:
- Left side needs ${confirmedLeftPoints - 1} G-tines (G1-G${confirmedLeftPoints - 1}) + main beam tip = ${confirmedLeftPoints} points
- Right side needs ${confirmedRightPoints - 1} G-tines (G1-G${confirmedRightPoints - 1}) + main beam tip = ${confirmedRightPoints} points

DO NOT CHANGE THESE COUNTS. The point counting has already been verified.
`
    : `
⚠️ CRITICAL WARNING: DO NOT DEFAULT TO SYMMETRICAL POINT COUNTS ⚠️
Most AI models incorrectly assume deer racks are symmetrical (5x5, 4x4).
In reality, MANY deer have ASYMMETRICAL racks (6x4, 5x4, 5x3, etc.)
You MUST count each antler INDEPENDENTLY - do NOT copy the count from one side to the other!
`;

  const fusionPrompt = `You are analyzing ${frames.length} image(s) for antler scoring. Your task is to detect antlers and create the most accurate measurements.

⚠️ CRITICAL: IMAGE VALIDATION FIRST ⚠️
Before ANY analysis, verify this image contains REAL deer antlers:
- REJECT: Cartoons, drawings, sketches, illustrations, digital art, AI-generated images
- REJECT: Toys, figurines, sculptures, decorations, lawn ornaments
- REJECT: Logos, icons, silhouettes, graphics, clip art

ALLOWED for scoring (antlers can still be measured):
- Live deer with visible antlers
- Mounted heads/taxidermy
- Skull mounts/european mounts
- Harvested deer with visible antlers
- Photos of real deer/antlers

If this image does NOT contain real deer antlers, respond with:
{
  "antlersDetected": false,
  "errorMessage": "This is not a photograph of real deer antlers. Detected: [describe what it actually is - cartoon/toy/drawing/etc]. Please upload a photo of real whitetail antlers."
}

IMAGE VALIDATION (for real antler photos):
1. Does this image contain REAL deer antlers (whitetail, mule deer, elk)?
   - If NOT real antlers, set "antlersDetected": false and describe WHAT the object actually is in errorMessage
   - Examples: "This appears to be furniture (a wooden chair)", "This is a dog, not a deer", "This shows a tree branch, not antlers"
2. Are ANTLERS clearly visible?
   - If no antlers visible (doe, fawn, or antlers not in frame), explain this in errorMessage
   - Example: "This deer does not have visible antlers - may be a doe or the antlers are not in frame"
3. If antlers ARE visible, proceed with measurements

DETECTION:
- Look for antlers (deer horns) extending from the deer's head or skull
- If no antlers in the image, set "antlersDetected": false and "errorMessage": "No antlers visible - [describe what you see]"
- If antlers are visible, proceed with measurements
${pointCountInstruction}

**MANDATORY STEP-BY-STEP POINT COUNTING (DO THIS BEFORE JSON):**

STEP 1: COUNT THE LEFT ANTLER ONLY
Look ONLY at the left antler. Starting from the base near the skull, count every point/tine going toward the tip:
- Brow tine (G1) - near skull base, often points forward
- Each upright tine (G2, G3, G4, etc.)
- The main beam tip (this counts as a point!)
Write: "LEFT ANTLER: I count [X] points: [list each one]"

STEP 2: COUNT THE RIGHT ANTLER ONLY
Now look ONLY at the right antler. Starting from the base near the skull, count every point/tine going toward the tip:
- Brow tine (G1) - near skull base
- Each upright tine (G2, G3, G4, etc.)
- The main beam tip (this counts as a point!)
Write: "RIGHT ANTLER: I count [Y] points: [list each one]"

STEP 3: VERIFY - ARE THE COUNTS DIFFERENT?
Compare your left and right counts. If they are the same, DOUBLE-CHECK both sides again.
Ask yourself: "Did I actually count each side independently, or did I assume symmetry?"

STEP 4: REPORT FINAL COUNT
"FINAL: Left=[X] + Right=[Y] = Total [X+Y] points"

After completing the enumeration, provide JSON with measurements.

Scale: ${scale.pixelsPerInch.toFixed(2)} pixels per inch

EXAMPLE for a 5x5 deer (5 points per side = 10-point buck):
NOTE: 5 points = 4 G-tines (G1-G4) + main beam tip. The main beam tip is NOT labeled as G5!
{
  "rightSide": {
    "G1": {...}, // Brow tine (point 1)
    "G2": {...}, // First upright tine (point 2)
    "G3": {...}, // Second upright tine (point 3)
    "G4": {...}  // Third upright tine (point 4) - main beam tip is point 5
  },
  "leftSide": {
    "G1": {...}, // Brow tine (point 1)
    "G2": {...}, // First upright tine (point 2)
    "G3": {...}, // Second upright tine (point 3)
    "G4": {...}  // Third upright tine (point 4) - main beam tip is point 5
  }
}
rightSidePoints = 5, leftSidePoints = 5, totalPoints = 10

EXAMPLE for a 4x4 deer (4 points per side = 8-point buck):
NOTE: 4 points = 3 G-tines (G1-G3) + main beam tip
{
  "rightSide": {
    "G1": {...}, // Brow tine (point 1)
    "G2": {...}, // First upright tine (point 2)
    "G3": {...}  // Second upright tine (point 3) - main beam tip is point 4
  },
  "leftSide": {
    "G1": {...}, // Brow tine (point 1)
    "G2": {...}, // First upright tine (point 2)
    "G3": {...}  // Second upright tine (point 3) - main beam tip is point 4
  }
}
rightSidePoints = 4, leftSidePoints = 4, totalPoints = 8

EXAMPLE for ASYMMETRICAL 6x4 deer (6 points on left, 4 on right = 10-point buck):
IMPORTANT: Many bucks are NOT symmetrical! One side may have MORE points than the other.
NOTE: The number of G-tines you report MUST match the points you actually see on each side!
- 4 points on right = G1 + G2 + G3 (3 tines) + main beam tip
- 6 points on left = G1 + G2 + G3 + G4 + G5 (5 tines) + main beam tip
{
  "rightSide": {
    "G1": {...}, // Brow tine (point 1)
    "G2": {...}, // First upright tine (point 2)
    "G3": {...}  // Second upright tine (point 3) - main beam tip is point 4
    // NOTE: Only 3 G-tines because this side only has 4 total points (3 tines + main beam tip)
  },
  "leftSide": {
    "G1": {...}, // Brow tine (point 1)
    "G2": {...}, // First upright tine (point 2)
    "G3": {...}, // Second upright tine (point 3)
    "G4": {...}, // Third upright tine (point 4)
    "G5": {...}  // Fourth upright tine (point 5) - main beam tip is point 6
    // NOTE: 5 G-tines because this side has 6 total points (5 tines + main beam tip)
  }
}
leftSidePoints = 6, rightSidePoints = 4, totalPoints = 10

CRITICAL RULE FOR G-TINES:
- Count G-tines = (points on that side) - 1 (because main beam tip is always 1 point)
- If right side has 4 points: report G1, G2, G3 only (3 tines + beam tip = 4)
- If left side has 6 points: report G1, G2, G3, G4, G5 (5 tines + beam tip = 6)
- The G-tine structure MUST be different between sides if the point counts are different!

CRITICAL: DO NOT ASSUME SYMMETRY! Count each antler INDEPENDENTLY.
If you see 6 points on one side and 4 on the other, report 6x4 = 10 points total.
If you see 5 points on one side and 3 on the other, report 5x3 = 8 points total.
NEVER force symmetry - report exactly what you count on each side.

FUSION STRATEGY:
1. For each measurement (main beams, tines, circumferences, spread):
   - If visible clearly in multiple frames, average the measurements
   - If visible in only one frame, use that measurement but mark confidence as MED
   - If occluded in all frames, estimate based on symmetry and mark as LOW confidence
2. Count ALL tines including brow tines (G1) and any abnormal points
3. For partially occluded antlers, reconstruct from visible frames
4. Provide min/max ranges for uncertain measurements


ABNORMAL POINT DETECTION (CRITICAL FOR NON-TYPICAL BUCKS):

COUNTING METHOD - Count EVERY SINGLE POINT TIP (Use this exact process):
STEP 1: Identify the 6 main typical points on each side (G1-G6) = 12 normal points maximum
STEP 2: Count EVERY SINGLE TIP/POINT END on the entire rack where tines terminate (≥1 inch)
   - This includes: normal point tips, sticker tips, fork tips, branch tips, drop tine tips, ALL tips
   - Look for small points between larger ones
   - Look for split tines where one tine forks into 2+ tips - count EACH tip
   - Look for points growing off other points - count the tip of each
STEP 3: Calculate: Total Point Tips Counted - 12 Normal = Abnormal Points

CRITICAL EXAMPLE - 27 Point Buck:
If you carefully count every single point tip on a complex rack and find 27 total tips:
- 12 are normal typical points (G1-G6 on each side)
- 27 - 12 = 15 abnormal points
This is a real world-class non-typical buck. List ALL 15 abnormal points in the abnormalPoints array.

The key is to count EVERY terminating point/tip ≥1 inch, no matter how small or where it's located.
Trophy non-typical bucks regularly have 20-30+ total points. Do NOT undercount.

IMPORTANT: Before counting, mentally trace the antler structure:
1. Find the skull/head
2. Trace the LEFT main beam from base to tip
3. Note where each tine branches off
4. Count each terminating point
5. Repeat for RIGHT main beam

Scale: ${scale.pixelsPerInch.toFixed(2)} pixels per inch

Return comprehensive JSON:
{
  "antlersDetected": true/false,
  "errorMessage": "string or null",
  "rightSide": {
    "mainBeam": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
    "G1": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G2": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G3": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G4": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G5": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G6": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "h1": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
    "h2": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
    "h3": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
    "h4": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"}
  },
  "leftSide": {
    "mainBeam": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
    "G1": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G2": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G3": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G4": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G5": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "G6": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"} or null,
    "h1": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
    "h2": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
    "h3": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
    "h4": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"}
  },
  "insideSpread": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
  "greatestSpread": {"min": number, "max": number, "average": number, "confidence": "LOW/MED/HIGH"},
  "abnormalPoints": [
    {"min": number, "max": number, "average": number, "side": "left/right", "confidence": "LOW/MED/HIGH"}
  ],
  "leftSidePoints": number,
  "rightSidePoints": number,
  "totalPoints": number,
  "totalAbnormalPoints": number
}

CRITICAL - POINT COUNTING FOR ASYMMETRICAL RACKS:
Many bucks have ASYMMETRICAL racks (e.g., 6 points on one side, 4 on the other = 10-point buck).
You MUST count each side SEPARATELY and report:
- leftSidePoints: Total points on left antler (including main beam tip)
- rightSidePoints: Total points on right antler (including main beam tip)
- totalPoints: leftSidePoints + rightSidePoints

CRITICAL - TOTAL POINTS CALCULATION:
totalPoints MUST equal the sum of ALL countable points including:
- All G tines (G1, G2, G3, G4, G5, G6) on BOTH sides that are ≥1 inch
- PLUS the main beam tip on each side (2 more points - one per antler)

BROW TINE WARNING: The G1 brow tines are the MOST COMMONLY MISSED points. They are:
- Located at the very BASE of the antler, closest to the skull
- Often smaller than other tines (2-4 inches typically)
- Point forward/downward toward the deer's nose
- EVERY typical whitetail buck has brow tines - if you don't see them, look harder!

EXAMPLE: A SYMMETRICAL 10-point buck (5x5):
- Left side: G1 (brow) + G2 + G3 + G4 + main beam tip = 5 points (leftSidePoints: 5)
- Right side: G1 (brow) + G2 + G3 + G4 + main beam tip = 5 points (rightSidePoints: 5)
- totalPoints = 10

EXAMPLE: An ASYMMETRICAL 10-point buck (6x4):
- Left side: G1 (brow) + G2 + G3 + G4 + G5 + main beam tip = 6 points (leftSidePoints: 6)
- Right side: G1 (brow) + G2 + G3 + main beam tip = 4 points (rightSidePoints: 4)
- totalPoints = 10

EXAMPLE: A typical 8-point buck (4x4):
- Left side: G1 (brow) + G2 + G3 + main beam tip = 4 points (leftSidePoints: 4)
- Right side: G1 (brow) + G2 + G3 + main beam tip = 4 points (rightSidePoints: 4)
- totalPoints = 8

DO NOT forget to count the main beam tips AND the brow tines! These are the two most commonly missed points.

NEVER leave fields blank. If uncertain, provide a range with appropriate confidence level.

Respond ONLY with valid JSON.`;

  try {
    // Implement retry logic for network errors
    let lastError: any = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let response;
        const shouldUseGrok = USE_GROK && isGrokAvailable();

        if (shouldUseGrok) {
          // Use Grok-3 for vision analysis
          const grokClient = getGrokClient();
          response = await grokClient.chat.completions.create({
            model: "grok-vision-beta",
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: fusionPrompt }, ...images],
              },
            ],
            max_tokens: 4000,
            temperature: 0.1,
          });
        } else {
          // Use GPT-4.1 for vision analysis (most accurate for point counting)
          response = await callOpenAIChat(
            {
              model: "gpt-4.1-2025-04-14",
              messages: [
                {
                  role: "user",
                  content: [{ type: "text", text: fusionPrompt }, ...images],
                },
              ],
              max_tokens: 3000, // Reduced from 4000
              temperature: 0.1,
            },
            90000 // 90 second timeout (reduced from 120s)
          );
        }

        const fusedText = response.choices[0]?.message?.content?.trim() || "";

        // Log the raw response for debugging if it's short (likely incomplete)
        if (fusedText.length < 50) {
          console.log("Short API response detected:", fusedText);
        }

        // Extract point enumeration text (everything before the JSON)
        const jsonMatch = fusedText.match(/```json\n?([\s\S]*?)\n?```/) || fusedText.match(/\{[\s\S]*\}/);
        let jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : fusedText;

        // Clean the JSON by removing JavaScript-style comments that AI sometimes includes
        // This handles cases where the AI puts // comments inside the JSON object
        jsonText = jsonText
          .split('\n')
          .map(line => {
            // Remove // comments but be careful not to remove URLs (http://)
            const commentIndex = line.indexOf('//');
            if (commentIndex !== -1) {
              // Check if this is a URL (has : before //)
              const beforeComment = line.substring(0, commentIndex);
              if (!beforeComment.endsWith(':') && !beforeComment.endsWith(':/')) {
                return line.substring(0, commentIndex);
              }
            }
            return line;
          })
          .join('\n');

        // Extract enumeration text (everything before the JSON block starts)
        // Find the start of the JSON block (including markdown fence if present)
        let jsonBlockStartIndex = -1;
        const markdownFenceMatch = fusedText.match(/```json/);
        if (markdownFenceMatch && markdownFenceMatch.index !== undefined) {
          // JSON is wrapped in markdown fence - get text before the fence
          jsonBlockStartIndex = markdownFenceMatch.index;
        } else {
          // Raw JSON - find the opening brace
          jsonBlockStartIndex = fusedText.indexOf('{');
        }

        const pointEnumeration = jsonBlockStartIndex > 0 ? fusedText.substring(0, jsonBlockStartIndex).trim() : "";

        let fusedData: any;
        try {
          fusedData = JSON.parse(jsonText);
          // Log the AI's point count for debugging
          console.log("[POINT COUNT DEBUG] AI returned totalPoints:", fusedData.totalPoints);
          console.log("[POINT COUNT DEBUG] AI returned leftSidePoints:", fusedData.leftSidePoints);
          console.log("[POINT COUNT DEBUG] AI returned rightSidePoints:", fusedData.rightSidePoints);
          console.log("[POINT COUNT DEBUG] Right side G tines:",
            Object.keys(fusedData.rightSide || {}).filter(k => k.startsWith('G') && fusedData.rightSide[k]).join(', '));
          console.log("[POINT COUNT DEBUG] Left side G tines:",
            Object.keys(fusedData.leftSide || {}).filter(k => k.startsWith('G') && fusedData.leftSide[k]).join(', '));
          // Log point enumeration if present
          if (pointEnumeration) {
            console.log("[POINT COUNT DEBUG] Point enumeration preview:", pointEnumeration.substring(0, 300));
          }
        } catch (parseError) {
          console.error("JSON parse failed. Raw response:", fusedText.substring(0, 500));
          throw new Error("Unable to parse AI response. The analysis may be incomplete. Please try again with a clearer photo.");
        }

        // Check if antlers were detected
        if (!fusedData.antlersDetected) {
          throw new Error(
            fusedData.errorMessage ||
            "No antlers detected. Please ensure the photo clearly shows a deer with visible antlers."
          );
        }

        // Convert to AntlerMeasurements format
        const measurements: AntlerMeasurements = {
          rightMainBeam: {
            length: sanitizeMeasurementRange(fusedData.rightSide.mainBeam),
            side: "right",
          },
          leftMainBeam: {
            length: sanitizeMeasurementRange(fusedData.leftSide.mainBeam),
            side: "left",
          },
          rightG1: fusedData.rightSide.G1
            ? { length: sanitizeMeasurementRange(fusedData.rightSide.G1), side: "right" }
            : undefined,
          rightG2: fusedData.rightSide.G2
            ? { length: sanitizeMeasurementRange(fusedData.rightSide.G2), side: "right" }
            : undefined,
          rightG3: fusedData.rightSide.G3
            ? { length: sanitizeMeasurementRange(fusedData.rightSide.G3), side: "right" }
            : undefined,
          rightG4: fusedData.rightSide.G4
            ? { length: sanitizeMeasurementRange(fusedData.rightSide.G4), side: "right" }
            : undefined,
          rightG5: fusedData.rightSide.G5
            ? { length: sanitizeMeasurementRange(fusedData.rightSide.G5), side: "right" }
            : undefined,
          rightG6: fusedData.rightSide.G6
            ? { length: sanitizeMeasurementRange(fusedData.rightSide.G6), side: "right" }
            : undefined,
          leftG1: fusedData.leftSide.G1
            ? { length: sanitizeMeasurementRange(fusedData.leftSide.G1), side: "left" }
            : undefined,
          leftG2: fusedData.leftSide.G2
            ? { length: sanitizeMeasurementRange(fusedData.leftSide.G2), side: "left" }
            : undefined,
          leftG3: fusedData.leftSide.G3
            ? { length: sanitizeMeasurementRange(fusedData.leftSide.G3), side: "left" }
            : undefined,
          leftG4: fusedData.leftSide.G4
            ? { length: sanitizeMeasurementRange(fusedData.leftSide.G4), side: "left" }
            : undefined,
          leftG5: fusedData.leftSide.G5
            ? { length: sanitizeMeasurementRange(fusedData.leftSide.G5), side: "left" }
            : undefined,
          leftG6: fusedData.leftSide.G6
            ? { length: sanitizeMeasurementRange(fusedData.leftSide.G6), side: "left" }
            : undefined,
          abnormalPoints:
            fusedData.abnormalPoints?.map((p: any) => ({
              length: sanitizeMeasurementRange(p),
              side: p.side,
              isAbnormal: true,
            })) || [],
          rightCircumferences: {
            h1: fusedData.rightSide.h1 ? sanitizeMeasurementRange(fusedData.rightSide.h1) : undefined,
            h2: fusedData.rightSide.h2 ? sanitizeMeasurementRange(fusedData.rightSide.h2) : undefined,
            h3: fusedData.rightSide.h3 ? sanitizeMeasurementRange(fusedData.rightSide.h3) : undefined,
            h4: fusedData.rightSide.h4 ? sanitizeMeasurementRange(fusedData.rightSide.h4) : undefined,
          },
          leftCircumferences: {
            h1: fusedData.leftSide.h1 ? sanitizeMeasurementRange(fusedData.leftSide.h1) : undefined,
            h2: fusedData.leftSide.h2 ? sanitizeMeasurementRange(fusedData.leftSide.h2) : undefined,
            h3: fusedData.leftSide.h3 ? sanitizeMeasurementRange(fusedData.leftSide.h3) : undefined,
            h4: fusedData.leftSide.h4 ? sanitizeMeasurementRange(fusedData.leftSide.h4) : undefined,
          },
          insideSpread: sanitizeMeasurementRange(fusedData.insideSpread),
          greatestSpread: fusedData.greatestSpread ? sanitizeMeasurementRange(fusedData.greatestSpread) : undefined,
          totalPoints: fusedData.totalPoints || 0, // Use AI's total point count directly
          leftSidePoints: fusedData.leftSidePoints || 0, // Points on left antler
          rightSidePoints: fusedData.rightSidePoints || 0, // Points on right antler
          totalAbnormalPoints: fusedData.totalAbnormalPoints || 0,
          pointEnumeration: pointEnumeration || undefined, // AI's step-by-step counting explanation
        };

        // VALIDATION: Count actual G-tines present in the response to verify AI's side counts
        const actualRightGTines = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].filter(g => fusedData.rightSide?.[g]).length;
        const actualLeftGTines = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].filter(g => fusedData.leftSide?.[g]).length;

        // Add 1 for main beam tip on each side (main beam always counts as a point)
        const calculatedRightPoints = actualRightGTines + 1;
        const calculatedLeftPoints = actualLeftGTines + 1;
        const calculatedTotal = calculatedRightPoints + calculatedLeftPoints;

        console.log("[POINT VALIDATION] G-tines found - Left:", actualLeftGTines, "Right:", actualRightGTines);
        console.log("[POINT VALIDATION] Calculated with main beam tips - Left:", calculatedLeftPoints, "Right:", calculatedRightPoints, "Total:", calculatedTotal);
        console.log("[POINT VALIDATION] AI reported - Left:", fusedData.leftSidePoints, "Right:", fusedData.rightSidePoints, "Total:", fusedData.totalPoints);

        // PRIORITY 1: Use confirmed counts from step 1 (most reliable)
        if (confirmedTotalPoints > 0) {
          console.log("[POINT VALIDATION] Using CONFIRMED counts from step 1 analysis");
          measurements.leftSidePoints = confirmedLeftPoints;
          measurements.rightSidePoints = confirmedRightPoints;
          measurements.totalPoints = confirmedTotalPoints;
        }
        // PRIORITY 2: If AI's side counts don't match G-tine count, use calculated values
        else if (measurements.leftSidePoints !== calculatedLeftPoints || measurements.rightSidePoints !== calculatedRightPoints) {
          console.log("[POINT VALIDATION] Mismatch detected! Using calculated G-tine counts instead of AI's reported counts");
          measurements.leftSidePoints = calculatedLeftPoints;
          measurements.rightSidePoints = calculatedRightPoints;
          // Keep AI's total if it matches calculated, otherwise use calculated
          if (measurements.totalPoints !== calculatedTotal) {
            measurements.totalPoints = calculatedTotal;
          }
        }

        // If AI didn't provide totalPoints, calculate it including main beam tips
        if (!fusedData.totalPoints || fusedData.totalPoints === 0) {
          let leftPoints = 0;
          let rightPoints = 0;

          // Count normal tines (G1-G6) on both sides that are >= 1 inch
          const tinePositions = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
          for (const pos of tinePositions) {
            const rightKey = `right${pos}` as keyof typeof measurements;
            const leftKey = `left${pos}` as keyof typeof measurements;

            const rightTine = measurements[rightKey];
            const leftTine = measurements[leftKey];

            // Count right tine if >= 1 inch (B&C minimum)
            if (rightTine && typeof rightTine === "object" && "length" in rightTine) {
              const length = typeof rightTine.length === "number"
                ? rightTine.length
                : rightTine.length.average;
              if (length >= 1.0) rightPoints++;
            }

            // Count left tine if >= 1 inch (B&C minimum)
            if (leftTine && typeof leftTine === "object" && "length" in leftTine) {
              const length = typeof leftTine.length === "number"
                ? leftTine.length
                : leftTine.length.average;
              if (length >= 1.0) leftPoints++;
            }
          }

          // Add main beam tips as points (each main beam tip counts as 1 point)
          const rightMainBeamLength = getMeasurementValue(measurements.rightMainBeam.length);
          const leftMainBeamLength = getMeasurementValue(measurements.leftMainBeam.length);
          if (rightMainBeamLength >= 1.0) rightPoints++;
          if (leftMainBeamLength >= 1.0) leftPoints++;

          measurements.leftSidePoints = leftPoints;
          measurements.rightSidePoints = rightPoints;
          measurements.totalPoints = leftPoints + rightPoints;
        }

        return measurements;
      } catch (err: any) {
        lastError = err;

        // Log detailed error information for debugging
        console.log("Fusion API call attempt failed:", {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          frameCount: frames.length,
          errorType: err?.constructor?.name,
          errorMessage: err?.message,
          errorStatus: err?.status,
          errorCode: err?.code,
        });

        // Check if it's a network/proxy error that we should retry
        const errorMessage = err?.message || String(err);
        const errorStatus = err?.status || err?.response?.status;
        const isRetryable =
          errorMessage.includes("502") ||
          errorMessage.includes("proxy") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("ECONNRESET") ||
          errorMessage.includes("network") ||
          errorStatus === 502 ||
          errorStatus === 503 ||
          errorStatus === 504;

        if (isRetryable && attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          console.log(`Retrying fusion in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          // Non-retryable error or max retries exceeded
          throw err;
        }
      }
    }

    // If we get here, all retries failed
    throw lastError;
  } catch (error: any) {
    const errorMessage = error?.message || String(error);

    console.log("Fusion error details:", {
      message: errorMessage,
      status: error?.status,
      code: error?.code,
      type: error?.constructor?.name,
    });

    // Provide user-friendly error messages
    if (errorMessage.includes("502") || errorMessage.includes("proxy")) {
      throw new Error("Network connection issue. Please check your internet connection and try again.");
    } else if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
      throw new Error("The image analysis is taking longer than expected. This usually happens with very detailed images. Please try again or use a clearer, simpler photo.");
    } else if (errorMessage.includes("API key")) {
      throw new Error("API configuration error. Please contact support.");
    } else if (errorMessage.includes("No antlers") || errorMessage.includes("antlers detected")) {
      throw error; // Pass through the antler detection error as-is
    } else if (errorMessage.includes("Unable to parse")) {
      throw error; // Pass through JSON parsing errors as-is
    } else if (errorMessage.startsWith("Analysis failed:")) {
      throw error; // Already formatted, pass through as-is
    } else {
      throw new Error(`Analysis failed: ${errorMessage}`);
    }
  }
};

/**
 * Refine measurements using cloud processing for low confidence results
 */
export const refineWithCloudProcessing = async (
  measurements: AntlerMeasurements,
  frames: DeerAnalysisFrame[],
  scale: ScaleEstimation
): Promise<AntlerMeasurements> => {
  // Re-run fusion with higher detail and more detailed prompt
  console.log("Running cloud refinement for low confidence measurements...");
  return fuseMultiFrameMeasurements(frames, scale);
};

/**
 * Helper function to get measurement value (handles both number and MeasurementRange)
 */
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
