/**
 * Home Screen - Mode selection for DeerAge
 * Constitution-compliant: Clean, confident, value-first
 */

import React, { useEffect } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useNetworkStore } from "../state/networkStore";
import { useSubscriptionStore } from "../state/subscriptionStoreV2";
import * as Haptics from "expo-haptics";

// Custom rack ruler icon for Score My Rack
const RackRulerIcon = require("../../assets/image-1765760310.png");

type NavigationProp = NativeStackNavigationProp<any>;

export const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);

  // Check network status
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const isOnline = isConnected && isInternetReachable !== false;

  // Subscription status (V2 - tier based)
  const currentTier = useSubscriptionStore((s) => s.currentTier);
  const checkAndUpdateTier = useSubscriptionStore((s) => s.checkAndUpdateTier);

  const isPro = currentTier !== "explorer";

  // Check subscription on mount
  useEffect(() => {
    checkAndUpdateTier();
  }, []);

  const handleModeSelect = (mode: "age" | "score") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAnalysisMode(mode);
    navigation.navigate("ModeSelect", { mode });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView>
        <View className="px-6 py-8">
          {/* Offline Alert Banner - Show prominently when no internet */}
          {!isOnline && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate("OfflineAgeGuide");
              }}
              className="mb-6"
            >
              <LinearGradient
                colors={["#dc2626", "#b91c1c"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 2,
                  borderColor: "#f87171",
                }}
              >
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-full items-center justify-center mr-4" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                    <Ionicons name="cloud-offline" size={28} color="white" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-lg font-bold">No Signal</Text>
                    <Text className="text-white/80 text-sm">Tap for Manual Field Guide</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="white" />
                </View>
              </LinearGradient>
            </Pressable>
          )}

          {/* App Title - Clean and confident */}
          <View className="items-center mb-10">
            <View className="w-20 h-20 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: "#5A6447" }}>
              <Text style={{ fontSize: 40 }}>🦌</Text>
            </View>
            <Text className="text-3xl font-bold" style={{ color: "#F5F5DC" }}>DeerAge</Text>
            <Text className="text-base mt-1" style={{ color: "#E5D4B8" }}>
              Know before you pull the trigger
            </Text>
          </View>

          {/* QUICK CHECK - Hero Button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              navigation.navigate("QuickCheckCamera");
            }}
            className="mb-4"
          >
            <LinearGradient
              colors={["#f59e0b", "#d97706"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 16,
                padding: 20,
                borderWidth: 2,
                borderColor: "#fbbf24",
              }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center mb-1">
                    <Ionicons name="flash" size={22} color="white" />
                    <Text className="text-white text-xl font-black ml-2">QUICK CHECK</Text>
                  </View>
                  <Text className="text-white/90 text-sm">
                    Instant SHOOTER / LET WALK
                  </Text>
                </View>
                <View className="bg-white/20 rounded-full p-3">
                  <Ionicons name="camera" size={24} color="white" />
                </View>
              </View>
            </LinearGradient>
          </Pressable>

          <Text className="text-white/40 text-xs text-center mb-4">— detailed analysis —</Text>

          {/* Age My Deer Button - Clean, no usage counters */}
          <Pressable
            onPress={() => handleModeSelect("age")}
            className="mb-4"
          >
            <LinearGradient
              colors={["#5A6447", "#4A5339"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 16,
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#8B7355",
              }}
            >
              <View className="w-14 h-14 rounded-xl items-center justify-center mr-4" style={{ backgroundColor: "#3D4A2F" }}>
                <Text style={{ fontSize: 28 }}>🦌</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white text-lg font-bold">Age My Deer</Text>
                <Text className="text-sm" style={{ color: "#E5D4B8" }}>
                  Estimate maturity from body shape
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#8B7355" />
            </LinearGradient>
          </Pressable>

          {/* Score My Rack Button - Clean, no usage counters */}
          <Pressable
            onPress={() => handleModeSelect("score")}
            className="mb-6"
          >
            <LinearGradient
              colors={["#8B7355", "#6B5A45"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 16,
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#D4AF37",
              }}
            >
              <View
                className="w-14 h-14 rounded-xl items-center justify-center mr-4 overflow-hidden"
                style={{ backgroundColor: "#5A4A3A" }}
              >
                <Image
                  source={RackRulerIcon}
                  style={{ width: 56, height: 56 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>
              <View className="flex-1">
                <Text className="text-white text-lg font-bold">Score My Rack</Text>
                <Text className="text-sm" style={{ color: "#E5D4B8" }}>
                  B&C scoring estimate
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#D4AF37" />
            </LinearGradient>
          </Pressable>

          {/* Field Guide - Subtle, highlighted when offline */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("OfflineAgeGuide");
            }}
          >
            <View
              className="rounded-xl p-4 flex-row items-center"
              style={{
                backgroundColor: !isOnline ? "#166534" : "#3D4A2F",
                borderWidth: 1,
                borderColor: !isOnline ? "#22c55e" : "#5A6447",
              }}
            >
              <Ionicons name="book-outline" size={22} color={!isOnline ? "#22c55e" : "#D4AF37"} />
              <Text className="text-white font-semibold ml-3 flex-1">Field Guide</Text>
              {!isOnline && (
                <View className="px-2 py-0.5 rounded-full mr-2" style={{ backgroundColor: "#22c55e" }}>
                  <Text className="text-white text-xs font-bold">OFFLINE</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color="#8B7355" />
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};
