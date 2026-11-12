/**
 * Subscription & Usage Store (Constitution-Compliant)
 * ===================================================
 *
 * Implements the DeerAge Product Constitution tier system with:
 * - 5 tiers: Explorer (free), Scout, Hunter, Trophy, Outfitter
 * - Lifetime limits for free tier
 * - Monthly limits for paid tiers
 * - Feature classification: habit, standard, obsession
 *
 * CONSTITUTION RULES ENFORCED:
 * - Perceived generosity > actual cost exposure
 * - Value delivered BEFORE limits shown
 * - No technical terms (tokens, API calls, etc.)
 * - Identity-based upgrade framing
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasEntitlement, getCustomerInfo, restorePurchases, isRevenueCatEnabled } from "../lib/revenuecatClient";
import {
  TIERS,
  TIER_ORDER,
  type TierId,
  type FeatureType,
  getLimitReachedCopy,
  getUpgradeRecommendation,
} from "../lib/CONSTITUTION";

// ============================================================================
// TYPES
// ============================================================================

interface LifetimeUsage {
  quickCheck: number;
  ageMyDeer: number;
  scoreMyRack: number;
}

interface MonthlyUsage {
  quickCheck: number;
  ageMyDeer: number;
  scoreMyRack: number;
  monthKey: string; // Format: "YYYY-MM"
}

interface UsageState {
  // Current tier
  currentTier: TierId;
  lastTierCheck: number | null;

  // Usage tracking
  lifetimeUsage: LifetimeUsage;
  monthlyUsage: MonthlyUsage;

  // Flags
  hasSeenPaywall: boolean;
  lastPaywallReason: string | null;
}

interface UsageActions {
  // Tier management
  checkAndUpdateTier: () => Promise<TierId>;
  setTier: (tier: TierId) => void;

  // Usage tracking
  recordFeatureUse: (feature: FeatureType) => void;
  resetMonthlyUsageIfNeeded: () => void;

  // Limit checking
  canUseFeature: (feature: FeatureType) => boolean;
  getRemainingUses: (feature: FeatureType) => number | "unlimited";
  getUsageCount: (feature: FeatureType) => number;
  getLimit: (feature: FeatureType) => number | "unlimited";

  // UI helpers
  shouldShowPaywall: (feature: FeatureType) => boolean;
  getPaywallContext: (feature: FeatureType) => {
    title: string;
    subtitle: string;
    cta: string;
    recommendedTier: TierId;
  };
  getUpgradeRecommendation: () => TierId | null;
  markPaywallSeen: (reason: string) => void;

  // Analytics helpers
  getUsageStats: () => {
    tier: TierId;
    lifetime: LifetimeUsage;
    monthly: MonthlyUsage;
    percentageUsed: Record<FeatureType, number>;
  };
}

type SubscriptionStore = UsageState & UsageActions;

// ============================================================================
// HELPERS
// ============================================================================

const getCurrentMonthKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getDefaultState = (): UsageState => ({
  currentTier: "explorer",
  lastTierCheck: null,
  lifetimeUsage: {
    quickCheck: 0,
    ageMyDeer: 0,
    scoreMyRack: 0,
  },
  monthlyUsage: {
    quickCheck: 0,
    ageMyDeer: 0,
    scoreMyRack: 0,
    monthKey: getCurrentMonthKey(),
  },
  hasSeenPaywall: false,
  lastPaywallReason: null,
});

// ============================================================================
// STORE
// ============================================================================

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      ...getDefaultState(),

      // ======================================================================
      // TIER MANAGEMENT
      // ======================================================================

      checkAndUpdateTier: async (): Promise<TierId> => {
        try {
          // Skip if RevenueCat is not configured
          if (!isRevenueCatEnabled()) {
            console.log("[Subscription] RevenueCat not enabled, using explorer tier");
            return "explorer";
          }

          // First, restore purchases to sync with Apple (handles promo codes, family sharing, etc.)
          console.log("[Subscription] Restoring purchases to sync with App Store...");
          const restoreResult = await restorePurchases();

          if (restoreResult.ok) {
            console.log("[Subscription] Restore successful, checking entitlements from customer info...");
            const customerInfo = restoreResult.data;
            const activeEntitlements = customerInfo.entitlements.active;

            // Check active entitlements directly from restored customer info
            if (activeEntitlements["outfitter"]) {
              set({ currentTier: "outfitter", lastTierCheck: Date.now() });
              console.log("[Subscription] Tier set to outfitter");
              return "outfitter";
            }
            if (activeEntitlements["trophy"] || activeEntitlements["pro"]) {
              set({ currentTier: "trophy", lastTierCheck: Date.now() });
              console.log("[Subscription] Tier set to trophy");
              return "trophy";
            }
            if (activeEntitlements["hunter"]) {
              set({ currentTier: "hunter", lastTierCheck: Date.now() });
              console.log("[Subscription] Tier set to hunter");
              return "hunter";
            }
            if (activeEntitlements["scout"]) {
              set({ currentTier: "scout", lastTierCheck: Date.now() });
              console.log("[Subscription] Tier set to scout");
              return "scout";
            }
          } else {
            console.log("[Subscription] Restore failed, falling back to getCustomerInfo:", restoreResult.reason);

            // Fallback: try to get customer info directly
            const customerInfoResult = await getCustomerInfo();
            if (customerInfoResult.ok) {
              const activeEntitlements = customerInfoResult.data.entitlements.active;

              if (activeEntitlements["outfitter"]) {
                set({ currentTier: "outfitter", lastTierCheck: Date.now() });
                return "outfitter";
              }
              if (activeEntitlements["trophy"] || activeEntitlements["pro"]) {
                set({ currentTier: "trophy", lastTierCheck: Date.now() });
                return "trophy";
              }
              if (activeEntitlements["hunter"]) {
                set({ currentTier: "hunter", lastTierCheck: Date.now() });
                return "hunter";
              }
              if (activeEntitlements["scout"]) {
                set({ currentTier: "scout", lastTierCheck: Date.now() });
                return "scout";
              }
            }
          }

          // No paid entitlements found
          set({ currentTier: "explorer", lastTierCheck: Date.now() });
          console.log("[Subscription] No active entitlements, using explorer tier");
          return "explorer";
        } catch (error) {
          console.log("[Subscription] Error checking tier:", error);
          return get().currentTier;
        }
      },

      setTier: (tier: TierId) => {
        set({ currentTier: tier, lastTierCheck: Date.now() });
      },

      // ======================================================================
      // USAGE TRACKING
      // ======================================================================

      resetMonthlyUsageIfNeeded: () => {
        const currentMonth = getCurrentMonthKey();
        const { monthlyUsage } = get();

        if (monthlyUsage.monthKey !== currentMonth) {
          set({
            monthlyUsage: {
              quickCheck: 0,
              ageMyDeer: 0,
              scoreMyRack: 0,
              monthKey: currentMonth,
            },
          });
          console.log("[Subscription] Monthly usage reset for", currentMonth);
        }
      },

      recordFeatureUse: (feature: FeatureType) => {
        const { currentTier, lifetimeUsage, monthlyUsage } = get();
        const tier = TIERS[currentTier];

        // Always reset monthly if needed
        get().resetMonthlyUsageIfNeeded();

        // Update appropriate usage counter
        if (tier.isFreeTier) {
          // Free tier: lifetime tracking
          const newLifetime = { ...lifetimeUsage };
          switch (feature) {
            case "quick_check":
              newLifetime.quickCheck += 1;
              break;
            case "age_my_deer":
              newLifetime.ageMyDeer += 1;
              break;
            case "score_my_rack":
              newLifetime.scoreMyRack += 1;
              break;
          }
          set({ lifetimeUsage: newLifetime });
          console.log(`[Subscription] Lifetime ${feature}: ${newLifetime[feature === "quick_check" ? "quickCheck" : feature === "age_my_deer" ? "ageMyDeer" : "scoreMyRack"]}`);
        } else {
          // Paid tier: monthly tracking
          const newMonthly = { ...get().monthlyUsage };
          switch (feature) {
            case "quick_check":
              newMonthly.quickCheck += 1;
              break;
            case "age_my_deer":
              newMonthly.ageMyDeer += 1;
              break;
            case "score_my_rack":
              newMonthly.scoreMyRack += 1;
              break;
          }
          set({ monthlyUsage: newMonthly });
          console.log(`[Subscription] Monthly ${feature}: ${newMonthly[feature === "quick_check" ? "quickCheck" : feature === "age_my_deer" ? "ageMyDeer" : "scoreMyRack"]}`);
        }
      },

      // ======================================================================
      // LIMIT CHECKING
      // ======================================================================

      getLimit: (feature: FeatureType): number | "unlimited" => {
        const { currentTier } = get();
        const tier = TIERS[currentTier];

        switch (feature) {
          case "quick_check":
            return tier.limits.quickCheck;
          case "age_my_deer":
            return tier.limits.ageMyDeer;
          case "score_my_rack":
            return tier.limits.scoreMyRack;
        }
      },

      getUsageCount: (feature: FeatureType): number => {
        const { currentTier, lifetimeUsage, monthlyUsage } = get();
        const tier = TIERS[currentTier];

        // Reset monthly if needed
        get().resetMonthlyUsageIfNeeded();

        const usage = tier.isFreeTier ? lifetimeUsage : get().monthlyUsage;

        switch (feature) {
          case "quick_check":
            return usage.quickCheck;
          case "age_my_deer":
            return usage.ageMyDeer;
          case "score_my_rack":
            return usage.scoreMyRack;
        }
      },

      getRemainingUses: (feature: FeatureType): number | "unlimited" => {
        const limit = get().getLimit(feature);

        if (limit === "unlimited") {
          return "unlimited";
        }

        const used = get().getUsageCount(feature);
        return Math.max(0, limit - used);
      },

      canUseFeature: (feature: FeatureType): boolean => {
        const remaining = get().getRemainingUses(feature);
        return remaining === "unlimited" || remaining > 0;
      },

      // ======================================================================
      // UI HELPERS
      // ======================================================================

      shouldShowPaywall: (feature: FeatureType): boolean => {
        // CONSTITUTION RULE: Never interrupt first value delivery
        // Only show paywall AFTER the action completes if limit is reached
        return !get().canUseFeature(feature);
      },

      getPaywallContext: (feature: FeatureType) => {
        const { currentTier } = get();
        const copy = getLimitReachedCopy(feature, currentTier);

        // Find recommended tier
        let recommendedTier: TierId;

        if (feature === "score_my_rack") {
          // Score My Rack requires Trophy or above
          recommendedTier = "trophy";
        } else if (feature === "age_my_deer") {
          // Age My Deer available at Scout
          recommendedTier = currentTier === "explorer" ? "scout" : "hunter";
        } else {
          // Quick Check unlimited at Scout
          recommendedTier = "scout";
        }

        return {
          ...copy,
          recommendedTier,
        };
      },

      getUpgradeRecommendation: (): TierId | null => {
        const { currentTier, lifetimeUsage, monthlyUsage } = get();
        const tier = TIERS[currentTier];

        const usage = tier.isFreeTier
          ? lifetimeUsage
          : monthlyUsage;

        return getUpgradeRecommendation(currentTier, usage);
      },

      markPaywallSeen: (reason: string) => {
        set({ hasSeenPaywall: true, lastPaywallReason: reason });
      },

      // ======================================================================
      // ANALYTICS HELPERS
      // ======================================================================

      getUsageStats: () => {
        const { currentTier, lifetimeUsage, monthlyUsage } = get();
        const tier = TIERS[currentTier];

        const usage = tier.isFreeTier ? lifetimeUsage : monthlyUsage;

        const calculatePercentage = (feature: FeatureType): number => {
          const limit = get().getLimit(feature);
          if (limit === "unlimited") return 0;
          const used = get().getUsageCount(feature);
          return Math.round((used / limit) * 100);
        };

        return {
          tier: currentTier,
          lifetime: lifetimeUsage,
          monthly: monthlyUsage,
          percentageUsed: {
            quick_check: calculatePercentage("quick_check"),
            age_my_deer: calculatePercentage("age_my_deer"),
            score_my_rack: calculatePercentage("score_my_rack"),
          },
        };
      },
    }),
    {
      name: "deerage-subscription-v2",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentTier: state.currentTier,
        lastTierCheck: state.lastTierCheck,
        lifetimeUsage: state.lifetimeUsage,
        monthlyUsage: state.monthlyUsage,
        hasSeenPaywall: state.hasSeenPaywall,
      }),
    }
  )
);

// ============================================================================
// LEGACY COMPATIBILITY EXPORTS
// ============================================================================

// These maintain backwards compatibility with existing code
export const FREE_TIER_LIMITS = {
  ageAnalysisPerMonth: TIERS.explorer.limits.ageMyDeer,
  scoreAnalysisPerMonth: TIERS.explorer.limits.scoreMyRack,
  historyLimit: 5,
  quickCheckLifetime: TIERS.explorer.limits.quickCheck as number,
};
