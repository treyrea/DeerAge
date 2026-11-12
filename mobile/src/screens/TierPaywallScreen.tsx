/**
 * Tier Paywall Screen (Constitution-Compliant)
 * =============================================
 *
 * CONSTITUTION RULES ENFORCED:
 * - Identity-based upgrade framing (NOT transactional)
 * - Soft scarcity language only
 * - No panic-driven urgency
 * - Value proposition first, price second
 * - No prohibited copy (tokens, blocked, denied, etc.)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp, CommonActions } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isRevenueCatEnabled,
  addCustomerInfoUpdateListener,
} from "../lib/revenuecatClient";
import { useSubscriptionStore } from "../state/subscriptionStoreV2";
import {
  TIERS,
  TIER_ORDER,
  type TierId,
  type FeatureType,
  APPROVED_COPY,
  formatLimitDisplay,
} from "../lib/CONSTITUTION";
import type { PurchasesPackage } from "react-native-purchases";

type NavigationProp = NativeStackNavigationProp<any>;

type PaywallRouteParams = {
  TierPaywall: {
    reason?: "quick_check_limit" | "age_limit" | "score_limit" | "upgrade" | "score_locked";
    feature?: FeatureType;
    recommendedTier?: TierId;
  };
};

interface TierPackage {
  tierId: TierId;
  name: string;
  price: string;
  priceNumeric: number;
  features: string[];
  identityMessage: string;
  isRecommended: boolean;
  package: PurchasesPackage | null;
}

// Color scheme for each tier
const TIER_COLORS: Record<TierId, { primary: string; secondary: string; border: string }> = {
  explorer: { primary: "#4A5339", secondary: "#3D4A2F", border: "#5A6447" },
  scout: { primary: "#5A6447", secondary: "#4A5339", border: "#8B7355" },
  hunter: { primary: "#6B5A45", secondary: "#5A4A38", border: "#D4AF37" },
  trophy: { primary: "#8B7355", secondary: "#6B5A45", border: "#D4AF37" },
  outfitter: { primary: "#D4AF37", secondary: "#B8963A", border: "#FFD700" },
};

export const TierPaywallScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<PaywallRouteParams, "TierPaywall">>();
  const insets = useSafeAreaInsets();

  const reason = route.params?.reason || "upgrade";
  const recommendedTierId = route.params?.recommendedTier || "scout";
  const feature = route.params?.feature;

  const checkAndUpdateTier = useSubscriptionStore((s) => s.checkAndUpdateTier);
  const currentTier = useSubscriptionStore((s) => s.currentTier);
  const markPaywallSeen = useSubscriptionStore((s) => s.markPaywallSeen);

  const [packages, setPackages] = useState<TierPackage[]>([]);
  const [selectedTier, setSelectedTier] = useState<TierId>(recommendedTierId);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safe navigation back - handles case when there's no screen to go back to
  const safeGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // If we can't go back, navigate to home
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "HomeMain" }],
        })
      );
    }
  }, [navigation]);

  useEffect(() => {
    loadOfferings();
    markPaywallSeen(reason);

    // Listen for customer info updates (purchase completion, restore, etc.)
    const unsubscribe = addCustomerInfoUpdateListener(async (customerInfo) => {
      console.log("[TierPaywall] Customer info updated, checking tier...");
      const activeEntitlements = customerInfo.entitlements.active;

      // Check if user now has a paid entitlement
      if (
        activeEntitlements["outfitter"] ||
        activeEntitlements["trophy"] ||
        activeEntitlements["pro"] ||
        activeEntitlements["hunter"] ||
        activeEntitlements["scout"]
      ) {
        console.log("[TierPaywall] Paid entitlement detected, updating tier and closing...");
        await checkAndUpdateTier();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeGoBack();
      }
    });

    return () => unsubscribe();
  }, [safeGoBack, checkAndUpdateTier, markPaywallSeen, reason]);

  const loadOfferings = async () => {
    setIsLoading(true);
    setError(null);

    // Build tier packages
    const tierPackages: TierPackage[] = [];

    if (!isRevenueCatEnabled()) {
      // Demo mode - show all tiers without real packages
      for (const tierId of TIER_ORDER) {
        if (tierId === "explorer") continue; // Skip free tier

        const tier = TIERS[tierId];
        tierPackages.push({
          tierId,
          name: tier.displayName,
          price: `$${tier.priceMonthly}`,
          priceNumeric: tier.priceMonthly,
          features: getTierFeatures(tierId),
          identityMessage: tier.identityDescription,
          isRecommended: tierId === recommendedTierId,
          package: null,
        });
      }
      setPackages(tierPackages);
      setIsLoading(false);
      return;
    }

    const result = await getOfferings();

    if (result.ok && result.data.current) {
      const availablePackages = result.data.current.availablePackages;

      // Map packages to tiers
      const packageMap: Record<string, PurchasesPackage> = {};
      for (const pkg of availablePackages) {
        packageMap[pkg.identifier] = pkg;
      }

      for (const tierId of TIER_ORDER) {
        if (tierId === "explorer") continue;

        const tier = TIERS[tierId];
        const pkg = packageMap[`$rc_custom_${tierId}`];

        tierPackages.push({
          tierId,
          name: tier.displayName,
          price: pkg?.product.priceString || `$${tier.priceMonthly}`,
          priceNumeric: tier.priceMonthly,
          features: getTierFeatures(tierId),
          identityMessage: tier.identityDescription,
          isRecommended: tierId === recommendedTierId,
          package: pkg || null,
        });
      }

      setPackages(tierPackages);
    } else {
      setError("Unable to load options. Please check your connection and try again.");
    }

    setIsLoading(false);
  };

  const getTierFeatures = (tierId: TierId): string[] => {
    const tier = TIERS[tierId];
    const features: string[] = [];

    // Quick Check
    if (tier.limits.quickCheck === "unlimited") {
      features.push("Unlimited Quick Checks");
    } else {
      features.push(`${tier.limits.quickCheck} Quick Checks/mo`);
    }

    // Age My Deer
    features.push(`${tier.limits.ageMyDeer} Age Analyses/mo`);

    // Score My Rack
    if (tier.limits.scoreMyRack > 0) {
      features.push(`${tier.limits.scoreMyRack} B&C Scores/mo`);
    }

    return features;
  };

  const getReasonDisplay = (): { title: string; subtitle: string } => {
    switch (reason) {
      case "quick_check_limit":
        return {
          title: "You have explored Quick Check",
          subtitle: APPROVED_COPY.limitReached.progression,
        };
      case "age_limit":
        return {
          title: "Ready to analyze more deer?",
          subtitle: APPROVED_COPY.limitReached.momentum,
        };
      case "score_limit":
        return {
          title: "Ready for more B&C scoring?",
          subtitle: APPROVED_COPY.limitReached.monthly,
        };
      case "score_locked":
        return {
          title: "Unlock Trophy-Class Analysis",
          subtitle: "B&C scoring is available at Trophy tier and above",
        };
      default:
        return {
          title: "Level Up Your Hunting",
          subtitle: "Choose the tier that matches your commitment",
        };
    }
  };

  const handlePurchase = async () => {
    const selected = packages.find((p) => p.tierId === selectedTier);
    if (!selected) return;

    if (!selected.package) {
      // Demo mode
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      useSubscriptionStore.getState().setTier(selectedTier);
      safeGoBack();
      return;
    }

    setIsPurchasing(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await purchasePackage(selected.package);

    if (result.ok) {
      const newTier = await checkAndUpdateTier();
      if (newTier !== "explorer") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeGoBack();
      }
    } else {
      if (result.reason === "sdk_error") {
        const errorMessage = String(result.error || "");
        if (!errorMessage.includes("cancelled") && !errorMessage.includes("canceled")) {
          setError("Something went wrong. Please try again.");
        }
      }
    }

    setIsPurchasing(false);
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await restorePurchases();

    if (result.ok) {
      const newTier = await checkAndUpdateTier();
      if (newTier !== "explorer") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeGoBack();
      } else {
        setError("No active subscription found. Try restoring your purchases.");
      }
    } else {
      setError("Could not restore purchases. Please check your connection and try again.");
    }

    setIsRestoring(false);
  };

  const reasonDisplay = getReasonDisplay();

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1f16" }}>
      <LinearGradient
        colors={["#2B3420", "#1a1f16"]}
        style={{ flex: 1, paddingTop: insets.top }}
      >
        {/* Header */}
        <View className="px-6 py-4 flex-row items-center justify-between">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              safeGoBack();
            }}
            className="w-10 h-10 items-center justify-center"
          >
            <Ionicons name="close" size={28} color="#F5F5DC" />
          </Pressable>
          <Pressable
            onPress={handleRestore}
            disabled={isRestoring}
            className="px-4 py-2"
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#D4AF37" />
            ) : (
              <Text className="text-sm font-semibold" style={{ color: "#D4AF37" }}>
                Restore
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Hero Section - Identity-based framing */}
          <View className="items-center px-6 pt-2 pb-6">
            <Image
              source={require("../../assets/image-1766640714.png")}
              className="w-20 h-20 rounded-2xl mb-4"
              resizeMode="cover"
            />
            <Text
              className="text-2xl font-bold text-center mb-2"
              style={{ color: "#F5F5DC" }}
            >
              {reasonDisplay.title}
            </Text>
            <Text
              className="text-base text-center"
              style={{ color: "#E5D4B8" }}
            >
              {reasonDisplay.subtitle}
            </Text>
          </View>

          {/* Tier Selection */}
          {isLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color="#D4AF37" />
            </View>
          ) : (
            <View className="px-4 mb-6">
              {packages.map((pkg) => (
                <TierCard
                  key={pkg.tierId}
                  tierPackage={pkg}
                  isSelected={selectedTier === pkg.tierId}
                  onSelect={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedTier(pkg.tierId);
                  }}
                  currentTier={currentTier}
                />
              ))}
            </View>
          )}

          {/* Error Message */}
          {error && (
            <View className="px-6 mb-4">
              <View className="rounded-lg p-3" style={{ backgroundColor: "#7f1d1d" }}>
                <Text className="text-white text-center text-sm">{error}</Text>
              </View>
            </View>
          )}

          {/* Purchase Button */}
          <View className="px-6 mb-4">
            <Pressable
              onPress={handlePurchase}
              disabled={isPurchasing || isLoading}
              className="rounded-xl py-4 items-center"
              style={{ backgroundColor: isPurchasing ? "#8B7355" : "#D4AF37" }}
            >
              {isPurchasing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-lg font-bold" style={{ color: "#1a1f16" }}>
                  {APPROVED_COPY.upgradeFraming[selectedTier as keyof typeof APPROVED_COPY.upgradeFraming] ||
                    `Join ${TIERS[selectedTier].displayName}`}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Value proposition reminder */}
          <View className="px-6 mb-4">
            <View className="rounded-xl p-4" style={{ backgroundColor: "#2B3420" }}>
              <View className="flex-row items-center mb-2">
                <Ionicons name="shield-checkmark" size={20} color="#22c55e" />
                <Text className="text-white font-semibold ml-2">
                  Your hunting investment
                </Text>
              </View>
              <Text className="text-sm" style={{ color: "#E5D4B8" }}>
                Make better harvest decisions. Know the age and score before you pull the trigger.
              </Text>
            </View>
          </View>

          {/* Subscription Details */}
          <View className="px-6 mb-4">
            <View className="rounded-xl p-4" style={{ backgroundColor: "#2B3420" }}>
              <Text className="text-sm font-semibold mb-2" style={{ color: "#F5F5DC" }}>
                Subscription Details
              </Text>
              {packages.map((pkg) => (
                <View key={pkg.tierId} className="mb-2">
                  <Text className="text-xs" style={{ color: "#E5D4B8" }}>
                    • <Text style={{ fontWeight: "600" }}>{pkg.name}</Text>: {pkg.price}/month - Auto-renews monthly
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Auto-renewal Terms */}
          <View className="px-6 mb-4">
            <Text
              className="text-xs text-center leading-5"
              style={{ color: "#8B7355" }}
            >
              Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your App Store account settings after purchase.
            </Text>
          </View>

          {/* Redeem Code */}
          <View className="px-6 mb-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL("https://apps.apple.com/redeem");
              }}
              className="flex-row items-center justify-center py-3 rounded-xl"
              style={{ backgroundColor: "#2B3420", borderWidth: 1, borderColor: "#5A6447" }}
            >
              <Ionicons name="gift-outline" size={18} color="#D4AF37" />
              <Text className="text-sm font-semibold ml-2" style={{ color: "#D4AF37" }}>
                Redeem Code
              </Text>
            </Pressable>
          </View>

          {/* Legal Links */}
          <View className="px-6 pb-4">
            <View className="flex-row justify-center items-center">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/");
                }}
              >
                <Text className="text-xs underline" style={{ color: "#D4AF37" }}>
                  Terms of Use (EULA)
                </Text>
              </Pressable>
              <Text className="text-xs mx-3" style={{ color: "#8B7355" }}>|</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL("https://deerage.app/privacy");
                }}
              >
                <Text className="text-xs underline" style={{ color: "#D4AF37" }}>
                  Privacy Policy
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
};

// ============================================================================
// TIER CARD COMPONENT
// ============================================================================

interface TierCardProps {
  tierPackage: TierPackage;
  isSelected: boolean;
  onSelect: () => void;
  currentTier: TierId;
}

const TierCard: React.FC<TierCardProps> = ({
  tierPackage,
  isSelected,
  onSelect,
  currentTier,
}) => {
  const colors = TIER_COLORS[tierPackage.tierId];
  const tier = TIERS[tierPackage.tierId];

  // Check if this tier is an upgrade from current
  const currentTierIndex = TIER_ORDER.indexOf(currentTier);
  const thisTierIndex = TIER_ORDER.indexOf(tierPackage.tierId);
  const isUpgrade = thisTierIndex > currentTierIndex;
  const isCurrent = tierPackage.tierId === currentTier;

  return (
    <Pressable onPress={onSelect} className="mb-3">
      <View
        className="rounded-xl overflow-hidden"
        style={{
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? "#D4AF37" : colors.border,
          opacity: isCurrent ? 0.5 : 1,
        }}
      >
        {/* Header with tier name and price */}
        <LinearGradient
          colors={[colors.primary, colors.secondary]}
          style={{ padding: 16 }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              {/* Radio indicator */}
              <View
                className="w-6 h-6 rounded-full items-center justify-center mr-3"
                style={{
                  borderWidth: 2,
                  borderColor: isSelected ? "#D4AF37" : "#8B7355",
                  backgroundColor: isSelected ? "#D4AF37" : "transparent",
                }}
              >
                {isSelected && (
                  <Ionicons name="checkmark" size={14} color="#1a1f16" />
                )}
              </View>

              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-white text-lg font-bold">
                    {tierPackage.name}
                  </Text>
                  {tierPackage.isRecommended && (
                    <View
                      className="ml-2 px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#D4AF37" }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: "#1a1f16" }}
                      >
                        RECOMMENDED
                      </Text>
                    </View>
                  )}
                  {isCurrent && (
                    <View
                      className="ml-2 px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#5A6447" }}
                    >
                      <Text className="text-xs font-bold text-white">
                        CURRENT
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-sm mt-0.5" style={{ color: "#E5D4B8" }}>
                  {tier.identityDescription}
                </Text>
              </View>
            </View>

            {/* Price */}
            <View className="items-end ml-3">
              <Text className="text-white text-xl font-bold">
                {tierPackage.price}
              </Text>
              <Text className="text-xs" style={{ color: "#E5D4B8" }}>
                /month
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Features list */}
        <View className="p-4" style={{ backgroundColor: "#1a1f16" }}>
          {tierPackage.features.map((feature, index) => (
            <View key={index} className="flex-row items-center mb-2">
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={tierHasScoring(tierPackage.tierId) && feature.includes("B&C") ? "#D4AF37" : "#22c55e"}
              />
              <Text className="text-sm ml-2" style={{ color: "#F5F5DC" }}>
                {feature}
              </Text>
            </View>
          ))}

          {/* Score My Rack indicator for lower tiers */}
          {!tierHasScoring(tierPackage.tierId) && (
            <View className="flex-row items-center mt-1">
              <Ionicons name="lock-closed" size={14} color="#8B7355" />
              <Text className="text-xs ml-2" style={{ color: "#8B7355" }}>
                B&C Scoring at Trophy tier
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const tierHasScoring = (tierId: TierId): boolean => {
  return TIERS[tierId].limits.scoreMyRack > 0;
};
