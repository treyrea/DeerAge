/**
 * Distance Store
 * Zustand store for managing distance capture state and settings
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  DistanceMeasurement,
  DistanceSettings,
  DistanceTelemetry,
  RangefinderProvider,
  ZoomMeta,
} from "../types/distance";
import { LAST_DISTANCE_EXPIRE_MINUTES } from "../types/distance";

interface DistanceState {
  // Last captured distance (for suggestion)
  lastDistance: DistanceMeasurement | null;

  // Current capture session distance
  pendingDistance: DistanceMeasurement | null;

  // Zoom metadata from current capture
  pendingZoomMeta: ZoomMeta | null;

  // Settings
  settings: DistanceSettings;

  // Feature flags
  enableBluetoothRangefinder: boolean;

  // Rangefinder state (Phase 2)
  rangefinderState: "disconnected" | "searching" | "connected" | "failed";

  // Telemetry data (local storage)
  telemetryData: DistanceTelemetry[];

  // Actions
  setLastDistance: (distance: DistanceMeasurement) => void;
  setPendingDistance: (distance: DistanceMeasurement | null) => void;
  setPendingZoomMeta: (zoomMeta: ZoomMeta | null) => void;
  clearPendingDistance: () => void;
  updateSettings: (settings: Partial<DistanceSettings>) => void;
  getSuggestedDistance: () => { distance: number; timestamp: string } | null;
  setRangefinderState: (state: "disconnected" | "searching" | "connected" | "failed") => void;
  recordTelemetry: (telemetry: DistanceTelemetry) => void;
  getTelemetryStats: () => {
    totalAnalyses: number;
    withDistance: number;
    percentWithDistance: number;
    distanceDistribution: Record<string, number>;
    rangedVsEstimated: { ranged: number; estimated: number };
  };
}

export const useDistanceStore = create<DistanceState>()(
  persist(
    (set, get) => ({
      // Initial state
      lastDistance: null,
      pendingDistance: null,
      pendingZoomMeta: null,
      settings: {
        promptOnEveryAnalysis: true,
        rememberLastDistanceMinutes: LAST_DISTANCE_EXPIRE_MINUTES,
        defaultUnit: "yards",
      },
      enableBluetoothRangefinder: false, // Phase 2 feature flag - disabled by default
      rangefinderState: "disconnected",
      telemetryData: [],

      // Actions
      setLastDistance: (distance) => {
        set({ lastDistance: distance });
      },

      setPendingDistance: (distance) => {
        set({ pendingDistance: distance });
        // Also update lastDistance if setting a new value
        if (distance) {
          set({ lastDistance: distance });
        }
      },

      setPendingZoomMeta: (zoomMeta) => {
        set({ pendingZoomMeta: zoomMeta });
      },

      clearPendingDistance: () => {
        set({ pendingDistance: null, pendingZoomMeta: null });
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      getSuggestedDistance: () => {
        const { lastDistance, settings } = get();

        if (!lastDistance) return null;

        // Check if last distance is within the expiry window
        const expireMinutes = settings.rememberLastDistanceMinutes;
        if (expireMinutes === 0) return null; // Feature disabled

        const lastTimestamp = new Date(lastDistance.timestamp).getTime();
        const now = Date.now();
        const diffMinutes = (now - lastTimestamp) / 60000;

        if (diffMinutes > expireMinutes) return null;

        return {
          distance: lastDistance.distanceYards,
          timestamp: lastDistance.timestamp,
        };
      },

      setRangefinderState: (state) => {
        set({ rangefinderState: state });
      },

      recordTelemetry: (telemetry) => {
        set((state) => ({
          telemetryData: [...state.telemetryData.slice(-99), telemetry], // Keep last 100
        }));
      },

      getTelemetryStats: () => {
        const { telemetryData } = get();
        const totalAnalyses = telemetryData.length;
        const withDistance = telemetryData.filter((t) => t.hasDistance).length;
        const percentWithDistance = totalAnalyses > 0 ? (withDistance / totalAnalyses) * 100 : 0;

        // Distance distribution buckets
        const distanceDistribution: Record<string, number> = {
          "0-50": 0,
          "51-100": 0,
          "101-150": 0,
          "151-200": 0,
          "200+": 0,
        };

        // Ranged vs estimated
        const rangedVsEstimated = { ranged: 0, estimated: 0 };

        telemetryData.forEach((t) => {
          if (t.hasDistance && t.distanceYards) {
            const d = t.distanceYards;
            if (d <= 50) distanceDistribution["0-50"]++;
            else if (d <= 100) distanceDistribution["51-100"]++;
            else if (d <= 150) distanceDistribution["101-150"]++;
            else if (d <= 200) distanceDistribution["151-200"]++;
            else distanceDistribution["200+"]++;

            if (t.source === "rangefinder_bluetooth" || t.source === "rangefinder_manual") {
              rangedVsEstimated.ranged++;
            } else {
              rangedVsEstimated.estimated++;
            }
          }
        });

        return {
          totalAnalyses,
          withDistance,
          percentWithDistance,
          distanceDistribution,
          rangedVsEstimated,
        };
      },
    }),
    {
      name: "distance-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist what's needed
        lastDistance: state.lastDistance,
        settings: state.settings,
        telemetryData: state.telemetryData,
      }),
    }
  )
);

// Selector hooks for optimized re-renders
export const useDistanceSettings = () => useDistanceStore((s) => s.settings);
export const usePendingDistance = () => useDistanceStore((s) => s.pendingDistance);
export const useLastDistance = () => useDistanceStore((s) => s.lastDistance);
export const useRangefinderEnabled = () => useDistanceStore((s) => s.enableBluetoothRangefinder);
export const useRangefinderState = () => useDistanceStore((s) => s.rangefinderState);
