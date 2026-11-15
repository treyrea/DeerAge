import { useEffect, useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { maybeRequestReview, recordGoodResult } from "../lib/review";
import { scheduleCommunityPrompt } from "../state/communityStore";
import { useSubscriptionStore } from "../state/subscriptionStore";
import type { PaywallResultSummary } from "../lib/products";

/**
 * After a real result: count it toward the ratings prompt, and open the paywall
 * once the shared free analyses are gone. The paywall shows this summary on top.
 * The ratings sheet waits until the hunter keeps this result instead of scanning again.
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
      setTimeout(scheduleCommunityPrompt, 600);
      return;
    }
    scheduleCommunityPrompt();
  }, [enabled, summary, navigation]);

  useEffect(() => {
    if (!enabled) return;
    const started = Date.now();
    let asked = false;
    const timer = setTimeout(() => {
      asked = true;
      if (!rescan.current) void maybeRequestReview();
    }, 16_000);
    return () => {
      clearTimeout(timer);
      if (asked || rescan.current) return;
      if (Date.now() - started < 4_000) return;
      void maybeRequestReview();
    };
  }, [enabled]);

  return {
    markRescan: () => {
      rescan.current = true;
    },
  };
}
