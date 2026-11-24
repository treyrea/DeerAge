/**
 * Settings Screen - Configure Property Rules and app preferences
 */

import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Platform, Linking, Switch } from "react-native";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { allowanceLine } from "../lib/products";
import { refreshScanCredits, restoreScanPacks } from "../api/scan-credits";
import { useFairUseAllowance } from "../hooks/useFairUseAllowance";
import { useHunterProfile } from "../state/hunterProfile";
import { CommunitySettings } from "../components/CommunitySettings";
import { HelpImproveSettings } from "../components/HelpImproveSettings";
import { loadMessages } from "../api/call-report";
import * as Haptics from "expo-haptics";
import { softPulse } from "../lib/haptics";

type NavigationProp = NativeStackNavigationProp<any>;

export const SettingsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const propertyRules = useDeerScoringStore((s) => s.propertyRules);
  const setPropertyRules = useDeerScoringStore((s) => s.setPropertyRules);

  const planLabel = useSubscriptionStore((s) => s.planLabel);
  const entitled = useSubscriptionStore((s) => s.entitled);
  const lapsed = useSubscriptionStore((s) => s.lapsed);
  const remainingFree = useSubscriptionStore((s) => s.remainingFree());
  const scanCredits = useSubscriptionStore((s) => s.scanCredits);
  const restore = useSubscriptionStore((s) => s.restore);
  const profile = useHunterProfile();
  const isPro = entitled;
  const fairUsePerDay = useFairUseAllowance();

  const [minimumAge, setMinimumAge] = useState(propertyRules.minimumShooterAge.toString());
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [managerName, setManagerName] = useState(profile.leaseManagerName);
  const [managerPhone, setManagerPhone] = useState(profile.leaseManagerPhone);
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [replyCount, setReplyCount] = useState(0);

  useFocusEffect(useCallback(() => {
    void refreshScanCredits();
    void loadMessages().then((loaded) => {
      setUnreadReplies(loaded.unread);
      setReplyCount(loaded.messages.length);
    });
  }, []));

  const handleSave = () => {
    const ageValue = parseFloat(minimumAge);
    if (!isNaN(ageValue) && ageValue >= 1.5 && ageValue <= 10) {
      setPropertyRules({ minimumShooterAge: ageValue });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    }
  };

  const presetAges = [
    { label: "1.5 years", value: 1.5 },
    { label: "2.5 years", value: 2.5 },
    { label: "3.5 years", value: 3.5 },
    { label: "4.5 years", value: 4.5 },
    { label: "5.5 years", value: 5.5 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-6 py-4" style={{ borderBottomWidth: 1, borderBottomColor: "#3D4A2F" }}>
        <View className="flex-row items-center justify-between">
          {navigation.canGoBack() ? (
            <Pressable accessibilityLabel="Back" onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
            </Pressable>
          ) : <View style={{ width: 44 }} />}
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
          {replyCount > 0 ? (
            <Pressable
              onPress={() => navigation.navigate("Messages")}
              className="rounded-2xl p-4 mb-6 flex-row items-center justify-between"
              style={{ backgroundColor: "#3D4A2F" }}
            >
              <Text className="text-base font-bold" style={{ color: "#F5F5DC" }}>Messages from DeerAge</Text>
              {unreadReplies > 0 ? (
                <View style={{ minWidth: 24, height: 24, borderRadius: 12, backgroundColor: "#D4AF37", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                  <Text style={{ color: "#1a1f16", fontWeight: "800" }}>{unreadReplies}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#D4AF37" />
              )}
            </Pressable>
          ) : null}
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
                    {planLabel}
                  </Text>
                  {isPro && (
                    <View className="ml-2 px-2 py-1 rounded-lg" style={{ backgroundColor: "#D4AF37" }}>
                      <Text className="text-xs font-bold" style={{ color: "#1a1f16" }}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text className="text-sm mt-1" style={{ color: isPro ? "#bbf7d0" : "#E5D4B8" }}>
                  {isPro
                    ? `${fairUsePerDay} analyses a day. The fair-use cap resets tomorrow.`
                    : allowanceLine(remainingFree, scanCredits)}
                </Text>
              </View>
            </View>

            <Text className="text-sm mb-1" style={{ color: "#E5D4B8" }}>
              {profile.completed ? `Home: ${profile.stateName}${profile.ecoregion ? ` · ${profile.ecoregion}` : ""}` : "Home region not set"}
            </Text>
            <Text className="text-sm mb-4" style={{ color: "#E5D4B8" }}>
              {profile.huntDay ? `Last hunt region: ${profile.huntLabel || profile.huntStateName}` : "Hunt region is confirmed on the first scan of the day."}
            </Text>

            <Pressable
              onPress={() => navigation.navigate("Home", { screen: "Onboarding", params: { edit: true } })}
              className="rounded-xl py-3 items-center mb-3"
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Text className="text-sm font-semibold" style={{ color: "#F5F5DC" }}>Edit home region</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void restore();
                void restoreScanPacks();
              }}
              className="rounded-xl py-3 items-center mb-3"
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Text className="text-sm font-semibold" style={{ color: "#D4AF37" }}>Restore purchases</Text>
            </Pressable>

            {!isPro ? (
              <Pressable
                onPress={() => {
                  softPulse();
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
            ) : null}
            {isPro || lapsed ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("ManageSubscription");
                }}
                className="rounded-xl py-3 items-center"
                style={{ backgroundColor: "rgba(255,255,255,0.15)", marginTop: isPro ? 0 : 12 }}
              >
                <Text className="text-sm font-semibold" style={{ color: "#bbf7d0" }}>
                  Manage subscription
                </Text>
              </Pressable>
            ) : null}
          </View>

          <CommunitySettings />

          {/* Property Rules Section */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <Text className="text-lg font-bold text-white mb-4">Property Management Goals</Text>

            <View className="flex-row items-center mb-5">
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text className="text-sm font-semibold" style={{ color: "#D4AF37" }}>
                  Lease rules (minimum age and pre-shot record)
                </Text>
                <Text className="text-sm mt-1" style={{ color: "#E5D4B8" }}>
                  On adds a save line after a scan, and the lease manager from that result.
                </Text>
              </View>
              <Switch
                value={profile.leaseRules}
                onValueChange={(value) => {
                  useHunterProfile.getState().setLeaseRules(value);
                }}
                trackColor={{ false: "#5A6447", true: "#7EBF93" }}
                thumbColor="#F5F5DC"
              />
            </View>

            {profile.leaseRules ? (
              <View className="mb-6">
                <Text className="text-sm font-semibold mb-2" style={{ color: "#D4AF37" }}>LEASE MANAGER</Text>
                <Text className="text-sm mb-3" style={{ color: "#E5D4B8" }}>
                  Saved on this phone only. DeerAge does not read your contacts and does not send the text.
                </Text>
                <TextInput
                  value={managerName}
                  onChangeText={setManagerName}
                  placeholder="Name"
                  placeholderTextColor="#F5F5DC"
                  className="rounded-lg p-4 mb-2"
                  style={{ backgroundColor: "#5A6447", color: "#F5F5DC" }}
                />
                <TextInput
                  value={managerPhone}
                  onChangeText={setManagerPhone}
                  placeholder="Phone number"
                  placeholderTextColor="#F5F5DC"
                  keyboardType="phone-pad"
                  className="rounded-lg p-4 mb-3"
                  style={{ backgroundColor: "#5A6447", color: "#F5F5DC" }}
                />
                <Pressable
                  onPress={() => useHunterProfile.getState().setLeaseManager(managerName, managerPhone)}
                  className="rounded-xl py-3 items-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                >
                  <Text className="text-sm font-semibold" style={{ color: "#F5F5DC" }}>Save lease manager</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Minimum Shooter Age */}
            <View className="mb-6">
              <Text className="text-sm font-semibold mb-2" style={{ color: "#D4AF37" }}>
                MINIMUM SHOOTER AGE
              </Text>
              <Text className="text-sm mb-4" style={{ color: "#E5D4B8" }}>
                This is your lease minimum. A buck read under it is LET WALK. Shooting under the lease age can mean a fine or a lost membership. A pre-shot record keeps the minimum that was set when you scanned.
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
                    placeholderTextColor="#F5F5DC"
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
                <View className="flex-row items-center mt-3 p-3 rounded-lg" style={{ backgroundColor: "#14532D" }}>
                  <Ionicons name="checkmark-circle" size={20} color="#F5F5DC" />
                  <Text className="font-semibold ml-2" style={{ color: "#F5F5DC" }}>Saved!</Text>
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
                Under this age the call is LET WALK. Quick Check, Age, and History all use this number.
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

          <HelpImproveSettings />

          {/* Send Feedback */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const subject = encodeURIComponent("DeerAge Feedback");
              const body = encodeURIComponent(`\n\n---\nApp Version: ${Constants.expoConfig?.version ?? "1.0.9"}\nPlatform: ${Platform.OS}`);
              Linking.openURL(`mailto:treyrea@gmail.com?subject=${subject}&body=${body}`);
            }}
            className="rounded-2xl p-4 mb-6 flex-row items-center"
            style={{ backgroundColor: "#3D4A2F" }}
          >
            <Ionicons name="mail-outline" size={22} color="#D4AF37" />
            <Text className="text-white font-semibold ml-3 flex-1">Send Feedback</Text>
            <Ionicons name="chevron-forward" size={18} color="#C9B48F" />
          </Pressable>

          {/* Footer */}
          <Text className="text-center text-xs mb-6" style={{ color: "#C9B48F" }}>
            DeerAge v{Constants.expoConfig?.version ?? "1.0.9"}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};
