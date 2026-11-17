import { create } from "zustand";

export const e2eEnabled = process.env.EXPO_PUBLIC_E2E === "1";

interface E2eFlags {
  showUpdateCard: boolean;
  forceUpdate: boolean;
  holdOffline: boolean;
  setShowUpdateCard: (value: boolean) => void;
  setForceUpdate: (value: boolean) => void;
  setHoldOffline: (value: boolean) => void;
}

export const useE2eFlags = create<E2eFlags>((set) => ({
  showUpdateCard: false,
  forceUpdate: false,
  holdOffline: false,
  setShowUpdateCard: (showUpdateCard) => set({ showUpdateCard }),
  setForceUpdate: (forceUpdate) => set({ forceUpdate }),
  setHoldOffline: (holdOffline) => set({ holdOffline }),
}));
