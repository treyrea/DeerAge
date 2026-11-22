/**
 * Processing Screen - Shows analysis progress and results
 * Includes graceful error handling with helpful tips
 */

import React, { useEffect, useMemo } from "react";
import { View, Text, ActivityIndicator, ScrollView, Pressable, Image, Dimensions, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRemoteConfig } from "../state/remoteConfig";
import { BLIND, NO_DEER_TIP, NO_DEER_TITLE, verdictWord } from "../utils/blind-verdict";
import { type AnalysisErrorCode, messageForCode } from "../api/errors";

type NavigationProp = NativeStackNavigationProp<any>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ErrorCategory = AnalysisErrorCode;

const getErrorDisplayInfo = (category: ErrorCategory, analysisMode: "age" | "score") => {
  const base = (title: string, subtitle: string, tips: string[], icon: string, iconColor: string, bgColors: [string, string, string]) => ({
    icon, iconColor, bgColors, title, subtitle, tips,
  });
  if (category === "not_deer") {
    return base("NOT A DEER", messageForCode("not_deer"), ["Use a photo of a deer", "Keep the whole animal in the frame"], "paw", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  if (category === "no_body") {
    return base(analysisMode === "age" ? "NEED THE WHOLE BODY" : "CAN'T SEE THE RACK", messageForCode("no_body"), ["Step back so the legs, belly, and back are in frame"], "body", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  if (category === "no_antlers") {
    return base("NO ANTLERS VISIBLE", messageForCode("no_antlers"), ["Frame the rack", "A front three-quarter photo scores best"], "alert-circle", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  if (category === "poor_quality") {
    return base("PHOTO IS HARD TO READ", messageForCode("poor_quality"), ["Use daylight and hold still"], "image", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  if (category === "retake") {
    return base("Try another photo", messageForCode("retake"), [], "camera", "#D4AF37", ["#2B3420", "#1a1f16", "#1a1a1a"]);
  }
  if (category === "not_configured") {
    return base("CAN'T REACH DEERAGE", messageForCode("not_configured"), ["Your signal is fine; this is an app setup problem", "Close DeerAge fully, reopen it, and try again"], "construct", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  if (category === "network") {
    return base(analysisMode === "age" ? "AGE MODE IS OFFLINE" : "YOU'RE OFFLINE", messageForCode("network"), ["DeerAge needs a connection to estimate age", "The field guide on Home works without a signal"], "cloud-offline", "#f87171", ["#7f1d1d", "#450a0a", "#1a1a1a"]);
  }
  if (category === "timeout") {
    return base("TOOK TOO LONG", messageForCode("timeout"), ["Try one clearer photo"], "time", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  if (category === "rate_limited") {
    return base("TOO MANY REQUESTS", messageForCode("rate_limited"), ["Wait a few seconds, then try again"], "hourglass", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  if (category === "fair_use") {
    return base("TODAY'S ANALYSES USED", messageForCode("fair_use"), ["Everyday use resets tomorrow"], "calendar", "#D4AF37", ["#3D4A2F", "#1a1f16", "#1a1a1a"]);
  }
  if (category === "busy") {
    return base("DEERAGE IS BUSY", messageForCode("busy"), ["Wait a little while and try the same photo again"], "hourglass", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  if (category === "quota") {
    return base("FREE ANALYSES USED", messageForCode("quota"), ["A Season Pass keeps Quick Check, Age, and Score available"], "lock-closed", "#D4AF37", ["#3D4A2F", "#1a1f16", "#1a1a1a"]);
  }
  if (category === "zero_frames") {
    return base("NO FRAMES CAPTURED", messageForCode("zero_frames"), ["Hold the phone steady through the burst"], "camera", "#f59e0b", ["#78350f", "#451a03", "#1a1a1a"]);
  }
  return base("ANALYSIS FAILED", messageForCode("unknown"), ["Try another photo", "Check that you have a signal"], "alert-circle", "#ef4444", ["#7f1d1d", "#450a0a", "#1a1a1a"]);
};

export const ProcessingScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const isProcessing = useDeerScoringStore((s) => s.isProcessing);
  const currentResult = useDeerScoringStore((s) => s.currentResult);
  const error = useDeerScoringStore((s) => s.error);
  const errorCode = useDeerScoringStore((s) => s.errorCode);
  const errorTip = useDeerScoringStore((s) => s.errorTip);
  const capturedFrames = useDeerScoringStore((s) => s.capturedFrames);
  const analysisMode = useDeerScoringStore((s) => s.analysisMode);
  const provisional = useDeerScoringStore((s) => s.provisional);
  const clearCurrentResult = useDeerScoringStore((s) => s.clearCurrentResult);
  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);
  const verdictLook = useRemoteConfig((s) => s.copy.verdictLook);
  const noDeerTitle = useRemoteConfig((s) => s.copy.noDeerTitle);
  const noDeerTip = useRemoteConfig((s) => s.copy.noDeerTip);

  // Get the image URI for error display
  const imageUri = capturedFrames[0]?.imageUri;

  // Categorize and get display info for error
  const errorInfo = useMemo(() => {
    if (!error && !errorCode) return null;
    const category: ErrorCategory = errorCode ?? "unknown";
    const display = getErrorDisplayInfo(category, analysisMode);
    return {
      category,
      ...display,
      subtitle: error || display.subtitle,
    };
  }, [error, errorCode, analysisMode]);

  // Haptic feedback on error
  useEffect(() => {
    if (!error) return;
    const look = errorCode === "retake" || errorCode === "poor_quality" || errorCode === "unreadable" || errorCode === "no_body";
    if (look && analysisMode === "age") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  }, [error, errorCode, analysisMode]);

  // Navigate to results when processing completes
  useEffect(() => {
    if (!isProcessing && currentResult) {
      if (analysisMode === "age") {
        navigation.replace("AgeResults");
      } else {
        navigation.replace("Results");
      }
    }
  }, [isProcessing, currentResult, analysisMode, navigation]);

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

  const scanAgain = () => {
    setAnalysisMode(analysisMode);
    clearCurrentResult();
    navigation.popToTop();
    navigation.navigate("ModeSelect", { mode: analysisMode });
  };

  const needsAnotherLook = Boolean(
    errorInfo && analysisMode === "age" && (
      errorInfo.category === "retake"
      || errorInfo.category === "poor_quality"
      || errorInfo.category === "unreadable"
      || errorInfo.category === "no_body"
    ),
  );

  if (error && errorCode === "no_deer") {
    const title = noDeerTitle.trim() || error || NO_DEER_TITLE;
    const tip = noDeerTip.trim() || errorTip || NO_DEER_TIP;
    return (
      <View style={{ flex: 1, backgroundColor: BLIND.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingBottom: 16 }}>
          <Text style={{ color: BLIND.ink, fontSize: 32, fontWeight: "700", textAlign: "center" }}>{title}</Text>
          <Text style={{ color: BLIND.muted, fontSize: 17, lineHeight: 24, marginTop: 14, textAlign: "center" }}>{tip}</Text>
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Pressable
            testID="no-deer-try-again"
            onPress={scanAgain}
            style={{ minHeight: 60, borderRadius: 14, backgroundColor: BLIND.button, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: BLIND.buttonInk, fontSize: 18, fontWeight: "700" }}>Try again</Text>
          </Pressable>
          <Pressable
            testID="no-deer-done"
            onPress={handleHome}
            style={{ minHeight: 52, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: BLIND.muted, fontSize: 17 }}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Error UI - Graceful with tips (similar to QuickCheckResultScreen)
  if (error && errorInfo && needsAnotherLook) {
    const title = verdictWord("look", { look: verdictLook });
    return (
      <View style={{ flex: 1, backgroundColor: BLIND.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <StatusBar barStyle="light-content" />
        <View style={{ paddingHorizontal: 8 }}>
          <Pressable onPress={handleHome} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }}>
            <Ionicons name="close" size={26} color={BLIND.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            numberOfLines={1}
            style={{ color: BLIND.look, fontSize: 40, fontWeight: "800", textAlign: "center" }}
          >
            {title}
          </Text>
          <Text style={{ color: BLIND.ink, fontSize: 17, lineHeight: 24, marginTop: 16, textAlign: "center" }}>
            {errorInfo.subtitle}
          </Text>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={{ width: 72, height: 72, borderRadius: 12, alignSelf: "center", marginTop: 16 }} />
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          <Pressable onPress={scanAgain} style={{ flex: 1, minHeight: 60, borderRadius: 14, borderWidth: 1.5, borderColor: "#3A3832", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: BLIND.ink, fontSize: 18, fontWeight: "700" }}>Scan again</Text>
          </Pressable>
          <Pressable testID="retake-done" onPress={handleHome} style={{ flex: 1, minHeight: 60, borderRadius: 14, backgroundColor: BLIND.button, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: BLIND.buttonInk, fontSize: 18, fontWeight: "700" }}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
                <Ionicons name={errorInfo.icon as keyof typeof Ionicons.glyphMap} size={64} color={errorInfo.iconColor} />
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

              {errorInfo.tips.length > 0 ? (
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
              ) : null}
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            {errorInfo.category === "quota" ? (
              <Pressable
                onPress={() => navigation.navigate("TierPaywall", { reason: "free_limit" })}
                style={{ backgroundColor: "#D4AF37", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginBottom: 12 }}
              >
                <Text style={{ color: "#1a1f16", fontWeight: "bold" }}>See plans</Text>
              </Pressable>
            ) : null}
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
                <Text style={{ color: "#1a1a1a", fontWeight: "bold", marginLeft: 8 }}>
                  {errorInfo.category === "retake" ? "Take another photo" : "Try Another Photo"}
                </Text>
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
            <Text className="text-white text-2xl font-bold mb-2 text-center">
              {analysisMode === "score"
                ? "Scoring"
                : provisional?.fieldCall === "LET WALK"
                  ? "LET WALK"
                  : "Hold, checking his body."}
            </Text>
            <Text className="text-gray-400 text-center mb-8">
              {analysisMode === "score"
                ? "This can take a couple of minutes. DeerAge will not guess early."
                : provisional?.note || "Checking the body before the rack."}
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
