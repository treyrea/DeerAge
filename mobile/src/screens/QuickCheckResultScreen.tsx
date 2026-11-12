/**
 * Quick Check Screen - Fast SHOOT/LET WALK result display
 * TPWD-Compliant - Designed for split-second decisions in the field
 */

import React from "react";
import { View, Text, Pressable, Image, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import type { QuickAgeResult } from "../api/quick-age-check";
import { useDeerScoringStore } from "../state/deerScoringStore";
import * as Haptics from "expo-haptics";

type NavigationProp = NativeStackNavigationProp<any>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const QuickCheckResultScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const { result, imageUri } = route.params as {
    result: QuickAgeResult;
    imageUri: string;
  };

  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const processFrames = useDeerScoringStore((s) => s.processFrames);

  const isShoot = result.decision === "SHOOT";
  const isInvalidImage = result.isValidImage === false;

  // Haptic feedback on mount
  React.useEffect(() => {
    if (isInvalidImage) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (isShoot) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [isShoot, isInvalidImage]);

  const handleFullAnalysis = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Set up for full age analysis with the same image
    setAnalysisMode("age");
    startCapture();
    addFrame({ imageUri, frameIndex: 0, detectedAntlers: false, confidence: "Low", partialOcclusion: false });
    processFrames();
    navigation.replace("Processing");
  };

  const handleNewCheck = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.replace("QuickCheckCamera");
  };

  const handleHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Pop all screens and go back to HomeMain
    navigation.popToTop();
  };

  // Handle invalid image case
  if (isInvalidImage) {
    return (
      <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
        <LinearGradient
          colors={["#78350f", "#451a03", "#1a1a1a"]}
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

          {/* Invalid Image Result */}
          <View className="flex-1 items-center justify-center px-6">
            {/* Warning Icon */}
            <View
              className="w-32 h-32 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: "rgba(251, 191, 36, 0.3)" }}
            >
              <Ionicons name="warning" size={80} color="#fbbf24" />
            </View>

            {/* Invalid Image Title */}
            <Text className="text-3xl font-black mb-2 text-amber-400">
              {result.invalidImageReason === "head_mount"
                ? "HEAD MOUNT DETECTED"
                : result.invalidImageReason === "not_deer"
                ? "NOT A DEER"
                : result.invalidImageReason === "no_body_visible"
                ? "BODY NOT VISIBLE"
                : "POOR IMAGE QUALITY"}
            </Text>

            {/* Explanation */}
            <Text className="text-white/80 text-lg text-center px-4 mb-4">
              {result.invalidImageMessage || "This image cannot be analyzed for deer aging."}
            </Text>

            {/* Tips */}
            <View className="bg-white/10 rounded-xl p-4 mb-8 mx-4">
              <Text className="text-amber-400 font-semibold mb-2">For accurate results:</Text>
              <Text className="text-white/70 text-sm mb-1">• Use a photo of a live deer</Text>
              <Text className="text-white/70 text-sm mb-1">• Show full body in broadside view</Text>
              <Text className="text-white/70 text-sm mb-1">• Ensure good lighting conditions</Text>
              <Text className="text-white/70 text-sm">• Avoid mounted heads or antlers only</Text>
            </View>

            {/* Thumbnail */}
            <View className="rounded-xl overflow-hidden mb-8" style={{ width: SCREEN_WIDTH * 0.4, height: SCREEN_WIDTH * 0.4 }}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <Pressable
              onPress={handleNewCheck}
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#e5a922" : "#fbbf24",
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

  // Age class display (NOT exact age - TPWD compliant)
  const ageClassDisplay = `${result.estimatedAgeClass} years`;

  // Format key feature for display
  const keyFeatureDisplay = result.keyFeature === "neck_brisket"
    ? "Neck-Brisket"
    : result.keyFeature === "chest_hindquarter"
    ? "Chest Depth"
    : "Leg Proportion";

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
      {/* Full screen result background */}
      <LinearGradient
        colors={isShoot ? ["#166534", "#14532d", "#1a1a1a"] : ["#7f1d1d", "#450a0a", "#1a1a1a"]}
        style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Close button */}
        <View className="absolute top-0 right-0 z-10" style={{ paddingTop: insets.top + 8, paddingRight: 16 }}>
          <Pressable onPress={handleHome} className="w-11 h-11 items-center justify-center">
            <Ionicons name="close" size={28} color="white" />
          </Pressable>
        </View>

        {/* Main Result */}
        <View className="flex-1 items-center justify-center px-6">
          {/* Big Decision Icon */}
          <View
            className="w-32 h-32 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: isShoot ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)" }}
          >
            <Ionicons
              name={isShoot ? "checkmark-circle" : "close-circle"}
              size={80}
              color={isShoot ? "#22c55e" : "#ef4444"}
            />
          </View>

          {/* Decision Text */}
          <Text
            className="text-5xl font-black mb-2"
            style={{ color: isShoot ? "#22c55e" : "#ef4444" }}
          >
            {isShoot ? "SHOOT" : "LET WALK"}
          </Text>

          {/* Age Class Estimate (NOT exact age) */}
          <View className="flex-row items-center mb-4">
            <Text className="text-white text-2xl font-bold">{ageClassDisplay}</Text>
            <View className="ml-3 px-2 py-1 rounded-full bg-white/20">
              <Text className="text-white text-sm">{result.confidence}% confident</Text>
            </View>
          </View>

          {/* Warden-safe explanation */}
          <Text className="text-white/80 text-lg text-center px-4 mb-4">
            {result.explanation}
          </Text>

          {/* TPWD Disclaimer */}
          <Text className="text-white/50 text-xs text-center px-4 mb-8">
            {result.disclaimer}
          </Text>

          {/* Thumbnail */}
          <View className="rounded-xl overflow-hidden mb-8" style={{ width: SCREEN_WIDTH * 0.5, height: SCREEN_WIDTH * 0.5 }}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
            {/* Key feature badge */}
            <View className="absolute bottom-2 left-2 bg-black/70 rounded-full px-3 py-1">
              <Text className="text-white text-xs">
                Key: {keyFeatureDisplay}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="px-6 pb-4">
          {/* Full Analysis Button - only if photo quality supports it */}
          {result.canAnalyzeFurther && (
            <Pressable
              onPress={handleFullAnalysis}
              className="mb-3 rounded-xl py-4 items-center"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <View className="flex-row items-center">
                <Ionicons name="analytics" size={20} color="#D4AF37" />
                <Text className="text-white font-semibold ml-2">Get Full Age Analysis</Text>
              </View>
              <Text className="text-white/60 text-xs mt-1">Detailed 7-feature body assessment</Text>
            </Pressable>
          )}

          {/* New Quick Check */}
          <Pressable
            onPress={handleNewCheck}
            className="mb-3 rounded-xl py-4 items-center"
            style={{ backgroundColor: isShoot ? "#22c55e" : "#ef4444" }}
          >
            <View className="flex-row items-center">
              <Ionicons name="camera" size={20} color="white" />
              <Text className="text-white font-bold ml-2">New Quick Check</Text>
            </View>
          </Pressable>

          {/* Home */}
          <Pressable
            onPress={handleHome}
            className="rounded-xl py-3 items-center"
          >
            <Text className="text-white/60">Back to Home</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
};
