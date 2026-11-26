/**
 * Start a Score My Rack job from photos an age scan already captured.
 * Same sequence as the Rack score row on the age result.
 */

import type { DeerAnalysisFrame } from "../types/deer-scoring";
import { useDeerScoringStore } from "../state/deerScoringStore";

export async function prepareRackScore(frames: DeerAnalysisFrame[]): Promise<(() => Promise<void>) | null> {
  const usable = frames.filter((frame) => typeof frame.imageUri === "string" && frame.imageUri.length > 0);
  if (usable.length === 0) return null;
  const store = useDeerScoringStore.getState();
  store.setAnalysisMode("score");
  await new Promise((resolve) => setTimeout(resolve, 100));
  store.startCapture();
  usable.forEach((frame) => store.addFrame(frame));
  await new Promise((resolve) => setTimeout(resolve, 100));
  return () => store.processFrames();
}
