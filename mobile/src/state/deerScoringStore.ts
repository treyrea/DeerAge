/**
 * Deer Scoring State Management with Zustand
 * Includes distance capture integration for improved accuracy
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from 'expo-file-system/legacy';
import {
  DeerScoringResult,
  DeerAnalysisFrame,
  AntlerMeasurements,
  ScaleEstimation,
  BooneAndCrockettScore,
  AgeEstimation,
  PropertyRules,
  ExplainableAgeEstimation,
} from "../types/deer-scoring";
import { fuseMultiFrameMeasurements, refineWithCloudProcessing, generateExplainableRackScoring } from "../api/deer-analysis";
import { calculateBooneAndCrockettScore } from "../utils/boone-crockett-calculator";
import {
  estimateScaleFromMultiView,
  estimateDeerAge,
} from "../utils/scale-and-age-estimation";
import { analyzeExplainableAge } from "../api/explainable-age-analysis";
import { useDistanceStore } from "./distanceStore";
import { computeDistanceAdjustment, calculateOverallConfidence } from "../utils/distance-adjustment";

// Directory for storing deer images permanently
const DEER_IMAGES_DIR = `${FileSystem.documentDirectory}deer_images/`;

/**
 * Ensure the deer images directory exists
 */
const ensureDirectoryExists = async () => {
  const dirInfo = await FileSystem.getInfoAsync(DEER_IMAGES_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DEER_IMAGES_DIR, { intermediates: true });
  }
};

/**
 * Copy image to permanent storage and return new URI
 */
const copyImageToPermanentStorage = async (sourceUri: string, analysisId: string): Promise<string> => {
  await ensureDirectoryExists();
  const filename = `${analysisId}_${Date.now()}.jpg`;
  const destUri = `${DEER_IMAGES_DIR}${filename}`;

  try {
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destUri,
    });
    return destUri;
  } catch (error) {
    console.error("Failed to copy image:", error);
    return sourceUri; // Return original if copy fails
  }
};

interface DeerScoringState {
  // State
  isCapturing: boolean;
  isProcessing: boolean;
  capturedFrames: DeerAnalysisFrame[];
  currentResult: DeerScoringResult | null;
  error: string | null;
  history: DeerScoringResult[];
  analysisMode: "age" | "score";

  // Property Rules (settings)
  propertyRules: PropertyRules;

  // Email collection tracking
  userEmail: string | null;
  analysisCount: number;
  hasSeenEmailPrompt: boolean;
  emailPromptDismissedCount: number;

  // Actions
  setAnalysisMode: (mode: "age" | "score") => void;
  setPropertyRules: (rules: Partial<PropertyRules>) => void;
  setUserEmail: (email: string) => void;
  markEmailPromptSeen: () => void;
  dismissEmailPrompt: () => void;
  startCapture: () => void;
  addFrame: (frame: DeerAnalysisFrame) => void;
  stopCapture: () => void;
  processFrames: () => Promise<void>;
  clearCurrentResult: () => void;
  saveToHistory: (result: DeerScoringResult) => Promise<void>;
  updateHistory: (result: DeerScoringResult) => void;
  deleteFromHistory: (analysisId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  reset: () => void;
}

export const useDeerScoringStore = create<DeerScoringState>()(
  persist(
    (set, get) => ({
  // Initial state
  isCapturing: false,
  isProcessing: false,
  capturedFrames: [],
  currentResult: null,
  error: null,
  history: [],
  analysisMode: "score" as "age" | "score",
  propertyRules: {
    minimumShooterAge: 3.5,
    species: "whitetail",
    isRutSeason: false,
    region: undefined,
  },

  // Email collection tracking
  userEmail: null,
  analysisCount: 0,
  hasSeenEmailPrompt: false,
  emailPromptDismissedCount: 0,

  // Set analysis mode
  setAnalysisMode: (mode: "age" | "score") => {
    set({ analysisMode: mode });
  },

  // Set property rules
  setPropertyRules: (rules: Partial<PropertyRules>) => {
    const { propertyRules } = get();
    set({ propertyRules: { ...propertyRules, ...rules } });
  },

  // Email collection actions
  setUserEmail: (email: string) => {
    set({ userEmail: email });
  },

  markEmailPromptSeen: () => {
    set({ hasSeenEmailPrompt: true });
  },

  dismissEmailPrompt: () => {
    const { emailPromptDismissedCount } = get();
    set({ emailPromptDismissedCount: emailPromptDismissedCount + 1 });
  },

  // Start capturing frames
  startCapture: () => {
    set({
      isCapturing: true,
      capturedFrames: [],
      error: null,
      currentResult: null,
    });
  },

  // Add a captured frame
  addFrame: (frame: DeerAnalysisFrame) => {
    const { capturedFrames } = get();
    set({
      capturedFrames: [...capturedFrames, frame],
    });
  },

  // Stop capturing
  stopCapture: () => {
    set({ isCapturing: false });
  },

  // Process all captured frames
  processFrames: async () => {
    console.log("[Store] processFrames called");

    // Set processing state immediately (synchronously) before any async operations
    set({ isProcessing: true, error: null });

    const { capturedFrames, analysisMode, propertyRules } = get();

    console.log("[Store] Frame count:", capturedFrames.length, "Mode:", analysisMode);

    if (capturedFrames.length === 0) {
      console.log("[Store] No frames to process");
      set({ error: "No frames captured", isProcessing: false });
      return;
    }

    try {
      const startTime = Date.now();

      // FOR AGE MODE: Use explainable age analysis
      if (analysisMode === "age") {
        const imageUri = capturedFrames[0].imageUri;

        // Get pending distance from distance store FIRST so we can use it for scale estimation
        const distanceState = useDistanceStore.getState();
        const pendingDistanceAge = distanceState.pendingDistance;
        const pendingZoomMetaAge = distanceState.pendingZoomMeta;

        // Pass distance info to scale estimation for improved confidence
        const distanceInfoForScale = pendingDistanceAge ? {
          distanceYards: pendingDistanceAge.distanceYards,
          confidence: pendingDistanceAge.confidence,
        } : undefined;

        const scale = estimateScaleFromMultiView(capturedFrames, distanceInfoForScale);

        // Run age analysis and rack analysis in PARALLEL for faster results
        console.log("[Store] Starting parallel age + rack analysis");

        const agePromise = analyzeExplainableAge(
          imageUri,
          propertyRules.minimumShooterAge,
          propertyRules
        ).catch((error) => {
          console.log("[Store] Explainable age analysis failed:", error);
          throw error; // Re-throw - age analysis is required
        });

        const rackPromise = fuseMultiFrameMeasurements(capturedFrames, scale).catch((error) => {
          console.log("[Store] Quick rack analysis failed, will use mock data:", error);
          return null; // Return null to signal failure - will use mock data
        });

        // Wait for both to complete
        const [explainableAge, rackResult] = await Promise.all([agePromise, rackPromise]);

        console.log("[Store] Parallel analysis complete");

        // Use rack result or mock data
        let measurements: AntlerMeasurements;
        let score: BooneAndCrockettScore;

        if (rackResult) {
          measurements = rackResult;
          score = calculateBooneAndCrockettScore(measurements);
          console.log("[Store] Rack analysis succeeded - points:", measurements.totalPoints + measurements.totalAbnormalPoints);
        } else {
          // Use mock measurements if rack analysis failed
          measurements = {
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
          };
          score = calculateBooneAndCrockettScore(measurements);
        }

        const age = estimateDeerAge(measurements);
        const processingTime = Date.now() - startTime;

        // Compute distance adjustment for age mode (using variables declared earlier)
        const distanceAdjustmentAge = computeDistanceAdjustment(
          pendingDistanceAge?.distanceYards,
          pendingDistanceAge?.confidence,
          pendingZoomMetaAge ?? undefined
        );

        // Calculate adjusted confidence based on explainable age confidence
        const baseAgeConfidence = (explainableAge?.overallConfidence ?? 50) / 100;
        const analysisConfidenceAge = calculateOverallConfidence(baseAgeConfidence, distanceAdjustmentAge) / 100;

        const result: DeerScoringResult = {
          analysisId: `deer-age-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          analysisMode: "age",
          capturedFrames,
          fusedFrameCount: 1,
          score,
          scale,
          age,
          explainableAge, // New: explainable age data
          processingTime,
          onDeviceProcessing: true,
          cloudRefinementUsed: false,
          // Distance data
          distanceMeasurement: pendingDistanceAge ? {
            distanceYards: pendingDistanceAge.distanceYards,
            source: pendingDistanceAge.source,
            confidence: pendingDistanceAge.confidence,
            timestamp: pendingDistanceAge.timestamp,
            notes: pendingDistanceAge.notes,
          } : undefined,
          zoomMeta: pendingZoomMetaAge ?? undefined,
          analysisConfidence: analysisConfidenceAge,
          distanceAdjusted: !!pendingDistanceAge,
        };

        // Record telemetry
        distanceState.recordTelemetry({
          analysisId: result.analysisId,
          hasDistance: !!pendingDistanceAge,
          distanceYards: pendingDistanceAge?.distanceYards,
          source: pendingDistanceAge?.source,
          confidence: pendingDistanceAge?.confidence,
          timestamp: new Date().toISOString(),
        });

        // Clear pending distance
        distanceState.clearPendingDistance();

        set({
          currentResult: result,
          isProcessing: false,
        });
        return;
      }

      // FOR SCORE MODE: Use existing antler scoring logic
      // Get pending distance from distance store FIRST so we can use it for scale estimation
      const distanceState = useDistanceStore.getState();
      const pendingDistance = distanceState.pendingDistance;
      const pendingZoomMeta = distanceState.pendingZoomMeta;

      // Pass distance info to scale estimation for improved confidence
      const distanceInfoForScale = pendingDistance ? {
        distanceYards: pendingDistance.distanceYards,
        confidence: pendingDistance.confidence,
      } : undefined;

      // Step 1: Estimate scale from multi-view (or single frame) with distance info
      const scale = estimateScaleFromMultiView(capturedFrames, distanceInfoForScale);

      // Step 2: Fuse measurements from all frames
      let measurements = await fuseMultiFrameMeasurements(capturedFrames, scale);

      // Step 3: Calculate B&C score
      let score = calculateBooneAndCrockettScore(measurements);

      // Step 4: Check if cloud refinement is needed
      // For single images, we're more lenient with confidence
      let cloudRefinementUsed = false;
      const isSingleImage = capturedFrames.length === 1;

      if (score.overallConfidence === "Low" && !isSingleImage) {
        console.log("Low confidence detected, initiating cloud refinement...");
        try {
          measurements = await refineWithCloudProcessing(measurements, capturedFrames, scale);
          score = calculateBooneAndCrockettScore(measurements);
          cloudRefinementUsed = true;
        } catch (refinementError) {
          console.warn("Cloud refinement failed, using original measurements");
        }
      }

      // Step 5: Generate explainable rack scoring
      const explainableRackScore = generateExplainableRackScoring(score, measurements);

      // Step 6: Estimate age
      const age = estimateDeerAge(measurements);

      // Step 7: Count frames used - use total captured frames since we don't update detectedAntlers flag
      const fusedFrameCount = capturedFrames.length;

      const processingTime = Date.now() - startTime;

      // Compute distance adjustment (using variables declared earlier)
      const distanceAdjustment = computeDistanceAdjustment(
        pendingDistance?.distanceYards,
        pendingDistance?.confidence,
        pendingZoomMeta ?? undefined
      );

      // Calculate adjusted confidence
      const baseConfidence = score.overallConfidence === "High" ? 0.9 : score.overallConfidence === "Med" ? 0.7 : 0.5;
      const analysisConfidence = calculateOverallConfidence(baseConfidence, distanceAdjustment) / 100;

      // Create result with distance data
      const result: DeerScoringResult = {
        analysisId: `deer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        analysisMode: "score",
        capturedFrames,
        fusedFrameCount,
        score,
        scale,
        age,
        explainableRackScore, // New: explainable rack scoring data
        processingTime,
        onDeviceProcessing: !cloudRefinementUsed,
        cloudRefinementUsed,
        // Distance data
        distanceMeasurement: pendingDistance ? {
          distanceYards: pendingDistance.distanceYards,
          source: pendingDistance.source,
          confidence: pendingDistance.confidence,
          timestamp: pendingDistance.timestamp,
          notes: pendingDistance.notes,
        } : undefined,
        zoomMeta: pendingZoomMeta ?? undefined,
        analysisConfidence,
        distanceAdjusted: !!pendingDistance,
      };

      // Record telemetry
      distanceState.recordTelemetry({
        analysisId: result.analysisId,
        hasDistance: !!pendingDistance,
        distanceYards: pendingDistance?.distanceYards,
        source: pendingDistance?.source,
        confidence: pendingDistance?.confidence,
        timestamp: new Date().toISOString(),
      });

      // Clear pending distance
      distanceState.clearPendingDistance();

      set({
        currentResult: result,
        isProcessing: false,
      });
    } catch (error) {
      // Extract error message
      let errorMessage = "Failed to analyze image. Please try again.";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      // Only log technical errors (not expected user errors like no antlers or timeouts)
      const isUserError = errorMessage.includes("No antlers") ||
                         errorMessage.includes("antlers visible") ||
                         errorMessage.includes("No frames captured") ||
                         errorMessage.includes("clearly shows") ||
                         errorMessage.includes("Please ensure the photo") ||
                         errorMessage.includes("timed out");

      // JSON parse errors and API failures are technical errors (but not timeouts) - log them
      const isTechnicalError = errorMessage.includes("JSON Parse") ||
                              errorMessage.includes("Unable to parse") ||
                              (errorMessage.includes("API") && !errorMessage.includes("timeout"));

      if (!isUserError && isTechnicalError) {
        console.error("Processing error:", error);
      }

      set({
        error: errorMessage,
        isProcessing: false,
      });
    }
  },

  // Clear current result
  clearCurrentResult: () => {
    set({ currentResult: null, capturedFrames: [], error: null });
  },

  // Save result to history
  saveToHistory: async (result: DeerScoringResult) => {
    const { history, analysisCount } = get();

    // Copy the first frame's image to permanent storage
    let savedResult = result;
    if (result.capturedFrames.length > 0) {
      try {
        const firstFrame = result.capturedFrames[0];
        const permanentUri = await copyImageToPermanentStorage(firstFrame.imageUri, result.analysisId);

        // Update the result with permanent image URI
        savedResult = {
          ...result,
          capturedFrames: [
            { ...firstFrame, imageUri: permanentUri },
            ...result.capturedFrames.slice(1),
          ],
        };
      } catch (error) {
        console.error("Failed to save image to permanent storage:", error);
      }
    }

    set({
      history: [savedResult, ...history].slice(0, 50), // Keep last 50 results
      analysisCount: analysisCount + 1, // Increment analysis count for email prompt logic
    });
  },

  // Update existing history entry (for manual overrides)
  updateHistory: (result: DeerScoringResult) => {
    const { history } = get();
    const index = history.findIndex(h => h.analysisId === result.analysisId);

    if (index !== -1) {
      const updatedHistory = [...history];
      updatedHistory[index] = result;
      set({ history: updatedHistory });
    }
  },

  // Delete from history
  deleteFromHistory: async (analysisId: string) => {
    const { history } = get();
    const item = history.find(h => h.analysisId === analysisId);

    // Delete images from storage
    if (item) {
      for (const frame of item.capturedFrames) {
        if (frame.imageUri.startsWith(DEER_IMAGES_DIR)) {
          try {
            await FileSystem.deleteAsync(frame.imageUri, { idempotent: true });
          } catch (error) {
            console.error("Failed to delete image:", error);
          }
        }
      }
    }

    set({
      history: history.filter(h => h.analysisId !== analysisId),
    });
  },

  // Clear all history
  clearHistory: async () => {
    const { history } = get();

    // Delete all images
    for (const item of history) {
      for (const frame of item.capturedFrames) {
        if (frame.imageUri.startsWith(DEER_IMAGES_DIR)) {
          try {
            await FileSystem.deleteAsync(frame.imageUri, { idempotent: true });
          } catch (error) {
            console.error("Failed to delete image:", error);
          }
        }
      }
    }

    set({ history: [] });
  },

  // Reset everything
  reset: () => {
    set({
      isCapturing: false,
      isProcessing: false,
      capturedFrames: [],
      currentResult: null,
      error: null,
    });
  },
    }),
    {
      name: "deer-scoring-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        history: state.history,
        propertyRules: state.propertyRules,
        userEmail: state.userEmail,
        analysisCount: state.analysisCount,
        hasSeenEmailPrompt: state.hasSeenEmailPrompt,
        emailPromptDismissedCount: state.emailPromptDismissedCount,
      }),
      onRehydrateStorage: () => (state) => {
        // Deduplicate history by analysisId when loading from storage
        if (state?.history) {
          const seen = new Set<string>();
          const deduplicatedHistory = state.history.filter((item) => {
            if (seen.has(item.analysisId)) {
              return false; // Skip duplicate
            }
            seen.add(item.analysisId);
            return true;
          });

          // Update state if duplicates were found
          if (deduplicatedHistory.length !== state.history.length) {
            state.history = deduplicatedHistory;
          }
        }
      },
    }
  )
);
