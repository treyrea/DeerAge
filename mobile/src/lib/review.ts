import * as StoreReview from "expo-store-review";
import { useHunterProfile } from "../state/hunterProfile";

async function maybeAskForReview(): Promise<void> {
  const profile = useHunterProfile.getState();
  if (profile.hasRequestedReview) return;
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;
    await StoreReview.requestReview();
    useHunterProfile.getState().markReviewRequested();
  } catch {
    // A ratings sheet is optional. Never turn this into an analysis error.
  }
}

/** Call after a successful result. The sheet waits until the second good result. */
export async function recordGoodResult(): Promise<void> {
  const count = useHunterProfile.getState().noteGoodResult();
  if (count >= 2) await maybeAskForReview();
}

/** Call after the hunter shares a result card. Never call this from an error path. */
export async function recordShare(): Promise<void> {
  await maybeAskForReview();
}
