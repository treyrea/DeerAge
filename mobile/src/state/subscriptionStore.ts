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
import { canStartScan } from "../lib/access";
import { ACCESS_ENTITLEMENT_IDS, FREE_LIFETIME_ANALYSES, planLabelFor, type PlanLabel } from "../lib/products";

interface SubscriptionState {
  entitled: boolean;
  planLabel: PlanLabel;
  activeEntitlementIds: string[];
  activeProductIds: string[];
  lifetimeAnalysesUsed: number;
  scanCredits: number;
  pendingPaywall: boolean;
  localUserId: string | null;
  lapsed: boolean;
  winBackSeen: boolean;
  applyCustomerInfo: (info: CustomerInfo) => boolean;
  refreshEntitlement: () => Promise<boolean>;
  restore: () => Promise<{ ok: boolean; entitled: boolean }>;
  canStartAnalysis: () => boolean;
  remainingFree: () => number;
  noteServerUsage: (remaining: number | null, scanCredits?: number) => void;
  markPendingPaywall: () => void;
  clearPendingPaywall: () => void;
  markWinBackSeen: () => void;
  ensureLocalUserId: () => string;
}

function lapsedFrom(info: CustomerInfo): boolean {
  if (Object.keys(info.entitlements.active ?? {}).length > 0) return false;
  return Object.values(info.entitlements.all ?? {}).some((entitlement) => {
    if (!entitlement) return false;
    if (entitlement.unsubscribeDetectedAt) return true;
    const expires = entitlement.expirationDate ? Date.parse(entitlement.expirationDate) : NaN;
    return Number.isFinite(expires) && expires < Date.now();
  });
}

function productIdFrom(info: CustomerInfo, entitlementIds: string[]): string | null {
  for (const id of entitlementIds) {
    const product = info.entitlements.active[id]?.productIdentifier;
    if (product) return product;
  }
  return null;
}

function productIdsFrom(info: CustomerInfo): string[] {
  const ids = new Set<string>();
  for (const entitlement of Object.values(info.entitlements.active ?? {})) {
    if (entitlement?.productIdentifier) ids.add(entitlement.productIdentifier);
  }
  for (const id of info.activeSubscriptions ?? []) {
    if (id) ids.add(id);
  }
  return [...ids];
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      entitled: false,
      planLabel: "Free",
      activeEntitlementIds: [],
      activeProductIds: [],
      lifetimeAnalysesUsed: 0,
      scanCredits: 0,
      pendingPaywall: false,
      localUserId: null,
      lapsed: false,
      winBackSeen: false,

      applyCustomerInfo: (info) => {
        const active = info.entitlements.active ?? {};
        const activeEntitlementIds = ACCESS_ENTITLEMENT_IDS.filter((id) => Boolean(active[id]));
        const entitled = activeEntitlementIds.length > 0;
        set({
          entitled,
          activeEntitlementIds: [...activeEntitlementIds],
          activeProductIds: productIdsFrom(info),
          planLabel: planLabelFor(activeEntitlementIds, productIdFrom(info, [...activeEntitlementIds])),
          pendingPaywall: entitled ? false : get().pendingPaywall,
          lapsed: lapsedFrom(info),
        });
        return entitled;
      },

      refreshEntitlement: async () => {
        const result = await getCustomerInfo();
        if (!result.ok) {
          if (result.reason === "not_configured" || result.reason === "web_not_supported") {
            set({ entitled: false, planLabel: "Free", activeEntitlementIds: [], activeProductIds: [] });
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

      canStartAnalysis: () => canStartScan({
        entitled: get().entitled,
        scanCredits: get().scanCredits,
        lifetimeAnalysesUsed: get().lifetimeAnalysesUsed,
        freeLifetime: FREE_LIFETIME_ANALYSES,
      }),

      remainingFree: () => {
        return Math.max(0, FREE_LIFETIME_ANALYSES - get().lifetimeAnalysesUsed);
      },

      noteServerUsage: (remaining, scanCredits) => {
        const credits = typeof scanCredits === "number" ? Math.max(0, Math.floor(scanCredits)) : get().scanCredits;
        if (remaining == null) {
          set({ scanCredits: credits, pendingPaywall: false });
          return;
        }
        const used = Math.max(0, Math.min(FREE_LIFETIME_ANALYSES, FREE_LIFETIME_ANALYSES - remaining));
        set({
          lifetimeAnalysesUsed: used,
          scanCredits: credits,
          pendingPaywall: !get().entitled && remaining <= 0 && credits <= 0,
        });
      },

      markPendingPaywall: () => set({ pendingPaywall: true }),
      clearPendingPaywall: () => set({ pendingPaywall: false }),
      markWinBackSeen: () => set({ winBackSeen: true }),

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
        activeProductIds: state.activeProductIds,
        lifetimeAnalysesUsed: state.lifetimeAnalysesUsed,
        scanCredits: state.scanCredits,
        localUserId: state.localUserId,
        lapsed: state.lapsed,
        winBackSeen: state.winBackSeen,
      }),
    },
  ),
);
