import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { migrateLeaseRules } from "../lib/lease-rules";
import type { Place } from "../lib/regions";

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
  huntStateCode: string;
  huntStateName: string;
  huntEcoregion: string;
  huntLabel: string;
  huntDay: string;
  leaseManagerName: string;
  leaseManagerPhone: string;
  /** Off until he asks. Existing managers and records migrate to on. */
  leaseRules: boolean;
  leaseRulesChosen: boolean;
  /** "Help improve DeerAge": off until he turns it on after reading what is shared. */
  helpImprove: boolean;
  goodResultCount: number;
  hasRequestedReview: boolean;
  sessionCount: number;
  reviewAskedForVersion: string | null;
  wrongReportAt: number | null;
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
  noteWrongReport: () => void;
  dismissUpdate: (version: string) => void;
  confirmHunt: (place: Place) => void;
  setLeaseManager: (name: string, phone: string) => void;
  setLeaseRules: (enabled: boolean) => void;
  setHelpImprove: (enabled: boolean) => void;
}

export function goalToMinimumAge(goal: HuntGoal): number {
  if (goal === "any_buck") return 1.5;
  if (goal === "shooters_3.5") return 3.5;
  if (goal === "trophy") return 5.5;
  return 4.5;
}

export function localDay(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function homePlace(state: Pick<HunterProfileState, "stateCode" | "stateName" | "ecoregion">): Place {
  return {
    stateCode: state.stateCode,
    stateName: state.stateName,
    ecoregion: state.ecoregion,
    label: state.ecoregion || state.stateName || "home",
  };
}

export function rememberedHunt(state: Pick<HunterProfileState, "huntStateCode" | "huntStateName" | "huntEcoregion" | "huntLabel">): Place | null {
  if (!state.huntStateCode) return null;
  return {
    stateCode: state.huntStateCode,
    stateName: state.huntStateName,
    ecoregion: state.huntEcoregion,
    label: state.huntLabel || state.huntEcoregion || state.huntStateName,
  };
}

export function activeHunt(state: HunterProfileState): Place {
  if (state.huntDay === localDay()) {
    const hunt = rememberedHunt(state);
    if (hunt) return hunt;
  }
  return homePlace(state);
}

export function huntConfirmedToday(state: Pick<HunterProfileState, "huntDay" | "huntStateCode">): boolean {
  return state.huntDay === localDay() && Boolean(state.huntStateCode);
}

export function settleLeaseRules(savedRecords: number): void {
  const profile = useHunterProfile.getState();
  if (profile.leaseRulesChosen) return;
  const next = migrateLeaseRules({
    chosen: false,
    enabled: profile.leaseRules,
    managerName: profile.leaseManagerName,
    managerPhone: profile.leaseManagerPhone,
    savedRecords,
  });
  useHunterProfile.setState({ leaseRules: next.enabled, leaseRulesChosen: next.chosen });
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
      huntStateCode: "",
      huntStateName: "",
      huntEcoregion: "",
      huntLabel: "",
      huntDay: "",
      leaseManagerName: "",
      leaseManagerPhone: "",
      leaseRules: false,
      leaseRulesChosen: false,
      helpImprove: false,
      goodResultCount: 0,
      hasRequestedReview: false,
      sessionCount: 0,
      reviewAskedForVersion: null,
      wrongReportAt: null,
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
      noteWrongReport: () => set({ wrongReportAt: Date.now() }),
      dismissUpdate: (version) => set({ dismissedUpdateVersion: version }),
      confirmHunt: (place) => set({
        huntStateCode: place.stateCode,
        huntStateName: place.stateName,
        huntEcoregion: place.ecoregion,
        huntLabel: place.label,
        huntDay: localDay(),
      }),
      setLeaseManager: (name, phone) => set({
        leaseManagerName: name.trim().slice(0, 80),
        leaseManagerPhone: phone.trim().slice(0, 40),
      }),
      setLeaseRules: (enabled) => set({ leaseRules: enabled, leaseRulesChosen: true }),
      setHelpImprove: (enabled) => set({ helpImprove: enabled }),
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
        huntStateCode: state.huntStateCode,
        huntStateName: state.huntStateName,
        huntEcoregion: state.huntEcoregion,
        huntLabel: state.huntLabel,
        huntDay: state.huntDay,
        leaseManagerName: state.leaseManagerName,
        leaseManagerPhone: state.leaseManagerPhone,
        leaseRules: state.leaseRules,
        leaseRulesChosen: state.leaseRulesChosen,
        helpImprove: state.helpImprove,
        goodResultCount: state.goodResultCount,
        hasRequestedReview: state.hasRequestedReview,
        sessionCount: state.sessionCount,
        reviewAskedForVersion: state.reviewAskedForVersion,
        wrongReportAt: state.wrongReportAt,
        dismissedUpdateVersion: state.dismissedUpdateVersion,
      }),
      onRehydrateStorage: () => () => {
        useHunterProfile.setState({ hydrated: true });
      },
    },
  ),
);
