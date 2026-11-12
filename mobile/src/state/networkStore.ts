/**
 * Network State Management
 * Monitors connectivity and manages offline queue
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface QueuedAnalysis {
  id: string;
  type: "age" | "score";
  imageUris: string[]; // Support multiple frames
  timestamp: Date;
  status: "queued" | "processing" | "completed" | "failed";
  propertyRules?: {
    minimumShooterAge: number;
  };
  errorMessage?: string;
}

interface NetworkState {
  // Network status
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string | null;

  // Offline queue
  analysisQueue: QueuedAnalysis[];

  // Actions
  setNetworkState: (connected: boolean, reachable: boolean | null, type: string | null) => void;
  addToQueue: (analysis: Omit<QueuedAnalysis, "id" | "timestamp" | "status">) => void;
  updateQueueItem: (id: string, updates: Partial<QueuedAnalysis>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  getQueuedCount: () => number;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set, get) => ({
      // Initial state
      isConnected: true,
      isInternetReachable: null,
      connectionType: null,
      analysisQueue: [],

      // Update network state
      setNetworkState: (connected, reachable, type) => {
        set({
          isConnected: connected,
          isInternetReachable: reachable,
          connectionType: type,
        });
      },

      // Add analysis to offline queue
      addToQueue: (analysis) => {
        const queueItem: QueuedAnalysis = {
          ...analysis,
          id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          status: "queued",
        };

        set((state) => ({
          analysisQueue: [...state.analysisQueue, queueItem],
        }));

        return queueItem.id;
      },

      // Update queue item status
      updateQueueItem: (id, updates) => {
        set((state) => ({
          analysisQueue: state.analysisQueue.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      // Remove from queue
      removeFromQueue: (id) => {
        set((state) => ({
          analysisQueue: state.analysisQueue.filter((item) => item.id !== id),
        }));
      },

      // Clear entire queue
      clearQueue: () => {
        set({ analysisQueue: [] });
      },

      // Get count of queued items
      getQueuedCount: () => {
        const { analysisQueue } = get();
        return analysisQueue.filter((item) => item.status === "queued").length;
      },
    }),
    {
      name: "network-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        analysisQueue: state.analysisQueue, // Only persist queue, not network state
      }),
    }
  )
);
