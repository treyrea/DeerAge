import { useEffect, useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { recordGoodResult } from "../lib/review";
import { scheduleCommunityPrompt } from "../state/communityStore";
import { useSubscriptionStore } from "../state/subscriptionStore";
import type { PaywallResultSummary } from "../lib/products";

/**
 * After a real result: count it toward the ratings prompt, and open the paywall
 * once the shared free analyses are gone. The paywall shows this summary on top.
 */
export function useResultFollowUp(enabled: boolean, summary: PaywallResultSummary | null) {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const ran = useRef(false);

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
}
