/**
 * Connectivity only. Photos are not queued for a later sync.
 * Camera files are temporary, and a queue that never ran was promising a result it could not deliver.
 */

import { create } from "zustand";

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string | null;
  setNetworkState: (connected: boolean, reachable: boolean | null, type: string | null) => void;
}

export const useNetworkStore = create<NetworkState>()((set) => ({
  isConnected: true,
  isInternetReachable: null,
  connectionType: null,
  setNetworkState: (connected, reachable, type) => {
    set({
      isConnected: connected,
      isInternetReachable: reachable,
      connectionType: type,
    });
  },
}));
