/**
 * Settings Screen - Configure Property Rules and app preferences
 * Includes distance capture settings and rangefinder integration scaffold
 */

import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Platform, Linking, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useDistanceStore } from "../state/distanceStore";
import { useSubscriptionStore } from "../state/subscriptionStoreV2";
import { TIERS } from "../lib/CONSTITUTION";
import * as Haptics from "expo-haptics";
import type { DistanceTelemetry } from "../types/distance";

type NavigationProp = NativeStackNavigationProp<any>;

export const SettingsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const propertyRules = useDeerScoringStore((s) => s.propertyRules);
  const setPropertyRules = useDeerScoringStore((s) => s.setPropertyRules);

  // Distance settings - use individual selectors to prevent re-render loops
  const distanceSettings = useDistanceStore((s) => s.settings);
  const updateDistanceSettings = useDistanceStore((s) => s.updateSettings);
  const enableRangefinder = useDistanceStore((s) => s.enableBluetoothRangefinder);
  const rangefinderState = useDistanceStore((s) => s.rangefinderState);
  const telemetryData = useDistanceStore((s) => s.telemetryData);

  // Compute telemetry stats with useMemo to avoid re-creating on every render
  const telemetryStats = useMemo(() => {
    const totalAnalyses = telemetryData.length;
    const withDistance = telemetryData.filter((t: DistanceTelemetry) => t.hasDistance).length;
    const percentWithDistance = totalAnalyses > 0 ? (withDistance / totalAnalyses) * 100 : 0;

    // Ranged vs estimated
    const rangedVsEstimated = { ranged: 0, estimated: 0 };
    telemetryData.forEach((t: DistanceTelemetry) => {
      if (t.hasDistance && t.distanceYards) {
        if (t.source === "rangefinder_bluetooth" || t.source === "rangefinder_manual") {
          rangedVsEstimated.ranged++;
        } else {
          rangedVsEstimated.estimated++;
        }
      }
    });

    return {
      totalAnalyses,
      withDistance,
      percentWithDistance,
      rangedVsEstimated,
    };
  }, [telemetryData]);

  // Subscription state (V2 store - tier-based)
  const currentTier = useSubscriptionStore((s) => s.currentTier);
  const checkAndUpdateTier = useSubscriptionStore((s) => s.checkAndUpdateTier);
  const getRemainingUses = useSubscriptionStore((s) => s.getRemainingUses);
  const getLimit = useSubscriptionStore((s) => s.getLimit);

  // Derived: isPro = any paid tier (not explorer)
  const isPro = currentTier !== "explorer";
  const tierInfo = TIERS[currentTier];

  // Check subscription on mount
  useEffect(() => {
    checkAndUpdateTier();
  }, []);

  const remainingAgeRaw = getRemainingUses("age_my_deer");
  const remainingScoreRaw = getRemainingUses("score_my_rack");
  const remainingAge = remainingAgeRaw === "unlimited" ? Infinity : remainingAgeRaw;
  const remainingScore = remainingScoreRaw === "unlimited" ? Infinity : remainingScoreRaw;

  const ageLimitRaw = getLimit("age_my_deer");
  const scoreLimitRaw = getLimit("score_my_rack");
  const ageLimit = ageLimitRaw === "unlimited" ? Infinity : ageLimitRaw;
  const scoreLimit = scoreLimitRaw === "unlimited" ? Infinity : scoreLimitRaw;

  const [minimumAge, setMinimumAge] = useState(propertyRules.minimumShooterAge.toString());
  const [savedFeedback, setSavedFeedback] = useState(false);

  const handleSave = () => {
    const ageValue = parseFloat(minimumAge);
    if (!isNaN(ageValue) && ageValue >= 1.5 && ageValue <= 10) {
      setPropertyRules({ minimumShooterAge: ageValue });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    }
  };

  const presetAges = [
    { label: "1.5 years (Young)", value: 1.5 },
    { label: "2.5 years (Immature)", value: 2.5 },
    { label: "3.5 years (Mature)", value: 3.5 },
    { label: "4.5 years (Prime)", value: 4.5 },
    { label: "5.5+ years (Trophy)", value: 5.5 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-6 py-4" style={{ borderBottomWidth: 1, borderBottomColor: "#3D4A2F" }}>
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => navigation.goBack()} className="w-10 h-10 items-center justify-center">
            <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
          </Pressable>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold" style={{ color: "#F5F5DC" }}>
              Settings
            </Text>
            <Text className="text-xs mt-0.5" style={{ color: "#D4AF37" }}>
              Property Rules
            </Text>
          </View>
          <View className="w-10" />
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="px-6 py-6">
          {/* Subscription Status Section */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: isPro ? "#166534" : "#3D4A2F", borderWidth: isPro ? 2 : 0, borderColor: "#D4AF37" }}>
            <View className="flex-row items-center mb-4">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mr-4"
                style={{ backgroundColor: isPro ? "#D4AF37" : "#5A6447" }}
              >
                <Ionicons
                  name={isPro ? "trophy" : "compass-outline"}
                  size={24}
                  color={isPro ? "#1a1f16" : "#D4AF37"}
                />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-xl font-bold text-white">
                    {tierInfo.displayName}
                  </Text>
                  {isPro && (
                    <View className="ml-2 px-2 py-1 rounded-lg" style={{ backgroundColor: "#D4AF37" }}>
                      <Text className="text-xs font-bold" style={{ color: "#1a1f16" }}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text className="text-sm mt-1" style={{ color: isPro ? "#bbf7d0" : "#E5D4B8" }}>
                  {tierInfo.identityDescription}
                </Text>
              </View>
            </View>

            {/* Usage meters - show for all tiers */}
            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm" style={{ color: "#E5D4B8" }}>Age My Deer</Text>
                <Text className="text-sm font-semibold" style={{ color: remainingAge > 0 || ageLimit === Infinity ? "#22c55e" : "#ef4444" }}>
                  {ageLimit === Infinity ? "Unlimited" : `${remainingAge} of ${ageLimit} ${tierInfo.isFreeTier ? "total" : "/month"}`}
                </Text>
              </View>
              {ageLimit !== Infinity && (
                <View className="h-2 rounded-full" style={{ backgroundColor: "#5A6447" }}>
                  <View
                    className="h-2 rounded-full"
                    style={{
                      backgroundColor: remainingAge > 0 ? "#22c55e" : "#ef4444",
                      width: `${Math.min(100, (remainingAge / ageLimit) * 100)}%`,
                    }}
                  />
                </View>
              )}
            </View>

            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm" style={{ color: "#E5D4B8" }}>Score My Rack</Text>
                <Text className="text-sm font-semibold" style={{ color: scoreLimit === 0 ? "#8B7355" : (remainingScore > 0 || scoreLimit === Infinity ? "#22c55e" : "#ef4444") }}>
                  {scoreLimit === 0 ? "Trophy tier+" : scoreLimit === Infinity ? "Unlimited" : `${remainingScore} of ${scoreLimit}/month`}
                </Text>
              </View>
              {scoreLimit > 0 && scoreLimit !== Infinity && (
                <View className="h-2 rounded-full" style={{ backgroundColor: "#5A6447" }}>
                  <View
                    className="h-2 rounded-full"
                    style={{
                      backgroundColor: remainingScore > 0 ? "#22c55e" : "#ef4444",
                      width: `${Math.min(100, (remainingScore / scoreLimit) * 100)}%`,
                    }}
                  />
                </View>
              )}
            </View>

            <Text className="text-xs mb-4 text-center" style={{ color: "#8B7355" }}>
              {tierInfo.isFreeTier ? "Lifetime limits" : "Resets monthly"} • Quick Check always available
            </Text>

            {!isPro ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  // Navigate to Home tab, then to TierPaywall
                  navigation.navigate("Home", { screen: "TierPaywall", params: { reason: "upgrade" } });
                }}
                className="rounded-xl py-4 items-center"
                style={{ backgroundColor: "#D4AF37" }}
              >
                <View className="flex-row items-center">
                  <Ionicons name="arrow-up-circle" size={18} color="#1a1f16" />
                  <Text className="text-lg font-bold ml-2" style={{ color: "#1a1f16" }}>
                    View Plans
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  // Navigate to Home tab, then to TierPaywall
                  navigation.navigate("Home", { screen: "TierPaywall", params: { reason: "manage" } });
                }}
                className="rounded-xl py-3 items-center"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <Text className="text-sm font-semibold" style={{ color: "#bbf7d0" }}>
                  Manage Subscription
                </Text>
              </Pressable>
            )}
          </View>

          {/* Property Rules Section */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <Text className="text-lg font-bold text-white mb-4">Property Management Goals</Text>

            {/* Minimum Shooter Age */}
            <View className="mb-6">
              <Text className="text-sm font-semibold mb-2" style={{ color: "#D4AF37" }}>
                MINIMUM SHOOTER AGE
              </Text>
              <Text className="text-sm mb-4" style={{ color: "#E5D4B8" }}>
                Set the minimum age threshold for harvest decisions. Bucks below this age will be
                marked as &quot;LET WALK&quot; to encourage population management.
              </Text>

              {/* Quick Presets */}
              <View className="mb-4">
                <Text className="text-xs font-semibold mb-2" style={{ color: "#D4AF37" }}>
                  QUICK PRESETS
                </Text>
                {presetAges.map((preset) => (
                  <Pressable
                    key={preset.value}
                    onPress={() => {
                      setMinimumAge(preset.value.toString());
                      setPropertyRules({ minimumShooterAge: preset.value });
                      setSavedFeedback(true);
                      setTimeout(() => setSavedFeedback(false), 2000);
                    }}
                    className="flex-row items-center justify-between p-3 mb-2 rounded-lg"
                    style={{
                      backgroundColor:
                        propertyRules.minimumShooterAge === preset.value ? "#D4AF37" : "#5A6447",
                    }}
                  >
                    <Text
                      className="font-semibold"
                      style={{
                        color:
                          propertyRules.minimumShooterAge === preset.value ? "#2B3420" : "#F5F5DC",
                      }}
                    >
                      {preset.label}
                    </Text>
                    {propertyRules.minimumShooterAge === preset.value && (
                      <Ionicons name="checkmark-circle" size={20} color="#2B3420" />
                    )}
                  </Pressable>
                ))}
              </View>

              {/* Custom Input */}
              <View>
                <Text className="text-xs font-semibold mb-2" style={{ color: "#D4AF37" }}>
                  CUSTOM VALUE (1.5 - 10 years)
                </Text>
                <View className="flex-row items-center">
                  <TextInput
                    value={minimumAge}
                    onChangeText={setMinimumAge}
                    keyboardType="decimal-pad"
                    placeholder="3.5"
                    placeholderTextColor="#8B7355"
                    className="flex-1 rounded-lg p-4 mr-3"
                    style={{ backgroundColor: "#5A6447", color: "#F5F5DC" }}
                  />
                  <Pressable
                    onPress={handleSave}
                    className="rounded-lg px-6 py-4"
                    style={{ backgroundColor: "#D4AF37" }}
                  >
                    <Text className="font-bold" style={{ color: "#2B3420" }}>
                      Save
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Saved Feedback */}
              {savedFeedback && (
                <View className="flex-row items-center mt-3 p-3 rounded-lg" style={{ backgroundColor: "#22c55e" }}>
                  <Ionicons name="checkmark-circle" size={20} color="white" />
                  <Text className="text-white font-semibold ml-2">Saved!</Text>
                </View>
              )}
            </View>

            {/* Current Setting Display */}
            <View className="rounded-lg p-4" style={{ backgroundColor: "#5A6447" }}>
              <Text className="text-sm font-semibold mb-1" style={{ color: "#D4AF37" }}>
                CURRENT RULE
              </Text>
              <Text className="text-white text-base">
                Minimum Shooter Age: {propertyRules.minimumShooterAge} years
              </Text>
              <Text className="text-sm mt-2" style={{ color: "#E5D4B8" }}>
                Deer estimated below this age will be marked as &quot;LET WALK&quot; in the Age My Deer analysis.
              </Text>
            </View>
          </View>

          {/* Species Selection (Future) */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <Text className="text-lg font-bold text-white mb-4">Species</Text>

            <View className="flex-row items-center justify-between p-4 rounded-lg" style={{ backgroundColor: "#5A6447" }}>
              <View className="flex-row items-center flex-1">
                <Ionicons name="leaf" size={20} color="#D4AF37" />
                <Text className="text-white font-semibold ml-2">Whitetail Deer</Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
            </View>

            <View className="mt-4 p-4 rounded-lg" style={{ backgroundColor: "#5A6447" }}>
              <Text className="text-xs" style={{ color: "#E5D4B8" }}>
                Additional species (Mule Deer, Elk) coming soon. The age estimation model is currently
                optimized for North American Whitetail Deer.
              </Text>
            </View>
          </View>

          {/* Distance Capture Settings */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <View className="flex-row items-center mb-4">
              <Ionicons name="locate" size={24} color="#D4AF37" />
              <Text className="text-lg font-bold text-white ml-2">Distance Capture</Text>
            </View>

            <Text className="text-sm mb-4" style={{ color: "#E5D4B8" }}>
              Distance to the deer affects perceived scale and measurement accuracy. Providing distance
              improves confidence in age and rack estimates.
            </Text>

            {/* Prompt on Every Analysis Toggle */}
            <View className="flex-row items-center justify-between p-4 mb-3 rounded-lg" style={{ backgroundColor: "#5A6447" }}>
              <View className="flex-1 mr-4">
                <Text className="text-white font-semibold">Prompt for distance</Text>
                <Text className="text-xs mt-1" style={{ color: "#8B7355" }}>
                  Ask for distance on every analysis
                </Text>
              </View>
              <Switch
                value={distanceSettings.promptOnEveryAnalysis}
                onValueChange={(value) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateDistanceSettings({ promptOnEveryAnalysis: value });
                }}
                trackColor={{ false: "#3D4A2F", true: "#22c55e" }}
                thumbColor={distanceSettings.promptOnEveryAnalysis ? "#fff" : "#8B7355"}
              />
            </View>

            {/* Remember Last Distance Toggle */}
            <View className="flex-row items-center justify-between p-4 mb-3 rounded-lg" style={{ backgroundColor: "#5A6447" }}>
              <View className="flex-1 mr-4">
                <Text className="text-white font-semibold">Remember last distance</Text>
                <Text className="text-xs mt-1" style={{ color: "#8B7355" }}>
                  Suggest previous distance for 15 minutes
                </Text>
              </View>
              <Switch
                value={distanceSettings.rememberLastDistanceMinutes > 0}
                onValueChange={(value) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateDistanceSettings({ rememberLastDistanceMinutes: value ? 15 : 0 });
                }}
                trackColor={{ false: "#3D4A2F", true: "#22c55e" }}
                thumbColor={distanceSettings.rememberLastDistanceMinutes > 0 ? "#fff" : "#8B7355"}
              />
            </View>

            {/* Bluetooth Rangefinder (Phase 2 - Coming Soon) */}
            <Pressable
              className="flex-row items-center justify-between p-4 mb-3 rounded-lg"
              style={{ backgroundColor: "#5A6447", opacity: 0.6 }}
              disabled={true}
            >
              <View className="flex-row items-center flex-1">
                <Ionicons name="bluetooth" size={20} color="#3b82f6" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">Connect Rangefinder</Text>
                  <Text className="text-xs mt-1" style={{ color: "#8B7355" }}>
                    Bluetooth rangefinder integration
                  </Text>
                </View>
              </View>
              <View className="px-2 py-1 rounded" style={{ backgroundColor: "#3b82f620" }}>
                <Text className="text-xs font-semibold" style={{ color: "#3b82f6" }}>
                  Coming Soon
                </Text>
              </View>
            </Pressable>

            {/* Distance Usage Stats */}
            {telemetryStats.totalAnalyses > 0 && (
              <View className="p-4 rounded-lg mt-2" style={{ backgroundColor: "#2B3420" }}>
                <Text className="text-xs font-semibold mb-2" style={{ color: "#D4AF37" }}>
                  YOUR DISTANCE USAGE
                </Text>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-xs" style={{ color: "#8B7355" }}>
                    Analyses with distance:
                  </Text>
                  <Text className="text-xs font-semibold" style={{ color: "#E5D4B8" }}>
                    {telemetryStats.percentWithDistance.toFixed(0)}%
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs" style={{ color: "#8B7355" }}>
                    Ranged vs. estimated:
                  </Text>
                  <Text className="text-xs font-semibold" style={{ color: "#E5D4B8" }}>
                    {telemetryStats.rangedVsEstimated.ranged} / {telemetryStats.rangedVsEstimated.estimated}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* About / Help */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <Text className="text-lg font-bold text-white mb-4">About Age Estimation</Text>

            <Text className="text-sm leading-6 mb-4" style={{ color: "#E5D4B8" }}>
              The &quot;Age My Deer&quot; feature uses advanced computer vision to analyze body characteristics
              like neck thickness, chest depth, backline, and leg proportions. These visual cues are
              compared against expert criteria from wildlife biologists and experienced hunters.
            </Text>

            <Text className="text-sm leading-6 mb-4" style={{ color: "#E5D4B8" }}>
              Age estimates are guidelines to support ethical hunting decisions. Always defer to:
            </Text>

            <View className="ml-4 mb-4">
              <Text className="text-sm mb-1" style={{ color: "#E5D4B8" }}>
                • Local wildlife regulations
              </Text>
              <Text className="text-sm mb-1" style={{ color: "#E5D4B8" }}>
                • Landowner and MLDP requirements
              </Text>
              <Text className="text-sm mb-1" style={{ color: "#E5D4B8" }}>
                • Your property management goals
              </Text>
              <Text className="text-sm" style={{ color: "#E5D4B8" }}>
                • Personal hunting ethics
              </Text>
            </View>

            <View className="rounded-lg p-4" style={{ backgroundColor: "#5A6447" }}>
              <View className="flex-row items-start">
                <Ionicons name="information-circle" size={20} color="#D4AF37" />
                <Text className="text-xs flex-1 ml-2" style={{ color: "#E5D4B8" }}>
                  For best accuracy, capture broadside photos in good lighting with minimal brush
                  occlusion. The AI confidence score indicates reliability of the estimate.
                </Text>
              </View>
            </View>
          </View>

          {/* Send Feedback */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const subject = encodeURIComponent("DeerAge Feedback");
              const body = encodeURIComponent("\n\n---\nApp Version: 1.0\nPlatform: " + Platform.OS);
              Linking.openURL(`mailto:treyrea@gmail.com?subject=${subject}&body=${body}`);
            }}
            className="rounded-2xl p-4 mb-6 flex-row items-center"
            style={{ backgroundColor: "#3D4A2F" }}
          >
            <Ionicons name="mail-outline" size={22} color="#D4AF37" />
            <Text className="text-white font-semibold ml-3 flex-1">Send Feedback</Text>
            <Ionicons name="chevron-forward" size={18} color="#8B7355" />
          </Pressable>

          {/* Footer */}
          <Text className="text-center text-xs mb-6" style={{ color: "#8B7355" }}>
            DeerAge v1.0{"\n"}
            Powered by RackScore™ AI
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};
