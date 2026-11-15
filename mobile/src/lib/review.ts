import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";
import { useHunterProfile } from "../state/hunterProfile";
import { flagEnabled } from "../state/remoteConfig";

let asking = false;

/**
 * StoreKit's own sheet. No custom "do you like the app" step.
 * Once per app version, and never during the first session.
 */
export async function maybeRequestReview(): Promise<void> {
  if (asking || !flagEnabled("ratingPrompt")) return;
  const profile = useHunterProfile.getState();
  if (profile.sessionCount < 2) return;
  const version = Constants.expoConfig?.version ?? "1.0.9";
  if (profile.reviewAskedForVersion === version) return;
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
