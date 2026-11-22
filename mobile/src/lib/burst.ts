/** Shared burst timing for the camera. Age is a shorter burst; rack/score stays longer. */

export const BURST_INTERVAL_MS = 250;

/** Age mode: 4 frames over about 1 second (3 gaps at 4 fps, plus shutter time). */
export const AGE_BURST_FRAMES = 4;

/** Rack/score mode: 8 frames over about 2 seconds. */
export const SCORE_BURST_FRAMES = 8;

export function burstFrameCount(mode: "age" | "score"): number {
  return mode === "age" ? AGE_BURST_FRAMES : SCORE_BURST_FRAMES;
}

/** Time between the first and last shutter, not counting how long each photo takes. */
export function burstSpanMs(mode: "age" | "score"): number {
  const frames = burstFrameCount(mode);
  if (frames <= 1) return 0;
  return (frames - 1) * BURST_INTERVAL_MS;
}
