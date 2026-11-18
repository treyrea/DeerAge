import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";
import { useHunterProfile } from "../state/hunterProfile";
import { flagEnabled } from "../state/remoteConfig";

let asking = false;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * StoreKit's own sheet. Only after a firm call the hunter confirmed,
 * never after BORDERLINE, a wrong-call report, or within 7 days of one.
 * Once per app version, and never during the first session.
 */
export async function maybeRequestReview(fieldCall: string): Promise<void> {
  if (asking || !flagEnabled("ratingPrompt")) return;
  if (fieldCall !== "SHOOTER" && fieldCall !== "LET WALK") return;
  const profile = useHunterProfile.getState();
  if (profile.sessionCount < 2) return;
  const version = Constants.expoConfig?.version ?? "1.0.9";
  if (profile.reviewAskedForVersion === version) return;
  if (profile.wrongReportAt && Date.now() - profile.wrongReportAt < WEEK_MS) return;
  asking = true;
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;
    await StoreReview.requestReview();
    useHunterProfile.getState().markReviewAsked(version);
  } catch {
    // The sheet is optional. A miss is not an analysis error.
  } finally {
    asking = false;
  }
}

export async function recordGoodResult(): Promise<void> {
  useHunterProfile.getState().noteGoodResult();
}

export async function recordShare(): Promise<void> {
  // Sharing is not the ratings moment. The result screen asks after a kept scan.
}
