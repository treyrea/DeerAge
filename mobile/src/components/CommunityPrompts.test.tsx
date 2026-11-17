import React from "react";
import TestRenderer from "react-test-renderer";
import { NavigationContainer } from "@react-navigation/native";

jest.mock("../state/deerScoringStore", () => {
  const { create } = require("zustand");
  return { useDeerScoringStore: create(() => ({ setUserEmail: () => undefined, userEmail: "" })) };
});
jest.mock("../state/communityStore", () => {
  const { create } = require("zustand");
  const useCommunityStore = create((set: (partial: Record<string, unknown>) => void) => ({
    activePrompt: null as "push" | "email" | null,
    setActivePrompt: (activePrompt: "push" | "email" | null) => set({ activePrompt }),
    setPushPromptHandled: () => set({ activePrompt: null }),
    setEmail: () => undefined,
    dismissEmailPrompt: () => set({ activePrompt: null }),
  }));
  return { useCommunityStore };
});
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../api/community", () => ({ submitEmail: jest.fn() }));
jest.mock("../lib/revenuecatClient", () => ({ setRevenueCatEmail: jest.fn() }));
jest.mock("../lib/push", () => ({ enablePush: jest.fn() }));

import { CommunityPrompts } from "./CommunityPrompts";
import { useCommunityStore } from "../state/communityStore";

/**
 * CommunityPrompts is mounted beside the navigator, not inside a screen.
 * A navigation hook here aborts the release app on launch.
 */
beforeEach(() => {
  useCommunityStore.setState({ activePrompt: null });
});

test("the root prompt renders outside a navigator", () => {
  expect(() => TestRenderer.create(<CommunityPrompts />)).not.toThrow();
});

test("the root layout mounts the prompt beside the navigator", () => {
  expect(() => TestRenderer.create(
    <NavigationContainer>
      <CommunityPrompts />
    </NavigationContainer>,
  )).not.toThrow();
});

test("the paywall route hides the prompt without a navigation hook", () => {
  useCommunityStore.setState({ activePrompt: "push" });
  const tree = TestRenderer.create(<CommunityPrompts routeName="TierPaywall" />);
  expect(tree.toJSON()).toBeNull();
});
