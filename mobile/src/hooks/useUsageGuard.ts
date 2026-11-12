/**
 * Usage Guard Hook (Constitution-Compliant)
 * ==========================================
 *
 * CONSTITUTION RULES ENFORCED:
 * - Users experience meaningful value BEFORE encountering limits
 * - Limits are revealed AFTER success, framed as progression
 * - Never interrupt a first win
 * - Soft scarcity language only
 */

import { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { useSubscriptionStore } from "../state/subscriptionStoreV2";
import type { FeatureType, TierId } from "../lib/CONSTITUTION";

type NavigationProp = NativeStackNavigationProp<any>;

interface UseUsageGuardResult {
  /**
   * Check if the user can use a feature.
   * Returns true if they have remaining uses.
   */
  canUse: (feature: FeatureType) => boolean;

  /**
   * Get remaining uses for a feature.
   * Returns "unlimited" or a number.
   */
  remaining: (feature: FeatureType) => number | "unlimited";

  /**
   * Record usage of a feature.
   * Call this AFTER the action completes successfully.
   * CONSTITUTION: Value delivered first, then track.
   */
  recordUse: (feature: FeatureType) => void;

  /**
   * Check if limit is reached and navigate to paywall if needed.
   * Returns true if blocked (should not proceed).
   * Returns false if user can proceed.
   *
   * CONSTITUTION: Only call this BEFORE expensive AI operations,
   * not before showing UI or taking photos.
   */
  guardFeature: (feature: FeatureType) => boolean;

  /**
   * Show paywall for a specific feature.
   * Use when user tries to access a feature they don't have access to.
   */
  showPaywall: (feature: FeatureType, reason: string) => void;

  /**
   * Show upgrade paywall after successful use when limit is reached.
   * CONSTITUTION: Call this AFTER value is delivered.
   */
  showUpgradeAfterSuccess: (feature: FeatureType) => void;

  /**
   * Get the current tier.
   */
  currentTier: TierId;

  /**
   * Check and update tier from RevenueCat.
   */
  refreshTier: () => Promise<TierId>;
}

export const useUsageGuard = (): UseUsageGuardResult => {
  const navigation = useNavigation<NavigationProp>();

  // Individual selectors for performance
  const currentTier = useSubscriptionStore((s) => s.currentTier);
  const canUseFeature = useSubscriptionStore((s) => s.canUseFeature);
  const getRemainingUses = useSubscriptionStore((s) => s.getRemainingUses);
  const recordFeatureUse = useSubscriptionStore((s) => s.recordFeatureUse);
  const getPaywallContext = useSubscriptionStore((s) => s.getPaywallContext);
  const checkAndUpdateTier = useSubscriptionStore((s) => s.checkAndUpdateTier);

  const canUse = useCallback(
    (feature: FeatureType): boolean => {
      return canUseFeature(feature);
    },
    [canUseFeature]
  );

  const remaining = useCallback(
    (feature: FeatureType): number | "unlimited" => {
      return getRemainingUses(feature);
    },
    [getRemainingUses]
  );

  const recordUse = useCallback(
    (feature: FeatureType): void => {
      recordFeatureUse(feature);
    },
    [recordFeatureUse]
  );

  const showPaywall = useCallback(
    (feature: FeatureType, reason: string): void => {
      const context = getPaywallContext(feature);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      navigation.navigate("TierPaywall", {
        reason,
        feature,
        recommendedTier: context.recommendedTier,
      });
    },
    [navigation, getPaywallContext]
  );

  const guardFeature = useCallback(
    (feature: FeatureType): boolean => {
      if (!canUseFeature(feature)) {
        // Determine the reason based on feature
        let reason: string;
        switch (feature) {
          case "quick_check":
            reason = "quick_check_limit";
            break;
          case "age_my_deer":
            reason = "age_limit";
            break;
          case "score_my_rack":
            // Check if it's locked (0 limit) vs used up
            const limit = getRemainingUses(feature);
            reason = limit === 0 ? "score_locked" : "score_limit";
            break;
          default:
            reason = "upgrade";
        }

        showPaywall(feature, reason);
        return true; // Blocked
      }

      return false; // Not blocked
    },
    [canUseFeature, getRemainingUses, showPaywall]
  );

  const showUpgradeAfterSuccess = useCallback(
    (feature: FeatureType): void => {
      // Only show if they just used their last one
      const remainingAfter = getRemainingUses(feature);

      if (remainingAfter === 0) {
        // They just used their last one - show upgrade opportunity
        // Use soft scarcity framing per Constitution
        setTimeout(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          let reason: string;
          switch (feature) {
            case "quick_check":
              reason = "quick_check_limit";
              break;
            case "age_my_deer":
              reason = "age_limit";
              break;
            case "score_my_rack":
              reason = "score_limit";
              break;
            default:
              reason = "upgrade";
          }

          navigation.navigate("TierPaywall", {
            reason,
            feature,
            recommendedTier: getPaywallContext(feature).recommendedTier,
          });
        }, 2000); // Delay to let user see their result first
      }
    },
    [navigation, getRemainingUses, getPaywallContext]
  );

  const refreshTier = useCallback(async (): Promise<TierId> => {
    return checkAndUpdateTier();
  }, [checkAndUpdateTier]);

  return {
    canUse,
    remaining,
    recordUse,
    guardFeature,
    showPaywall,
    showUpgradeAfterSuccess,
    currentTier,
    refreshTier,
  };
};

/**
 * Format remaining uses for display
 * Uses Constitution-compliant language
 */
export const formatRemainingUses = (
  remaining: number | "unlimited",
  isLifetime: boolean
): string => {
  if (remaining === "unlimited") {
    return "Unlimited";
  }

  if (remaining === 0) {
    return isLifetime ? "Explored" : "Resets next month";
  }

  if (isLifetime) {
    return `${remaining} remaining`;
  }

  return `${remaining} this month`;
};

/**
 * Get badge color based on remaining uses
 */
export const getUsageBadgeColor = (
  remaining: number | "unlimited",
  total: number | "unlimited"
): { bg: string; text: string } => {
  if (remaining === "unlimited") {
    return { bg: "#166534", text: "#22c55e" };
  }

  if (remaining === 0) {
    return { bg: "#7f1d1d", text: "#fca5a5" };
  }

  const percentRemaining = total === "unlimited" ? 100 : (remaining / total) * 100;

  if (percentRemaining <= 20) {
    return { bg: "#7c2d12", text: "#fdba74" }; // Orange warning
  }

  if (percentRemaining <= 50) {
    return { bg: "#854d0e", text: "#fde047" }; // Yellow
  }

  return { bg: "#166534", text: "#22c55e" }; // Green - plenty remaining
};
