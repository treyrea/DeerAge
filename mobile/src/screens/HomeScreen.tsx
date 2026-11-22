/**
 * Home Screen - Mode selection for DeerAge
 * Constitution-compliant: Clean, confident, value-first
 *
 * CONSTITUTION RULES ENFORCED:
 * - Users experience value BEFORE encountering limits
 * - No scarcity messaging on entry points
 * - Limits revealed after success, framed as progression
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
import { useSubscriptionStore } from "../state/subscriptionStore";
import { useHunterProfile } from "../state/hunterProfile";
import { DeerMark } from "../components/DeerMark";
import { UpdateAvailableBanner } from "../components/UpdateAvailableBanner";
import { FeedHomeCard } from "../components/FeedHomeCard";
import { E2ePanel } from "../e2e/E2ePanel";
import { LegacyPlanCard } from "../components/LegacyPlanCard";
import { WinBackPrompt } from "../components/WinBackPrompt";
import { HomeBannerStack, useBannerShown, useHomeBanner } from "../components/HomeBannerStack";
import { useRemoteConfig } from "../state/remoteConfig";
import { pendingHarvestCount, useHarvestStore } from "../state/harvestStore";
import { softPulse } from "../lib/haptics";
import { HOME_BANNER_PRIORITY } from "../lib/home-banners";
import { BUTTON_BROWN, BUTTON_BROWN_DEEP, CREAM, GOLD, GOLD_DEEP, INK, SECONDARY } from "../theme/contrast";

const RackRulerIcon = require("../../assets/image-1765760310.png");

type NavigationProp = NativeStackNavigationProp<any>;

function SeasonalBanner() {
  const text = useRemoteConfig((s) => s.copy.seasonalBanner);
  const wants = Boolean(text);
  useHomeBanner("seasonal", HOME_BANNER_PRIORITY.seasonal, wants);
  const shown = useBannerShown("seasonal");
  if (!text || !shown) return null;
  return (
    <View style={{ backgroundColor: "#3D4A2F", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: GOLD }}>
      <Text style={{ color: GOLD, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

function HarvestBanner() {
  const navigation = useNavigation<NavigationProp>();
  const harvestOn = useRemoteConfig((s) => s.flags.harvestCheck);
  const harvests = useHarvestStore((s) => s.entries);
  const waiting = harvestOn ? pendingHarvestCount(harvests) : 0;
  useHomeBanner("harvest", HOME_BANNER_PRIORITY.harvest, waiting > 0);
  const shown = useBannerShown("harvest");
  if (waiting <= 0 || !shown) return null;
  return (
    <Pressable
      onPress={() => navigation.navigate("History")}
      style={{ backgroundColor: "#3D4A2F", borderRadius: 14, padding: 14, marginBottom: 16 }}
    >
      <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>Add a jawbone age</Text>
      <Text style={{ color: CREAM, marginTop: 4 }}>
        {waiting === 1 ? "One harvest is waiting for a confirmed age." : `${waiting} harvests are waiting for a confirmed age.`}
      </Text>
    </Pressable>
  );
}

export const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);

  const canStartAnalysis = useSubscriptionStore((s) => s.canStartAnalysis);
  const onboardingDone = useHunterProfile((s) => s.completed);
  const profileHydrated = useHunterProfile((s) => s.hydrated);
  const homeTips = useRemoteConfig((s) => s.copy.homeTips);

  useEffect(() => {
    if (profileHydrated && !onboardingDone) {
      navigation.replace("Onboarding");
    }
  }, [profileHydrated, onboardingDone, navigation]);

  const handleModeSelect = (mode: "age" | "score") => {
    softPulse();
    setAnalysisMode(mode);
    navigation.navigate("ModeSelect", { mode });
  };

  const openQuickCheck = () => {
    softPulse();
    if (!canStartAnalysis()) {
      navigation.navigate("TierPaywall", { reason: "free_limit" });
      return;
    }
    navigation.navigate("QuickCheckCamera");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      <WinBackPrompt />
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        <View className="px-6 py-8">
          <E2ePanel />
          <HomeBannerStack>
            <UpdateAvailableBanner />
            <HarvestBanner />
            <SeasonalBanner />
            <LegacyPlanCard />
            <FeedHomeCard />
          </HomeBannerStack>

          <View className="items-center mb-10">
            <Image
              source={require("../../assets/image-1766641643.png")}
              style={{ width: 80, height: 80, borderRadius: 16, marginBottom: 16 }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <Text className="text-3xl font-bold" style={{ color: "#F5F5DC" }}>DeerAge</Text>
            <Text className="text-base mt-1" style={{ color: CREAM }}>
              Know before you pull the trigger
            </Text>
            {homeTips[0] ? (
              <Text style={{ color: SECONDARY, fontSize: 13, marginTop: 8, textAlign: "center" }}>{homeTips[0]}</Text>
            ) : null}
          </View>

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
                <DeerMark size={44} />
              </View>
              <View className="flex-1">
                <Text className="text-white text-lg font-bold">Age My Deer</Text>
                <Text className="text-sm" style={{ color: CREAM }}>
                  Estimate maturity from body shape
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={CREAM} />
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => handleModeSelect("score")}
            className="mb-6"
          >
            <LinearGradient
              colors={[BUTTON_BROWN, BUTTON_BROWN_DEEP]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 16,
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: GOLD,
              }}
            >
              <View
                className="w-14 h-14 rounded-xl items-center justify-center mr-4 overflow-hidden"
                style={{ backgroundColor: "#1a2e1a" }}
              >
                <Image
                  source={RackRulerIcon}
                  style={{ width: 44, height: 44 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold" style={{ color: CREAM }}>Score My Rack</Text>
                <Text className="text-sm" style={{ color: CREAM }}>
                  B&C scoring estimate
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={CREAM} />
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => {
              softPulse();
              navigation.navigate("OfflineAgeGuide");
            }}
          >
            <View
              className="rounded-xl p-4 flex-row items-center"
              style={{
                backgroundColor: "#3D4A2F",
                borderWidth: 1,
                borderColor: "#5A6447",
              }}
            >
              <Ionicons name="book-outline" size={22} color={GOLD} />
              <View className="flex-1 ml-3">
                <Text className="text-white font-semibold">Offline Aging Guide</Text>
                <Text className="text-xs mt-0.5" style={{ color: CREAM }}>
                  For when you have no signal
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={SECONDARY} />
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quick Check" onPress={openQuickCheck}>
          <LinearGradient
            colors={[GOLD, GOLD_DEEP]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 16,
              padding: 16,
              minHeight: 72,
              justifyContent: "center",
              borderWidth: 2,
              borderColor: GOLD_DEEP,
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <View className="flex-row items-center mb-1">
                  <Ionicons name="flash" size={22} color={INK} />
                  <Text style={{ color: INK, fontSize: 20, fontWeight: "900", marginLeft: 8 }}>QUICK CHECK</Text>
                </View>
                <Text style={{ color: INK, fontSize: 14 }}>Instant SHOOTER / LET WALK</Text>
              </View>
              <Ionicons name="camera" size={26} color={INK} />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
};
