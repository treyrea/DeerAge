/**
 * Processing Screen - Shows analysis progress and results
 * Includes graceful error handling with helpful tips
 */

import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, ActivityIndicator, ScrollView, Pressable, Image, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

type NavigationProp = NativeStackNavigationProp<any>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * Categorize error type for appropriate UI display
 */
type ErrorCategory = "not_deer" | "no_antlers" | "poor_quality" | "network" | "timeout" | "unknown";

const categorizeError = (errorMessage: string): ErrorCategory => {
  const lowerError = errorMessage.toLowerCase();

  // Check for non-deer image (more comprehensive matching)
  // This includes cases where the AI identifies what the object actually is
  // Also includes icons, illustrations, cartoons, and other non-photograph images
  if (lowerError.includes("not a deer") ||
      lowerError.includes("no deer") ||
      lowerError.includes("not deer") ||
      lowerError.includes("does not appear to contain a deer") ||
      lowerError.includes("not contain a deer") ||
      lowerError.includes("this appears to be") ||
      lowerError.includes("this is a") ||
      lowerError.includes("this shows") ||
      lowerError.includes("furniture") ||
      lowerError.includes("tree branch") ||
      lowerError.includes("not an animal") ||
      // Non-photograph image types (icons, illustrations, etc.)
      lowerError.includes("not a photograph") ||
      lowerError.includes("icon") ||
      lowerError.includes("logo") ||
      lowerError.includes("illustration") ||
      lowerError.includes("cartoon") ||
      lowerError.includes("drawing") ||
      lowerError.includes("sketch") ||
      lowerError.includes("digital art") ||
      lowerError.includes("silhouette") ||
      lowerError.includes("graphic") ||
      lowerError.includes("clip art") ||
      lowerError.includes("clipart") ||
      lowerError.includes("ai-generated") ||
      lowerError.includes("not real") ||
      lowerError.includes("real deer antlers") ||
      // Non-deer subjects (people, other animals, objects)
      lowerError.includes("person") ||
      lowerError.includes("human") ||
      lowerError.includes("man") ||
      lowerError.includes("woman") ||
      lowerError.includes("people") ||
      lowerError.includes("cat") ||
      lowerError.includes("dog") ||
      lowerError.includes("horse") ||
      lowerError.includes("cow") ||
      lowerError.includes("elk") ||
      lowerError.includes("moose")) {
    return "not_deer";
  }

  // Check for body not visible (for age analysis) - only when it's about a DEER's body
  // These patterns should only match deer-specific body visibility issues
  if ((lowerError.includes("deer's body") ||
       lowerError.includes("deer body") ||
       lowerError.includes("body is not clearly visible") ||
       lowerError.includes("head_only") ||
       lowerError.includes("only the head") ||
       lowerError.includes("head is visible but") ||
       lowerError.includes("full body") ||
       lowerError.includes("need body visible") ||
       lowerError.includes("no body visible")) &&
      // Make sure it's actually about a deer, not a person or other subject
      !lowerError.includes("person") &&
      !lowerError.includes("human") &&
      !lowerError.includes("woman") &&
      !lowerError.includes("man") &&
      !lowerError.includes("not a deer") &&
      !lowerError.includes("not deer")) {
    return "no_antlers"; // Reuse this category for body visibility issues
  }

  // Check for no antlers visible
  if (lowerError.includes("no antlers") ||
      lowerError.includes("antlers detected") ||
      lowerError.includes("antlers visible") ||
      lowerError.includes("clearly shows") ||
      lowerError.includes("may be a doe")) {
    return "no_antlers";
  }

  // Check for network issues
  if (lowerError.includes("network") ||
      lowerError.includes("connection") ||
      lowerError.includes("502") ||
      lowerError.includes("503") ||
      lowerError.includes("proxy")) {
    return "network";
  }

  // Check for timeout
  if (lowerError.includes("timeout") ||
      lowerError.includes("timed out") ||
      lowerError.includes("taking longer") ||
      lowerError.includes("took too long")) {
    return "timeout";
  }

  // Check for poor quality
  if (lowerError.includes("quality") ||
      lowerError.includes("unclear") ||
      lowerError.includes("parse") ||
      lowerError.includes("incomplete") ||
      lowerError.includes("too poor")) {
    return "poor_quality";
  }

  return "unknown";
};

/**
 * Get display info for each error category
 */
const getErrorDisplayInfo = (category: ErrorCategory, analysisMode: "age" | "score", errorMessage?: string) => {
  // Extract what object was detected if the AI told us
  const extractDetectedObject = (msg: string): string | null => {
    if (!msg) return null;
    const lowerMsg = msg.toLowerCase();

    // Try to extract what the AI identified
    const patterns = [
      /this appears to be[:\s]+(.+?)(?:\.|$)/i,
      /this is[:\s]+a?\s*(.+?)(?:\.|,|$)/i,
      /this shows[:\s]+a?\s*(.+?)(?:\.|,|$)/i,
      /not a deer[:\s-]+(.+?)(?:\.|$)/i,
      /detected[:\s]+(.+?)(?:\.|$)/i,
    ];

    for (const pattern of patterns) {
      const match = msg.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  };

  // Check if the error is about a non-photograph image type
  const isNonPhotograph = (msg: string): boolean => {
    if (!msg) return false;
    const lowerMsg = msg.toLowerCase();
    return lowerMsg.includes("not a photograph") ||
           lowerMsg.includes("icon") ||
           lowerMsg.includes("logo") ||
           lowerMsg.includes("illustration") ||
           lowerMsg.includes("cartoon") ||
           lowerMsg.includes("drawing") ||
           lowerMsg.includes("sketch") ||
           lowerMsg.includes("digital art") ||
           lowerMsg.includes("silhouette") ||
           lowerMsg.includes("graphic") ||
           lowerMsg.includes("clip art") ||
           lowerMsg.includes("clipart") ||
           lowerMsg.includes("ai-generated");
  };

  const detectedObject = errorMessage ? extractDetectedObject(errorMessage) : null;
  const isNonPhoto = errorMessage ? isNonPhotograph(errorMessage) : false;

  switch (category) {
    case "not_deer":
      // Customize title and tips based on error type
      // "NOT A REAL PHOTO" for icons/illustrations, "NO DEER DETECTED" for real photos of non-deer subjects
      const notDeerTitle = isNonPhoto ? "NOT A DEER PHOTO" : "NO DEER DETECTED";
      const notDeerSubtitle = isNonPhoto
        ? detectedObject
          ? `Detected: ${detectedObject}`
          : "Please use a photograph of a real deer"
        : detectedObject
          ? `Detected: ${detectedObject}`
          : "This image does not contain a deer";
      const notDeerTips = isNonPhoto
        ? [
            "Use a real photograph, not icons or illustrations",
            "Avoid cartoons, drawings, or digital art",
            "Take a photo of an actual deer in the field",
            "Screenshots of logos or graphics will not work",
          ]
        : [
            "This app analyzes whitetail deer only",
            "Take or upload a photo of a deer",
            "Ensure the deer is clearly visible",
            "For scoring, antlers must be in frame",
          ];

      return {
        icon: "alert-circle" as const,
        iconColor: "#fbbf24",
        bgColors: ["#78350f", "#451a03", "#1a1a1a"] as [string, string, string],
        title: notDeerTitle,
        subtitle: notDeerSubtitle,
        tips: notDeerTips,
      };
    case "no_antlers":
      return {
        icon: "scan-outline" as const,
        iconColor: "#fbbf24",
        bgColors: ["#78350f", "#451a03", "#1a1a1a"] as [string, string, string],
        title: analysisMode === "age" ? "BODY NOT VISIBLE" : "NO ANTLERS VISIBLE",
        subtitle: analysisMode === "age"
          ? "Could not detect the deer's full body for age analysis"
          : errorMessage?.toLowerCase().includes("doe")
            ? "This appears to be a doe (female deer) without antlers"
            : "Could not detect visible antlers in this image",
        tips: analysisMode === "age"
          ? [
              "Show the full body from a side (broadside) view",
              "Ensure neck, chest, belly, and legs are visible",
              "Avoid head-only or mounted trophy photos",
              "Good lighting helps identify body characteristics",
            ]
          : [
              "Ensure the antlers are clearly visible in the photo",
              "Try a different angle showing more of the rack",
              "Avoid photos where antlers are hidden by brush",
              "Does (female deer) do not have antlers to score",
            ],
      };
    case "network":
      return {
        icon: "cloud-offline" as const,
        iconColor: "#ef4444",
        bgColors: ["#7f1d1d", "#450a0a", "#1a1a1a"] as [string, string, string],
        title: "CONNECTION ERROR",
        subtitle: "Unable to connect to the analysis service",
        tips: [
          "Check your internet connection",
          "Move to an area with better signal",
          "Try again in a few moments",
          "Wi-Fi may provide a more stable connection",
        ],
      };
    case "timeout":
      return {
        icon: "time-outline" as const,
        iconColor: "#f97316",
        bgColors: ["#7c2d12", "#431407", "#1a1a1a"] as [string, string, string],
        title: "ANALYSIS TIMEOUT",
        subtitle: "The analysis took longer than expected",
        tips: [
          "Try using a simpler, clearer photo",
          "Avoid very high-resolution images",
          "Ensure you have a stable connection",
          "Try again - temporary server load can cause this",
        ],
      };
    case "poor_quality":
      return {
        icon: "image-outline" as const,
        iconColor: "#fbbf24",
        bgColors: ["#78350f", "#451a03", "#1a1a1a"] as [string, string, string],
        title: "IMAGE QUALITY ISSUE",
        subtitle: "The image could not be properly analyzed",
        tips: [
          "Use a clearer, well-lit photo",
          "Avoid blurry or dark images",
          "Ensure the deer is in focus",
          "Try taking a new photo with better lighting",
        ],
      };
    default:
      return {
        icon: "alert-circle" as const,
        iconColor: "#ef4444",
        bgColors: ["#7f1d1d", "#450a0a", "#1a1a1a"] as [string, string, string],
        title: "ANALYSIS FAILED",
        subtitle: "Something went wrong during analysis",
        tips: [
          "Try taking a new photo",
          "Ensure good lighting and a clear subject",
          "Check your internet connection",
          "If the problem persists, try a different image",
        ],
      };
  }
};

export const ProcessingScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const isProcessing = useDeerScoringStore((s) => s.isProcessing);
  const currentResult = useDeerScoringStore((s) => s.currentResult);
  const error = useDeerScoringStore((s) => s.error);
  const capturedFrames = useDeerScoringStore((s) => s.capturedFrames);
  const analysisMode = useDeerScoringStore((s) => s.analysisMode);
  const clearCurrentResult = useDeerScoringStore((s) => s.clearCurrentResult);

  // Subscription usage tracking
  const incrementAgeAnalysis = useSubscriptionStore((s) => s.incrementAgeAnalysis);
  const incrementScoreAnalysis = useSubscriptionStore((s) => s.incrementScoreAnalysis);

  // Track if we already counted this analysis to avoid double-counting
  const hasCountedAnalysis = useRef(false);

  // Get the image URI for error display
  const imageUri = capturedFrames[0]?.imageUri;

  // Categorize and get display info for error
  const errorInfo = useMemo(() => {
    if (!error) return null;
    const category = categorizeError(error);
    return {
      category,
      ...getErrorDisplayInfo(category, analysisMode, error),
    };
  }, [error, analysisMode]);

  // Haptic feedback on error
  useEffect(() => {
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [error]);

  // Navigate to results when processing completes
  useEffect(() => {
    if (!isProcessing && currentResult) {
      // Increment usage counter only once per successful analysis
      if (!hasCountedAnalysis.current) {
        hasCountedAnalysis.current = true;
        if (analysisMode === "age") {
          incrementAgeAnalysis();
        } else {
          incrementScoreAnalysis();
        }
      }

      // Route to appropriate results screen based on analysis mode
      if (analysisMode === "age") {
        navigation.replace("AgeResults");
      } else {
        navigation.replace("Results");
      }
    }
  }, [isProcessing, currentResult, analysisMode, navigation, incrementAgeAnalysis, incrementScoreAnalysis]);

  // Modified safety check - don't redirect if we just had an error
  useEffect(() => {
    console.log("[Processing] Safety check - isProcessing:", isProcessing, "currentResult:", !!currentResult, "error:", error, "frameCount:", capturedFrames.length);

    // Don't redirect if there's an error or if we had an error recently
    // The error screen handles its own navigation after showing tips
    if (!isProcessing && !currentResult && !error && capturedFrames.length === 0) {
      console.log("[Processing] Safety check - clean state, user probably pressed back");
      // Only redirect if we're in a truly clean state (no recent errors)
      // Removed auto-redirect to let error screen show properly
    }
  }, [isProcessing, currentResult, error, capturedFrames]);

  const handleRetry = () => {
    clearCurrentResult();
    // Pop back to home, then user can start fresh
    navigation.popToTop();
  };

  const handleHome = () => {
    clearCurrentResult();
    // Pop all screens and go back to HomeMain
    navigation.popToTop();
  };

  // Error UI - Graceful with tips (similar to QuickCheckResultScreen)
  if (error && errorInfo) {
    return (
      <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
        <LinearGradient
          colors={errorInfo.bgColors}
          style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          {/* Close button */}
          <View style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 10 }}>
            <Pressable
              onPress={handleHome}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Error Icon */}
            <View className="items-center">
              <View
                className="w-28 h-28 rounded-full items-center justify-center mb-5"
                style={{ backgroundColor: `${errorInfo.iconColor}30` }}
              >
                <Ionicons name={errorInfo.icon} size={64} color={errorInfo.iconColor} />
              </View>

              {/* Error Title */}
              <Text
                className="text-2xl font-black mb-2 text-center"
                style={{ color: errorInfo.iconColor }}
              >
                {errorInfo.title}
              </Text>

              {/* Error Subtitle */}
              <Text className="text-white/80 text-base text-center px-4 mb-5">
                {errorInfo.subtitle}
              </Text>

              {/* Image Thumbnail (if available) */}
              {imageUri && (
                <View
                  className="rounded-xl overflow-hidden mb-5"
                  style={{ width: SCREEN_WIDTH * 0.35, height: SCREEN_WIDTH * 0.35 }}
                >
                  <Image
                    source={{ uri: imageUri }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                </View>
              )}

              {/* Tips Section */}
              <View className="bg-white/10 rounded-xl p-4 mb-6 w-full">
                <View className="flex-row items-center mb-3">
                  <Ionicons name="bulb" size={18} color={errorInfo.iconColor} />
                  <Text className="text-white font-semibold ml-2">Tips for better results:</Text>
                </View>
                {errorInfo.tips.map((tip, index) => (
                  <View key={index} className="flex-row items-start mb-2">
                    <Text className="text-white/70 mr-2">•</Text>
                    <Text className="text-white/70 text-sm flex-1">{tip}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <Pressable
              onPress={handleRetry}
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#e5a922" : errorInfo.iconColor,
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: "center",
                marginBottom: 12,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="camera" size={20} color="#1a1a1a" />
                <Text style={{ color: "#1a1a1a", fontWeight: "bold", marginLeft: 8 }}>Try Another Photo</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handleHome}
              style={({ pressed }) => ({
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: "rgba(255,255,255,0.6)" }}>Back to Home</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // Normal processing UI
  return (
    <View className="flex-1 bg-neutral-900" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView contentContainerClassName="flex-1 items-center justify-center px-6">
        {(
          <View className="items-center">
            {/* Loading Indicator */}
            <View className="mb-8">
              <ActivityIndicator size="large" color="#22c55e" />
            </View>

            {/* Title */}
            <Text className="text-white text-2xl font-bold mb-2">Analyzing Deer</Text>
            <Text className="text-gray-400 text-center mb-8">
              Processing {capturedFrames.length} {capturedFrames.length === 1 ? "image" : "frames"} using advanced AI
            </Text>

            {/* Processing Steps */}
            <View className="w-full max-w-md space-y-4">
              <ProcessingStep
                icon="scan"
                title="Multi-Frame Analysis"
                description="Detecting antlers and measuring geometry"
                isActive={true}
              />
              <ProcessingStep
                icon="resize"
                title="Scale Estimation"
                description="Calculating real-world measurements"
                isActive={true}
              />
              <ProcessingStep
                icon="git-compare"
                title="Antler Reconstruction"
                description="Fusing measurements and classifying all tines"
                isActive={true}
              />
              <ProcessingStep
                icon="calculator"
                title="B&C Scoring"
                description="Computing official Boone & Crockett scores"
                isActive={true}
              />
              <ProcessingStep
                icon="time"
                title="Age Estimation"
                description="Determining age band with regional priors"
                isActive={true}
              />
            </View>

            {/* Processing Info */}
            <View className="mt-8 px-4 w-full max-w-md">
              <Text className="text-gray-400 text-center text-sm leading-relaxed">
                {analysisMode === "age"
                  ? "AI is analyzing body characteristics to estimate age. This typically takes 30-60 seconds."
                  : "AI is analyzing antler geometry and applying B&C scoring rules. This typically takes 30-60 seconds."}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

interface ProcessingStepProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  isActive: boolean;
}

const ProcessingStep: React.FC<ProcessingStepProps> = ({ icon, title, description, isActive }) => {
  return (
    <View className="flex-row items-start">
      <View
        className={`w-10 h-10 rounded-full items-center justify-center mr-4 ${
          isActive ? "bg-green-500/20" : "bg-neutral-800"
        }`}
      >
        <Ionicons name={icon} size={20} color={isActive ? "#22c55e" : "#666"} />
      </View>
      <View className="flex-1">
        <Text className={`font-semibold mb-1 ${isActive ? "text-white" : "text-gray-500"}`}>
          {title}
        </Text>
        <Text className={`text-sm ${isActive ? "text-gray-400" : "text-gray-600"}`}>
          {description}
        </Text>
      </View>
    </View>
  );
};
