import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type LandType = "private" | "public" | "lease" | "high_fence";
export type HuntGoal = "any_buck" | "shooters_3.5" | "shooters_4.5" | "trophy";

export interface HunterProfileState {
  hydrated: boolean;
  completed: boolean;
  stateCode: string;
  stateName: string;
  ecoregion: string;
  landType: LandType;
  goal: HuntGoal;
  species: "whitetail" | "mule_deer";
  goodResultCount: number;
  hasRequestedReview: boolean;
  sessionCount: number;
  reviewAskedForVersion: string | null;
  dismissedUpdateVersion: string | null;
  complete: (profile: {
    stateCode: string;
    stateName: string;
    ecoregion: string;
    landType: LandType;
    goal: HuntGoal;
  }) => void;
  setHydrated: () => void;
  noteGoodResult: () => number;
  markReviewRequested: () => void;
  noteSession: () => void;
  markReviewAsked: (version: string) => void;
  dismissUpdate: (version: string) => void;
}

export function goalToMinimumAge(goal: HuntGoal): number {
  if (goal === "any_buck") return 1.5;
  if (goal === "shooters_3.5") return 3.5;
  if (goal === "trophy") return 5.5;
  return 4.5;
}

export function speciesForEcoregion(ecoregion: string): "whitetail" | "mule_deer" {
  return ecoregion.toLowerCase().includes("mule") ? "mule_deer" : "whitetail";
}

export const useHunterProfile = create<HunterProfileState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      completed: false,
      stateCode: "",
      stateName: "",
      ecoregion: "",
      landType: "private",
      goal: "shooters_4.5",
      species: "whitetail",
      goodResultCount: 0,
      hasRequestedReview: false,
      sessionCount: 0,
      reviewAskedForVersion: null,
      dismissedUpdateVersion: null,
      complete: (profile) => {
        set({
          completed: true,
          stateCode: profile.stateCode,
          stateName: profile.stateName,
          ecoregion: profile.ecoregion,
          landType: profile.landType,
          goal: profile.goal,
          species: speciesForEcoregion(profile.ecoregion),
        });
      },
      setHydrated: () => set({ hydrated: true }),
      noteGoodResult: () => {
        const next = get().goodResultCount + 1;
        set({ goodResultCount: next });
        return next;
      },
      markReviewRequested: () => set({ hasRequestedReview: true }),
      noteSession: () => set({ sessionCount: get().sessionCount + 1 }),
      markReviewAsked: (version) => set({ reviewAskedForVersion: version, hasRequestedReview: true }),
      dismissUpdate: (version) => set({ dismissedUpdateVersion: version }),
    }),
    {
      name: "deerage-hunter-profile",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        completed: state.completed,
        stateCode: state.stateCode,
        stateName: state.stateName,
        ecoregion: state.ecoregion,
        landType: state.landType,
        goal: state.goal,
        species: state.species,
        goodResultCount: state.goodResultCount,
        hasRequestedReview: state.hasRequestedReview,
        sessionCount: state.sessionCount,
        reviewAskedForVersion: state.reviewAskedForVersion,
        dismissedUpdateVersion: state.dismissedUpdateVersion,
      }),
      onRehydrateStorage: () => () => {
        useHunterProfile.setState({ hydrated: true });
      },
    },
  ),
);
