/**
 * Mode Select Screen - Choose photo source for analysis
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { FREE_LIFETIME_ANALYSES } from "../lib/products";
import { useFairUseAllowance } from "../hooks/useFairUseAllowance";
import { DeerMark } from "../components/DeerMark";

// Custom rack ruler icon for Score My Rack
const RackRulerIcon = require("../../assets/image-1765760310.png");

type NavigationProp = NativeStackNavigationProp<any>;

export const ModeSelectScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const params = route.params as { mode?: "age" | "score" } | undefined;
  const mode = params?.mode ?? "age";

  const isAgeMode = mode === "age";
  const modeTitle = isAgeMode ? "Age My Deer" : "Score My Rack";
  const modeDescription = isAgeMode
    ? "Estimate deer maturity from body characteristics"
    : "Measure rack and calculate Boone & Crockett score";

  const leaseMinimum = useDeerScoringStore((s) => s.propertyRules.minimumShooterAge);
  const entitled = useSubscriptionStore((s) => s.entitled);
  const canProceed = useSubscriptionStore((s) => s.canStartAnalysis());
  const remaining = useSubscriptionStore((s) => s.remainingFree());
  const fairUsePerDay = useFairUseAllowance();

  const handleProceed = (destination: "Camera" | "PhotoSelect") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!canProceed) {
      navigation.navigate("TierPaywall", { reason: "free_limit" });
      return;
    }
    navigation.navigate(destination);
  };

  const getStatusDisplay = () => {
    if (entitled) {
      return {
        text: `${fairUsePerDay} a day`,
        subtext: "Everyday use. The fair-use cap resets tomorrow.",
      };
    }
    if (remaining > 0) {
      return {
        text: `${remaining} of ${FREE_LIFETIME_ANALYSES} free analyses left`,
        subtext: "Quick Check and Age share this count",
      };
    }
    return { text: "Free analyses used", subtext: "A Season Pass keeps them coming" };
  };

  const statusDisplay = getStatusDisplay();

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
          className="mr-4 w-11 h-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={28} color="#F5F5DC" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-2xl font-bold" style={{ color: "#F5F5DC" }}>
            {modeTitle}
          </Text>
          <Text className="text-sm mt-1" style={{ color: "#E5D4B8" }}>
            {modeDescription}
          </Text>
          <Text className="text-sm mt-1" style={{ color: "#D4AF37" }}>
            Your lease minimum: {leaseMinimum}
          </Text>
        </View>
      </View>

      <View className="px-6 py-8 flex-1 justify-center">
        {/* Mode Icon */}
        <View className="items-center mb-8" style={{ height: 100, justifyContent: "center" }}>
          {isAgeMode ? (
            <DeerMark size={88} color="#F5F5DC" />
          ) : (
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 16,
                backgroundColor: "#1a2e1a",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Image
                source={RackRulerIcon}
                style={{
                  width: 80,
                  height: 80,
                }}
                contentFit="contain"
                cachePolicy="memory-disk"
                priority="high"
              />
            </View>
          )}
        </View>

        {/* Usage status */}
        <View
          className="rounded-xl p-4 mb-6 flex-row items-center"
          style={{
            backgroundColor: canProceed ? "#3D4A2F" : "#4A3D2F",
            borderWidth: 1,
            borderColor: canProceed ? "#5A6447" : "#D4AF37",
          }}
        >
          <Ionicons
            name={canProceed ? "checkmark-circle" : "arrow-up-circle"}
            size={24}
            color={canProceed ? "#22c55e" : "#D4AF37"}
          />
          <View className="ml-3 flex-1">
            <Text className="font-semibold" style={{ color: canProceed ? "#22c55e" : "#D4AF37" }}>
              {statusDisplay.text}
            </Text>
            {statusDisplay.subtext && (
              <Text className="text-xs mt-1" style={{ color: "#E5D4B8" }}>
                {statusDisplay.subtext}
              </Text>
            )}
          </View>
          {!canProceed && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("TierPaywall", { reason: "free_limit" });
              }}
              className="px-3 py-2 rounded-lg"
              style={{ backgroundColor: "#D4AF37" }}
            >
              <Text className="text-xs font-bold" style={{ color: "#1a1f16" }}>
                LEVEL UP
              </Text>
            </Pressable>
          )}
        </View>

        <Text className="text-white text-lg font-bold mb-4 text-center">
          Choose Photo Source
        </Text>

        {/* Take Photo Button */}
        <Pressable
          onPress={() => handleProceed("Camera")}
          className="mb-4"
          style={{ opacity: !canProceed ? 0.6 : 1 }}
        >
          <LinearGradient
            colors={["#5A6447", "#4A5339"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 16,
              padding: 24,
              alignItems: "center",
              borderWidth: 2,
              borderColor: "#8B7355",
            }}
          >
            <Ionicons name="camera-outline" size={40} color="#F5F5DC" />
            <Text className="text-white text-2xl font-bold mt-4">Take Photo</Text>
            <Text className="text-sm mt-2 text-center" style={{ color: "#E5D4B8" }}>
              Use camera with 2-second burst capture
            </Text>
          </LinearGradient>
        </Pressable>

        {/* Upload Photo Button */}
        <Pressable
          onPress={() => handleProceed("PhotoSelect")}
          className="mb-6"
          style={{ opacity: !canProceed ? 0.6 : 1 }}
        >
          <View
            className="rounded-2xl p-6 items-center"
            style={{
              backgroundColor: "#3D4A2F",
              borderWidth: 2,
              borderColor: "#5A6447",
            }}
          >
            <Ionicons name="images-outline" size={40} color="#D4AF37" />
            <Text className="text-white text-2xl font-bold mt-4">Upload Photo</Text>
            <Text className="text-sm mt-2 text-center" style={{ color: "#E5D4B8" }}>
              Select existing photo from gallery
            </Text>
          </View>
        </Pressable>

        {/* RackScore™ AI Branding */}
        <Text className="text-xs text-center mt-8" style={{ color: "#D4AF37" }}>
          Scoring powered by RackScore™ AI
        </Text>
      </View>
    </View>
  );
};
