/**
 * Subscription & Usage Store
 * Tracks subscription status and free tier usage limits
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasEntitlement, hasActiveSubscription } from "../lib/revenuecatClient";

// Free tier limits
export const FREE_TIER_LIMITS = {
  ageAnalysisPerMonth: 3,
  scoreAnalysisPerMonth: 1,
  historyLimit: 5,
};

interface UsageRecord {
  ageAnalysisCount: number;
  scoreAnalysisCount: number;
  lastResetDate: string; // ISO date string for the month (YYYY-MM)
}

interface SubscriptionState {
  // Subscription status
  isPro: boolean;
  lastSubscriptionCheck: number | null;

  // Usage tracking
  usage: UsageRecord;

  // Actions
  checkSubscription: () => Promise<boolean>;
  incrementAgeAnalysis: () => void;
  incrementScoreAnalysis: () => void;
  canUseAgeAnalysis: () => boolean;
  canUseScoreAnalysis: () => boolean;
  getRemainingAgeAnalyses: () => number;
  getRemainingScoreAnalyses: () => number;
  resetMonthlyUsageIfNeeded: () => void;
  setIsPro: (isPro: boolean) => void;
}

const getCurrentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      isPro: false,
      lastSubscriptionCheck: null,

      usage: {
        ageAnalysisCount: 0,
        scoreAnalysisCount: 0,
        lastResetDate: getCurrentMonth(),
      },

      checkSubscription: async () => {
        try {
          const result = await hasEntitlement("pro");
          if (result.ok) {
            set({ isPro: result.data, lastSubscriptionCheck: Date.now() });
            return result.data;
          } else {
            // RevenueCat not configured or error - keep existing state
            console.log("[Subscription] Check failed:", result.reason);
            return get().isPro;
          }
        } catch (error) {
          console.log("[Subscription] Failed to check subscription:", error);
          return get().isPro;
        }
      },

      setIsPro: (isPro: boolean) => {
        set({ isPro, lastSubscriptionCheck: Date.now() });
      },

      resetMonthlyUsageIfNeeded: () => {
        const currentMonth = getCurrentMonth();
        const { usage } = get();

        if (usage.lastResetDate !== currentMonth) {
          set({
            usage: {
              ageAnalysisCount: 0,
              scoreAnalysisCount: 0,
              lastResetDate: currentMonth,
            },
          });
          console.log("[Subscription] Monthly usage reset for", currentMonth);
        }
      },

      incrementAgeAnalysis: () => {
        const { usage, isPro } = get();
        if (isPro) return; // Pro users don't track usage

        get().resetMonthlyUsageIfNeeded();

        set({
          usage: {
            ...get().usage,
            ageAnalysisCount: get().usage.ageAnalysisCount + 1,
          },
        });
        console.log("[Subscription] Age analysis count:", get().usage.ageAnalysisCount);
      },

      incrementScoreAnalysis: () => {
        const { usage, isPro } = get();
        if (isPro) return; // Pro users don't track usage

        get().resetMonthlyUsageIfNeeded();

        set({
          usage: {
            ...get().usage,
            scoreAnalysisCount: get().usage.scoreAnalysisCount + 1,
          },
        });
        console.log("[Subscription] Score analysis count:", get().usage.scoreAnalysisCount);
      },

      canUseAgeAnalysis: () => {
        const { isPro, usage } = get();
        if (isPro) return true;

        get().resetMonthlyUsageIfNeeded();
        return get().usage.ageAnalysisCount < FREE_TIER_LIMITS.ageAnalysisPerMonth;
      },

      canUseScoreAnalysis: () => {
        const { isPro, usage } = get();
        if (isPro) return true;

        get().resetMonthlyUsageIfNeeded();
        return get().usage.scoreAnalysisCount < FREE_TIER_LIMITS.scoreAnalysisPerMonth;
      },

      getRemainingAgeAnalyses: () => {
        const { isPro, usage } = get();
        if (isPro) return Infinity;

        get().resetMonthlyUsageIfNeeded();
        return Math.max(0, FREE_TIER_LIMITS.ageAnalysisPerMonth - get().usage.ageAnalysisCount);
      },

      getRemainingScoreAnalyses: () => {
        const { isPro, usage } = get();
        if (isPro) return Infinity;

        get().resetMonthlyUsageIfNeeded();
        return Math.max(0, FREE_TIER_LIMITS.scoreAnalysisPerMonth - get().usage.scoreAnalysisCount);
      },
    }),
    {
      name: "deerage-subscription-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isPro: state.isPro,
        lastSubscriptionCheck: state.lastSubscriptionCheck,
        usage: state.usage,
      }),
    }
  )
);
