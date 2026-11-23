import { useEffect, useRef } from "react";
import { maybeRequestReview, recordGoodResult } from "../lib/review";
import { shouldRequestReviewAfterLeaving } from "../lib/review-leave";
import { scheduleCommunityPrompt } from "../state/communityStore";

/**
 * A finished read stays on screen. Plans, ratings, push, and email wait
 * until he leaves, so nothing covers the call in the stand.
 */
export function useResultFollowUp(enabled: boolean, fieldCall?: string | null) {
  const ran = useRef(false);
  const rescan = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;
    void recordGoodResult();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const started = Date.now();
    return () => {
      if (rescan.current) return;
      if (Date.now() - started < 800) return;
      scheduleCommunityPrompt();
      if (shouldRequestReviewAfterLeaving({
        enabled: true,
        rescan: false,
        visibleMs: Date.now() - started,
        fieldCall,
      })) {
        void maybeRequestReview(fieldCall as string);
      }
    };
  }, [enabled, fieldCall]);

  return {
    markRescan: () => {
      rescan.current = true;
    },
  };
}
