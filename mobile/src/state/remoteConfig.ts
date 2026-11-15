import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { apiBaseUrl } from "../api/proxy";

export interface AppFlags {
  feed: boolean;
  polls: boolean;
  pushPrompt: boolean;
  emailPrompt: boolean;
  legacyCard: boolean;
  harvestCheck: boolean;
  ratingPrompt: boolean;
  shootOrPass: boolean;
  preShotRecord: boolean;
}

export interface AppCopy {
  paywallHeadline: string;
  paywallSubhead: string;
  homeTips: string[];
  seasonalBanner: string;
  regionHeadsUp: string;
  leaseManagerText: string;
  leaseManagerButton: string;
}

const FLAGS: AppFlags = {
  feed: true,
  polls: true,
  pushPrompt: true,
  emailPrompt: true,
  legacyCard: true,
  harvestCheck: true,
  ratingPrompt: true,
  shootOrPass: true,
  preShotRecord: true,
};

interface RemoteConfigState {
  flags: AppFlags;
  copy: AppCopy;
  minSupportedVersion: string;
  recommendedVersion: string;
  minVersion: string;
  loaded: boolean;
  applyPayload: (body: Record<string, unknown>) => void;
}

function flagsFrom(value: unknown): AppFlags {
  const next = { ...FLAGS };
  if (!value || typeof value !== "object") return next;
  const row = value as Record<string, unknown>;
  (Object.keys(next) as (keyof AppFlags)[]).forEach((name) => {
    if (typeof row[name] === "boolean") next[name] = row[name] as boolean;
  });
  return next;
}

export const useRemoteConfig = create<RemoteConfigState>()(
  persist(
    (set) => ({
      flags: FLAGS,
      copy: { paywallHeadline: "", paywallSubhead: "", homeTips: [], seasonalBanner: "", regionHeadsUp: "", leaseManagerText: "", leaseManagerButton: "" },
      minSupportedVersion: "1.0.0",
      recommendedVersion: "",
      minVersion: "",
      loaded: false,
      applyPayload: (body) => {
        const copy = (body.copy ?? {}) as Record<string, unknown>;
        set({
          loaded: true,
          flags: flagsFrom(body.flags),
          minSupportedVersion: typeof body.minSupportedVersion === "string" ? body.minSupportedVersion : "1.0.0",
          recommendedVersion: typeof body.recommendedVersion === "string" ? body.recommendedVersion : "",
          minVersion: typeof body.minVersion === "string" ? body.minVersion : "",
          copy: {
            paywallHeadline: typeof copy.paywallHeadline === "string" ? copy.paywallHeadline : "",
            paywallSubhead: typeof copy.paywallSubhead === "string" ? copy.paywallSubhead : "",
            seasonalBanner: typeof copy.seasonalBanner === "string" ? copy.seasonalBanner : "",
            regionHeadsUp: typeof copy.regionHeadsUp === "string" ? copy.regionHeadsUp : "",
            leaseManagerText: typeof copy.leaseManagerText === "string" ? copy.leaseManagerText : "",
            leaseManagerButton: typeof copy.leaseManagerButton === "string" ? copy.leaseManagerButton : "",
            homeTips: Array.isArray(copy.homeTips) ? copy.homeTips.filter((tip): tip is string => typeof tip === "string") : [],
          },
        });
      },
    }),
    {
      name: "deerage-remote-config",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        flags: state.flags,
        copy: state.copy,
        minSupportedVersion: state.minSupportedVersion,
        recommendedVersion: state.recommendedVersion,
        minVersion: state.minVersion,
      }),
    },
  ),
);

export async function refreshRemoteConfig(): Promise<void> {
  const base = apiBaseUrl();
  if (!base) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${base}/api/config`, { signal: controller.signal });
    if (!response.ok) return;
    const body = (await response.json()) as Record<string, unknown> | null;
    if (body && body.ok !== false) useRemoteConfig.getState().applyPayload(body);
  } catch {
    // Keep the last saved config. A miss must not block the app.
  } finally {
    clearTimeout(timer);
  }
}

export function flagEnabled(name: keyof AppFlags): boolean {
  return useRemoteConfig.getState().flags[name] !== false;
}
