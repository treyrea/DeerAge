import { useEffect, useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { maybeRequestReview, recordGoodResult } from "../lib/review";
import { scheduleCommunityPrompt } from "../state/communityStore";
import { useSubscriptionStore } from "../state/subscriptionStore";
import type { PaywallResultSummary } from "../lib/products";

/**
 * After a real result: open the paywall if the free analyses are gone.
 * Ratings, push, and email wait until the hunter leaves this result
 * without starting another scan. They do not cover the call while he is
 * still deciding in the stand.
 */
export function useResultFollowUp(enabled: boolean, summary: PaywallResultSummary | null) {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const ran = useRef(false);
  const rescan = useRef(false);

  useEffect(() => {
    if (!enabled || !summary || ran.current) return;
    ran.current = true;
    void recordGoodResult();
    if (useSubscriptionStore.getState().pendingPaywall) {
      useSubscriptionStore.getState().clearPendingPaywall();
      navigation.navigate("TierPaywall", { reason: "free_limit", resultSummary: summary });
    }
  }, [enabled, summary, navigation]);

  useEffect(() => {
    if (!enabled) return;
    const started = Date.now();
    return () => {
      if (rescan.current) return;
      if (Date.now() - started < 800) return;
      scheduleCommunityPrompt();
      void maybeRequestReview();
    };
  }, [enabled]);

  return {
    markRescan: () => {
      rescan.current = true;
    },
  };
}
