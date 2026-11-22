/**
 * Deer Scoring State Management with Zustand
 * Includes distance capture integration for improved accuracy
 */

import { create } from "zustand";
import { useScanProgress } from "./scanProgress";
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
import { fuseMultiFrameMeasurements, generateExplainableRackScoring, lastProxyAgeYears, lastProxyScale, lastShotReceipt } from "../api/deer-analysis";
import { formatAgeClass } from "../utils/age-class";
import { calculateBooneAndCrockettScore } from "../utils/boone-crockett-calculator";
import {
  estimateScaleFromMultiView,
  estimateDeerAge,
} from "../utils/scale-and-age-estimation";
import { analyzeExplainableAge } from "../api/explainable-age-analysis";
import { pickSharpestFrame } from "../lib/sharpest-frame";
import { AnalysisError, type AnalysisErrorCode } from "../api/errors";
import { useSubscriptionStore } from "./subscriptionStore";
import { useNetworkStore } from "./networkStore";
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
  errorCode: AnalysisErrorCode | null;
  errorTip: string | null;
  provisional: { fieldCall: string; note: string; ageClass: string } | null;
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

let analysisInFlight = false;

export const useDeerScoringStore = create<DeerScoringState>()(
  persist(
    (set, get) => ({
  // Initial state
  isCapturing: false,
  isProcessing: false,
  capturedFrames: [],
  currentResult: null,
  error: null,
  errorCode: null,
  errorTip: null,
  provisional: null,
  history: [],
  analysisMode: "score" as "age" | "score",
  propertyRules: {
    minimumShooterAge: 4.5,
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
      errorCode: null,
      errorTip: null,
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

  // Process all captured frames. A second call while one scan is running does not start another.
  processFrames: async () => {
    if (analysisInFlight) return;
    analysisInFlight = true;
    try {
    console.log("[Store] processFrames called");

    // Set processing state immediately (synchronously) before any async operations
    set({ isProcessing: true, error: null, errorCode: null, errorTip: null });

    const { capturedFrames, analysisMode, propertyRules } = get();
    useScanProgress.getState().start(analysisMode === "age" ? "age" : "score");

    console.log("[Store] Frame count:", capturedFrames.length, "Mode:", analysisMode);

    if (capturedFrames.length === 0) {
      set({
        error: "The burst didn't capture any frames. Hold the phone steady and try again.",
        errorCode: "zero_frames",
        errorTip: null,
        isProcessing: false,
      });
      return;
    }

    const network = useNetworkStore.getState();
    if (!network.isConnected || network.isInternetReachable === false) {
      set({
        error: analysisMode === "age"
          ? "Age mode is offline. DeerAge needs a connection to estimate age."
          : "You're offline. DeerAge needs a connection to score the rack.",
        errorCode: "network",
        errorTip: null,
        isProcessing: false,
      });
      return;
    }

    if (!useSubscriptionStore.getState().canStartAnalysis()) {
      set({
        error: "You've used your 3 free analyses.",
        errorCode: "quota",
        errorTip: null,
        isProcessing: false,
      });
      return;
    }

    try {
      const startTime = Date.now();

      // FOR AGE MODE: Use explainable age analysis
      if (analysisMode === "age") {
        const distanceState = useDistanceStore.getState();
        const pendingDistanceAge = distanceState.pendingDistance;
        const pendingZoomMetaAge = distanceState.pendingZoomMeta;

        const ageFrame = (await pickSharpestFrame(capturedFrames)) ?? capturedFrames[0];
        const ageFrames = [ageFrame];

        const explainableAge = await analyzeExplainableAge(
          ageFrame.imageUri,
          propertyRules.minimumShooterAge,
          propertyRules,
        );

        const distanceInfoForScale = pendingDistanceAge ? {
          distanceYards: pendingDistanceAge.distanceYards,
          confidence: pendingDistanceAge.confidence,
        } : undefined;
        const scale = lastProxyScale && lastProxyScale.pixelsPerInch > 0
          ? lastProxyScale
          : estimateScaleFromMultiView(ageFrames, distanceInfoForScale);

        const measurements: AntlerMeasurements = {
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
        const score: BooneAndCrockettScore = calculateBooneAndCrockettScore(measurements);

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
          capturedFrames: ageFrames,
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
          shotReceipt: lastShotReceipt,
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
      const fallbackScale = estimateScaleFromMultiView(capturedFrames, distanceInfoForScale);

      // Step 2: Fuse measurements from the sampled frames on the proxy
      let measurements = await fuseMultiFrameMeasurements(capturedFrames, fallbackScale, propertyRules.minimumShooterAge);
      const scale = lastProxyScale && lastProxyScale.pixelsPerInch > 0 ? lastProxyScale : fallbackScale;

      // Step 3: Calculate B&C score
      let score = calculateBooneAndCrockettScore(measurements);

      const cloudRefinementUsed = true;

      // Step 5: Generate explainable rack scoring
      const explainableRackScore = generateExplainableRackScoring(score, measurements);

      const age = lastProxyAgeYears
        ? {
            estimatedAge: formatAgeClass(lastProxyAgeYears).endsWith("+")
              ? "5.5+ years" as const
              : `${formatAgeClass(lastProxyAgeYears).replace("–", "-")} years` as AgeEstimation["estimatedAge"],
            confidence: score.overallConfidence,
            factors: {
              bodySize: "Med" as const,
              antlerMass: "Med" as const,
              beamDiameter: "Med" as const,
              neckSize: "Med" as const,
            },
          }
        : estimateDeerAge(measurements);

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
        shotReceipt: lastShotReceipt,
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
      const analysisError = error instanceof AnalysisError ? error : null;
      const errorMessage = analysisError?.message
        || (error instanceof Error ? error.message : "Failed to analyze image. Please try again.");
      set({
        error: errorMessage,
        errorCode: analysisError?.code ?? "unknown",
        errorTip: analysisError?.tip || null,
        isProcessing: false,
      });
    }
    } finally {
      analysisInFlight = false;
    }
  },

  // Clear current result
  clearCurrentResult: () => {
    set({ currentResult: null, capturedFrames: [], error: null, errorCode: null, errorTip: null });
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
      errorCode: null,
      errorTip: null,
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
