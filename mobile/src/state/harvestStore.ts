import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveAppUserId } from "../api/community";
import { apiBaseUrl } from "../api/proxy";

export type HarvestMethod = "jawbone" | "lab" | "other";

export interface HarvestEntry {
  scanId: string;
  harvested: boolean;
  confirmedAge: string;
  method: HarvestMethod | null;
  notes: string;
  updatedAt: string;
  synced: boolean;
}

interface HarvestState {
  entries: Record<string, HarvestEntry>;
  save: (entry: Omit<HarvestEntry, "updatedAt" | "synced">) => void;
  markSynced: (scanId: string) => void;
}

export const useHarvestStore = create<HarvestState>()(
  persist(
    (set, get) => ({
      entries: {},
      save: (entry) => {
        const next: HarvestEntry = { ...entry, updatedAt: new Date().toISOString(), synced: false };
        set({ entries: { ...get().entries, [entry.scanId]: next } });
        void pushHarvest(next);
      },
      markSynced: (scanId) => {
        const current = get().entries[scanId];
        if (!current) return;
        set({ entries: { ...get().entries, [scanId]: { ...current, synced: true } } });
      },
    }),
    {
      name: "deerage-harvests",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

async function pushHarvest(entry: HarvestEntry): Promise<void> {
  const base = apiBaseUrl();
  if (!base) return;
  try {
    const appUserId = await resolveAppUserId();
    const response = await fetch(`${base}/api/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appUserId,
        scanId: entry.scanId,
        harvested: entry.harvested,
        confirmedAge: entry.confirmedAge,
        method: entry.method,
        notes: entry.notes,
      }),
    });
    if (response.ok) useHarvestStore.getState().markSynced(entry.scanId);
  } catch {
    // The phone keeps the row. The next save tries again.
  }
}

export function pendingHarvestCount(entries: Record<string, HarvestEntry>): number {
  return Object.values(entries).filter((entry) => entry.harvested && !entry.confirmedAge.trim()).length;
}
