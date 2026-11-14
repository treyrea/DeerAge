/**
 * Access and the shared free-analysis counter.
 *
 * A paid plan is recorded only from RevenueCat CustomerInfo.
 * Missing products, failed purchases, and a missing SDK key leave the user on the free plan.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomerInfo } from "react-native-purchases";
import { getCustomerInfo, restorePurchases } from "../lib/revenuecatClient";
import { ACCESS_ENTITLEMENT_IDS, FREE_LIFETIME_ANALYSES, planLabelFor, type PlanLabel } from "../lib/products";

interface SubscriptionState {
  entitled: boolean;
  planLabel: PlanLabel;
  activeEntitlementIds: string[];
  lifetimeAnalysesUsed: number;
  pendingPaywall: boolean;
  localUserId: string | null;
  applyCustomerInfo: (info: CustomerInfo) => boolean;
  refreshEntitlement: () => Promise<boolean>;
  restore: () => Promise<{ ok: boolean; entitled: boolean }>;
  canStartAnalysis: () => boolean;
  remainingFree: () => number | "unlimited";
  noteServerUsage: (remaining: number | "unlimited") => void;
  markPendingPaywall: () => void;
  clearPendingPaywall: () => void;
  ensureLocalUserId: () => string;
}

function productIdFrom(info: CustomerInfo, entitlementIds: string[]): string | null {
  for (const id of entitlementIds) {
    const product = info.entitlements.active[id]?.productIdentifier;
    if (product) return product;
  }
  return null;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      entitled: false,
      planLabel: "Free",
      activeEntitlementIds: [],
      lifetimeAnalysesUsed: 0,
      pendingPaywall: false,
      localUserId: null,

      applyCustomerInfo: (info) => {
        const active = info.entitlements.active ?? {};
        const activeEntitlementIds = ACCESS_ENTITLEMENT_IDS.filter((id) => Boolean(active[id]));
        const entitled = activeEntitlementIds.length > 0;
        set({
          entitled,
          activeEntitlementIds: [...activeEntitlementIds],
          planLabel: planLabelFor(activeEntitlementIds, productIdFrom(info, [...activeEntitlementIds])),
          pendingPaywall: entitled ? false : get().pendingPaywall,
        });
        return entitled;
      },

      refreshEntitlement: async () => {
        const result = await getCustomerInfo();
        if (!result.ok) {
          if (result.reason === "not_configured" || result.reason === "web_not_supported") {
            set({ entitled: false, planLabel: "Free", activeEntitlementIds: [] });
            return false;
          }
          return get().entitled;
        }
        return get().applyCustomerInfo(result.data);
      },

      restore: async () => {
        const result = await restorePurchases();
        if (!result.ok) return { ok: false, entitled: get().entitled };
        return { ok: true, entitled: get().applyCustomerInfo(result.data) };
      },

      canStartAnalysis: () => {
        if (get().entitled) return true;
        return get().lifetimeAnalysesUsed < FREE_LIFETIME_ANALYSES;
      },

      remainingFree: () => {
        if (get().entitled) return "unlimited";
        return Math.max(0, FREE_LIFETIME_ANALYSES - get().lifetimeAnalysesUsed);
      },

      noteServerUsage: (remaining) => {
        if (remaining === "unlimited") {
          if (!get().entitled) set({ pendingPaywall: false });
          return;
        }
        const used = Math.max(0, Math.min(FREE_LIFETIME_ANALYSES, FREE_LIFETIME_ANALYSES - remaining));
        set({
          lifetimeAnalysesUsed: used,
          pendingPaywall: !get().entitled && remaining <= 0,
        });
      },

      markPendingPaywall: () => set({ pendingPaywall: true }),
      clearPendingPaywall: () => set({ pendingPaywall: false }),

      ensureLocalUserId: () => {
        const existing = get().localUserId;
        if (existing) return existing;
        const created = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        set({ localUserId: created });
        return created;
      },
    }),
    {
      name: "deerage-access-v3",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        entitled: state.entitled,
        planLabel: state.planLabel,
        activeEntitlementIds: state.activeEntitlementIds,
        lifetimeAnalysesUsed: state.lifetimeAnalysesUsed,
        localUserId: state.localUserId,
      }),
    },
  ),
);
