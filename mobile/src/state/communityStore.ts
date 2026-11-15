import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useDeerScoringStore } from "./deerScoringStore";

export interface FeedAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
}

export interface FeedPoll {
  id: string;
  question: string;
  publishedAt: string | null;
  options: { id: string; label: string }[];
  myVote: string | null;
}

export interface FeedPayload {
  announcements: FeedAnnouncement[];
  polls: FeedPoll[];
}

interface CommunityState {
  seenIds: string[];
  dismissedIds: string[];
  legacyCardDismissed: boolean;
  pushPromptHandled: boolean;
  pushEnabled: boolean;
  email: string | null;
  unsubscribeToken: string | null;
  emailDismissCount: number;
  cachedFeed: FeedPayload | null;
  activePrompt: "push" | "email" | null;
  markSeen: (ids: string[]) => void;
  dismissItem: (id: string) => void;
  dismissLegacyCard: () => void;
  setPushPromptHandled: () => void;
  setPushEnabled: (enabled: boolean) => void;
  setEmail: (email: string | null, unsubscribeToken?: string | null) => void;
  dismissEmailPrompt: () => void;
  setCachedFeed: (feed: FeedPayload) => void;
  setActivePrompt: (prompt: "push" | "email" | null) => void;
  noteVote: (pollId: string, optionId: string) => void;
}

function cap(ids: string[]): string[] {
  return [...new Set(ids)].slice(-200);
}

export const useCommunityStore = create<CommunityState>()(
  persist(
    (set, get) => ({
      seenIds: [],
      dismissedIds: [],
      legacyCardDismissed: false,
      pushPromptHandled: false,
      pushEnabled: false,
      email: null,
      unsubscribeToken: null,
      emailDismissCount: 0,
      cachedFeed: null,
      activePrompt: null,
      markSeen: (ids) => set({ seenIds: cap([...get().seenIds, ...ids]) }),
      dismissItem: (id) => set({ dismissedIds: cap([...get().dismissedIds, id]) }),
      dismissLegacyCard: () => set({ legacyCardDismissed: true }),
      setPushPromptHandled: () => set({ pushPromptHandled: true, activePrompt: null }),
      setPushEnabled: (enabled) => set({ pushEnabled: enabled, pushPromptHandled: true, activePrompt: null }),
      setEmail: (email, unsubscribeToken = null) => set({
        email,
        unsubscribeToken,
      }),
      dismissEmailPrompt: () => set((state) => ({
        emailDismissCount: state.emailDismissCount + 1,
        activePrompt: null,
      })),
      setCachedFeed: (feed) => set({ cachedFeed: feed }),
      setActivePrompt: (prompt) => set({ activePrompt: prompt }),
      noteVote: (pollId, optionId) => {
        const feed = get().cachedFeed;
        if (!feed) return;
        set({
          cachedFeed: {
            ...feed,
            polls: feed.polls.map((poll) => (poll.id === pollId ? { ...poll, myVote: optionId } : poll)),
          },
        });
      },
    }),
    {
      name: "deerage-community",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        seenIds: state.seenIds,
        dismissedIds: state.dismissedIds,
        legacyCardDismissed: state.legacyCardDismissed,
        pushPromptHandled: state.pushPromptHandled,
        pushEnabled: state.pushEnabled,
        email: state.email,
        unsubscribeToken: state.unsubscribeToken,
        emailDismissCount: state.emailDismissCount,
        cachedFeed: state.cachedFeed,
      }),
    },
  ),
);

export function nextCommunityPrompt(): "push" | "email" | null {
  const community = useCommunityStore.getState();
  const localEmail = useDeerScoringStore.getState().userEmail;
  if (!community.pushPromptHandled) return "push";
  if (!community.email && !localEmail && community.emailDismissCount < 2) return "email";
  return null;
}

export function scheduleCommunityPrompt(): void {
  const run = () => {
    const prompt = nextCommunityPrompt();
    if (prompt) useCommunityStore.setState({ activePrompt: prompt });
  };
  if (useCommunityStore.persist.hasHydrated()) {
    run();
    return;
  }
  const unsub = useCommunityStore.persist.onFinishHydration(() => {
    unsub();
    run();
  });
}

export function unseenFeedCount(feed: FeedPayload | null, seenIds: string[], dismissedIds: string[]): number {
  if (!feed) return 0;
  const ids = [
    ...feed.announcements.map((item) => item.id),
    ...feed.polls.map((item) => item.id),
  ];
  return ids.filter((id) => !seenIds.includes(id) && !dismissedIds.includes(id)).length;
}
