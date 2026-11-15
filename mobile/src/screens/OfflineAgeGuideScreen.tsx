/**
 * Offline Age Estimation Guide
 * Interactive field guide for manually estimating deer age when offline
 * Based on wildlife biologist criteria and hunter experience
 */

import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNetworkStore } from "../state/networkStore";
import Animated, { useAnimatedStyle, withSpring, withTiming, FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

type NavigationProp = NativeStackNavigationProp<any>;

interface Criterion {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  scores: {
    value: number;
    label: string;
    description: string;
    ageIndication: string;
  }[];
}

const AGE_CRITERIA: Criterion[] = [
  {
    id: "neck",
    name: "Neck Thickness",
    icon: "fitness",
    description: "Most reliable indicator, especially during rut (Sept-Nov)",
    scores: [
      { value: 1, label: "Thin", description: "Neck barely wider than head", ageIndication: "1.5-2.5 yrs" },
      { value: 2, label: "Moderate", description: "Noticeable neck but distinct from shoulders", ageIndication: "2.5-3.5 yrs" },
      { value: 3, label: "Thick", description: "Swollen neck during rut, approaching shoulder width", ageIndication: "3.5-4.5 yrs" },
      { value: 4, label: "Very Thick", description: "Massive neck blending into shoulders during rut", ageIndication: "4.5-5.5 yrs" },
      { value: 5, label: "Bull Neck", description: "Extremely thick, no distinction between neck and shoulders", ageIndication: "5.5+ yrs" },
    ],
  },
  {
    id: "chest",
    name: "Chest Depth & Brisket",
    icon: "body",
    description: "Depth from backbone to bottom of chest",
    scores: [
      { value: 1, label: "Shallow", description: "Narrow chest, athletic build", ageIndication: "1.5-2.5 yrs" },
      { value: 2, label: "Moderate", description: "Developing chest, some depth", ageIndication: "2.5-3.5 yrs" },
      { value: 3, label: "Deep", description: "Full chest, pronounced brisket", ageIndication: "3.5-4.5 yrs" },
      { value: 4, label: "Very Deep", description: "Heavy chest with prominent brisket droop", ageIndication: "4.5-5.5 yrs" },
      { value: 5, label: "Barrel Chest", description: "Massive chest depth with sagging brisket", ageIndication: "5.5+ yrs" },
    ],
  },
  {
    id: "backline",
    name: "Backline Profile",
    icon: "trending-up",
    description: "Shape of the back from shoulders to hips",
    scores: [
      { value: 1, label: "Arched/Level", description: "Smooth, level or slightly arched back", ageIndication: "1.5-2.5 yrs" },
      { value: 2, label: "Mostly Level", description: "Slight dip starting to show", ageIndication: "2.5-3.5 yrs" },
      { value: 3, label: "Slight Sway", description: "Noticeable dip in back", ageIndication: "3.5-4.5 yrs" },
      { value: 4, label: "Swayed", description: "Pronounced sway back", ageIndication: "4.5-5.5 yrs" },
      { value: 5, label: "Deeply Swayed", description: "Extreme sway, weak appearance", ageIndication: "5.5+ yrs" },
    ],
  },
  {
    id: "belly",
    name: "Belly & Waist",
    icon: "ellipse",
    description: "Belly size and waist tuck",
    scores: [
      { value: 1, label: "Tucked Waist", description: "Athletic tuck, tight belly", ageIndication: "1.5-2.5 yrs" },
      { value: 2, label: "Slight Belly", description: "Losing waist tuck", ageIndication: "2.5-3.5 yrs" },
      { value: 3, label: "Moderate Belly", description: "Visible belly, little waist definition", ageIndication: "3.5-4.5 yrs" },
      { value: 4, label: "Pot Belly", description: "Pronounced belly, no waist tuck", ageIndication: "4.5-5.5 yrs" },
      { value: 5, label: "Large Pot Belly", description: "Sagging belly, barrel-shaped body", ageIndication: "5.5+ yrs" },
    ],
  },
  {
    id: "legs",
    name: "Leg Proportions",
    icon: "pause",
    description: "Leg length relative to body depth",
    scores: [
      { value: 1, label: "Long Legs", description: "Legs look too long for body (rangy)", ageIndication: "1.5-2.5 yrs" },
      { value: 2, label: "Proportionate", description: "Legs balanced with body", ageIndication: "2.5-3.5 yrs" },
      { value: 3, label: "Moderate", description: "Body depth increasing, legs look shorter", ageIndication: "3.5-4.5 yrs" },
      { value: 4, label: "Short Looking", description: "Deep body makes legs appear short", ageIndication: "4.5-5.5 yrs" },
      { value: 5, label: "Very Short", description: "Massive body, legs look stumpy", ageIndication: "5.5+ yrs" },
    ],
  },
  {
    id: "face",
    name: "Face Shape",
    icon: "happy",
    description: "Head and facial features",
    scores: [
      { value: 1, label: "Narrow/Doe-like", description: "Thin face, youthful appearance", ageIndication: "1.5-2.5 yrs" },
      { value: 2, label: "Developing", description: "Face filling out", ageIndication: "2.5-3.5 yrs" },
      { value: 3, label: "Blocky", description: "Angular features, mature look", ageIndication: "3.5-4.5 yrs" },
      { value: 4, label: "Very Blocky", description: "Heavy, masculine features", ageIndication: "4.5-5.5 yrs" },
      { value: 5, label: "Battle Scarred", description: "Thick face, often scarred, roman nose", ageIndication: "5.5+ yrs" },
    ],
  },
  {
    id: "muscle",
    name: "Muscle Definition",
    icon: "flash",
    description: "Overall muscle tone and development",
    scores: [
      { value: 1, label: "Lean", description: "Visible muscle definition, athletic", ageIndication: "1.5-2.5 yrs" },
      { value: 2, label: "Developing", description: "Building mass", ageIndication: "2.5-3.5 yrs" },
      { value: 3, label: "Muscular", description: "Well-developed, thick appearance", ageIndication: "3.5-4.5 yrs" },
      { value: 4, label: "Heavily Muscled", description: "Massive shoulders and hindquarters", ageIndication: "4.5-5.5 yrs" },
      { value: 5, label: "Past Prime", description: "Muscle definition fading, bulk remains", ageIndication: "5.5+ yrs" },
    ],
  },
];

export const OfflineAgeGuideScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const isOnline = isConnected && isInternetReachable !== false;

  const [scores, setScores] = useState<Record<string, number>>({});
  const [showResult, setShowResult] = useState(false);

  const handleScore = (criterionId: string, value: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScores((prev) => ({ ...prev, [criterionId]: value }));
  };

  const clearScore = (criterionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScores((prev) => {
      const newScores = { ...prev };
      delete newScores[criterionId];
      return newScores;
    });
  };

  const resetAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScores({});
  };

  const calculateAge = () => {
    const values = Object.values(scores);
    if (values.length === 0) return null;

    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const scoredCount = values.length;
    const totalCriteria = AGE_CRITERIA.length;

    // Calculate confidence based on number of criteria scored and consistency
    const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
    const consistency = Math.max(0, 100 - variance * 25); // Lower variance = higher confidence
    const completeness = (scoredCount / totalCriteria) * 100;
    const confidence = Math.min(100, Math.round((consistency + completeness) / 2));

    // Map average score to age band
    let ageBand = "";
    let ageYears = 0;
    let isShooter = false;
    let shooterLabel = "";
    if (average <= 1.5) {
      ageBand = "1.5-2.5 years";
      ageYears = 2.0;
      isShooter = false;
      shooterLabel = "LET HIM WALK";
    } else if (average <= 2.5) {
      ageBand = "2.5-3.5 years";
      ageYears = 3.0;
      isShooter = false;
      shooterLabel = "LET HIM WALK";
    } else if (average <= 3.5) {
      ageBand = "3.5-4.5 years";
      ageYears = 4.0;
      isShooter = true;
      shooterLabel = "SHOOTER";
    } else if (average <= 4.5) {
      ageBand = "4.5-5.5 years";
      ageYears = 5.0;
      isShooter = true;
      shooterLabel = "SHOOTER";
    } else {
      ageBand = "5.5+ years";
      ageYears = 6.0;
      isShooter = true;
      shooterLabel = "SHOOTER";
    }

    return { ageBand, ageYears, confidence, scoredCount, totalCriteria, average, isShooter, shooterLabel };
  };

  const result = calculateAge();

  const handleSaveResult = () => {
    // Could save to history here
    setShowResult(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-6 py-4 border-b" style={{ borderBottomColor: "#3D4A2F" }}>
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => navigation.goBack()} className="w-10 h-10 items-center justify-center">
            <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
          </Pressable>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold" style={{ color: "#F5F5DC" }}>
              Offline Age Guide
            </Text>
            <Text className="text-xs mt-0.5" style={{ color: "#D4AF37" }}>
              Manual Field Estimation
            </Text>
          </View>
          <View className="w-10" />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-6 py-6">
          {/* Practice Mode Indicator (when online) */}
          {isOnline && (
            <View className="bg-blue-600/20 border-2 border-blue-500 rounded-xl p-4 mb-4">
              <View className="flex-row items-center justify-center">
                <Ionicons name="school" size={20} color="#3b82f6" />
                <Text className="text-blue-300 font-bold text-base ml-2">
                  Practice Mode
                </Text>
              </View>
              <Text className="text-blue-200 text-xs text-center mt-1">
                You have internet access - Great time to practice before your hunt!
              </Text>
            </View>
          )}

          {/* Field Mode Indicator (when offline) */}
          {!isOnline && (
            <View className="bg-green-600/20 border-2 border-green-500 rounded-xl p-4 mb-4">
              <View className="flex-row items-center justify-center">
                <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                <Text className="text-green-300 font-bold text-base ml-2">
                  Field Mode - Offline
                </Text>
              </View>
              <Text className="text-green-200 text-xs text-center mt-1">
                Guide works without internet - Perfect for remote hunting areas
              </Text>
            </View>
          )}

          {/* Introduction */}
          <View className="bg-blue-600/20 border-2 border-blue-500 rounded-xl p-4 mb-6">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={24} color="#3b82f6" />
              <View className="flex-1 ml-3">
                <Text className="text-blue-300 font-bold text-base mb-2">
                  How to Use This Guide
                </Text>
                <Text className="text-blue-200 text-sm leading-5 mb-2">
                  Score each visible body characteristic on a scale of 1-5. You do not need to score all criteria - focus on what you can clearly see.
                </Text>
                <Text className="text-blue-200 text-sm leading-5">
                  <Text className="font-bold">Best during rut</Text> (Sept-Nov) when neck swelling is most pronounced.
                </Text>
              </View>
            </View>
          </View>

          {/* Criteria Cards */}
          {AGE_CRITERIA.map((criterion, index) => (
            <View
              key={criterion.id}
              className="rounded-2xl p-5 mb-4"
              style={{ backgroundColor: "#3D4A2F" }}
            >
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: "#5A6447" }}>
                  <Ionicons name={criterion.icon} size={20} color="#D4AF37" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-white font-bold text-base">{criterion.name}</Text>
                  <Text className="text-gray-400 text-xs mt-0.5">{criterion.description}</Text>
                </View>
                {scores[criterion.id] && (
                  <Pressable
                    onPress={() => clearScore(criterion.id)}
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: "#D4AF37" }}
                  >
                    <Text className="text-black font-bold text-xl">{scores[criterion.id]}</Text>
                  </Pressable>
                )}
              </View>

              {/* Score Options */}
              <View className="space-y-2">
                {criterion.scores.map((score) => (
                  <Pressable
                    key={score.value}
                    onPress={() => handleScore(criterion.id, score.value)}
                    className="rounded-lg p-3"
                    style={{
                      backgroundColor: scores[criterion.id] === score.value ? "#D4AF37" : "#5A6447",
                    }}
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <Text
                        className="font-bold text-sm"
                        style={{
                          color: scores[criterion.id] === score.value ? "#2B3420" : "#F5F5DC",
                        }}
                      >
                        {score.value}. {score.label}
                      </Text>
                      <Text
                        className="text-xs"
                        style={{
                          color: scores[criterion.id] === score.value ? "#2B3420" : "#D4AF37",
                        }}
                      >
                        {score.ageIndication}
                      </Text>
                    </View>
                    <Text
                      className="text-xs"
                      style={{
                        color: scores[criterion.id] === score.value ? "#2B3420" : "#E5D4B8",
                      }}
                    >
                      {score.description}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          {/* Tips Section */}
          <View className="rounded-2xl p-5 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <View className="flex-row items-center mb-3">
              <Ionicons name="bulb" size={24} color="#D4AF37" />
              <Text className="text-white font-bold text-lg ml-2">Pro Tips</Text>
            </View>
            <View className="space-y-2">
              <Text className="text-gray-300 text-sm leading-5 mb-2">
                • <Text className="font-bold">Neck thickness</Text> is the most reliable single indicator (especially during rut)
              </Text>
              <Text className="text-gray-300 text-sm leading-5 mb-2">
                • Young bucks (1.5-2.5 yrs) look <Text className="font-bold">rangy and athletic</Text> with long legs
              </Text>
              <Text className="text-gray-300 text-sm leading-5 mb-2">
                • Mature bucks (3.5-4.5 yrs) have <Text className="font-bold">thick necks, deep chests</Text>, and balanced proportions
              </Text>
              <Text className="text-gray-300 text-sm leading-5 mb-2">
                • Old bucks (5.5+ yrs) often show <Text className="font-bold">swayed backs, pot bellies</Text>, and massive necks
              </Text>
              <Text className="text-gray-300 text-sm leading-5">
                • Do not rely on <Text className="font-bold">antler size alone</Text> - nutrition varies greatly by region
              </Text>
            </View>
          </View>

          {/* Disclaimer */}
          <View className="rounded-xl p-4 mb-6" style={{ backgroundColor: "#5A6447" }}>
            <View className="flex-row items-start">
              <Ionicons name="alert-circle" size={20} color="#f59e0b" />
              <Text className="text-gray-300 text-xs flex-1 ml-2 leading-5">
                This is a field guide for offline use when AI analysis is unavailable. Age estimates are guidelines only. Always defer to local regulations, landowner requirements, and your property management goals.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Age Estimate Bar */}
      {result && result.scoredCount > 0 ? (
        <Animated.View
          entering={FadeIn.duration(300)}
          className="absolute bottom-0 left-0 right-0"
          style={{
            backgroundColor: result.isShooter ? "#166534" : "#92400e",
            borderTopWidth: 2,
            borderTopColor: result.isShooter ? "#22c55e" : "#f59e0b",
            paddingBottom: insets.bottom + 8,
          }}
        >
          <View className="px-4 pt-3 pb-2">
            {/* Main Result Row */}
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center flex-1">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: result.isShooter ? "#22c55e" : "#f59e0b" }}
                >
                  <Ionicons
                    name={result.isShooter ? "checkmark" : "hand-left"}
                    size={24}
                    color="white"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-xl font-bold">{result.ageBand}</Text>
                  <Text
                    className="text-xs font-bold"
                    style={{ color: result.isShooter ? "#86efac" : "#fcd34d" }}
                  >
                    {result.shooterLabel}
                  </Text>
                </View>
              </View>

              {/* Confidence Badge */}
              <View className="items-end">
                <View
                  className="px-3 py-1 rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                >
                  <Text className="text-white text-xs font-bold">
                    {result.confidence}% conf
                  </Text>
                </View>
                <Text className="text-white/70 text-xs mt-1">
                  {result.scoredCount}/{result.totalCriteria} scored
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View className="flex-row items-center">
              <View className="flex-1 h-1.5 rounded-full mr-3" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                <View
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${(result.scoredCount / result.totalCriteria) * 100}%`,
                    backgroundColor: result.isShooter ? "#22c55e" : "#f59e0b",
                  }}
                />
              </View>
              <Pressable
                onPress={resetAll}
                className="px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <Text className="text-white text-xs font-semibold">Reset</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 pt-3"
          style={{
            backgroundColor: "#1a1f16",
            borderTopWidth: 1,
            borderTopColor: "#3D4A2F",
            paddingBottom: insets.bottom + 8,
          }}
        >
          <View className="flex-row items-center justify-center py-2">
            <Ionicons name="arrow-up" size={16} color="#8B7355" />
            <Text className="text-sm ml-2" style={{ color: "#8B7355" }}>
              Score body features above to see age estimate
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};
