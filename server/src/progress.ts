/**
 * Real scan progress for the waiting screen.
 *
 * The server knows which model call is running. It writes a small progress
 * record on the job; the phone reads it on each status poll and draws a
 * determinate bar with an honest time left.
 *
 * Times are medians of logged Hydrogen calls (51-photo runs and production
 * logs, Nov 21-22 2026). They are estimates, so the phone never lets the bar
 * reach the end before the result arrives.
 */

export type ProgressStage = "photo" | "body" | "crosscheck" | "finishing";

export interface ScanProgress {
  stage: ProgressStage;
  /** Expected milliseconds left when this stage was reported. */
  etaMs: number;
  /** Server time (ms) the scan started and this stage was reported. */
  startedAt: number;
  at: number;
}

/** Median seconds per call (box runs of gemini-4-hydrogen; see rubric/a10/speed). */
export const CALL_MEDIAN_MS = {
  quality: 6_700,
  gate: 5_500,
  stepA: 8_800,
  closer: 6_800,
  crossCheck: 23_800,
  plain: 5_000,
  score: 17_000,
  finish: 1_000,
} as const;

/**
 * Share of photos that go on at each closer pair, from the 1.0.10 final run
 * (39 photos reached the closers: 7 stop at the first pair, 9 at the second,
 * 20 at the third, 3 at the fourth).
 */
const CONTINUE_AFTER_PAIR = [32 / 39, 23 / 32, 3 / 23, 0];
/** Share of ageable photos that pass the baby gate (39 of 48). */
const PAST_BABY_GATE = 39 / 48;

/** Expected closer calls left when pair `index` (0-3) is about to start. */
export function expectedClosersFrom(index: number): number {
  let total = 0;
  let reach = 1;
  for (let pair = Math.max(0, index); pair < CONTINUE_AFTER_PAIR.length; pair += 1) {
    total += reach;
    reach *= CONTINUE_AFTER_PAIR[pair];
  }
  return total;
}

export type WalkStep =
  | { step: "quality" }
  | { step: "gate" }
  | { step: "stepA" }
  | { step: "closer"; index: number };

/** Expected walk time left (ms) when `step` is about to start. */
export function walkRemainingMs(step: WalkStep): number {
  const closersFrom = (index: number) => expectedClosersFrom(index) * CALL_MEDIAN_MS.closer;
  switch (step.step) {
    case "quality":
      return CALL_MEDIAN_MS.quality + CALL_MEDIAN_MS.gate + PAST_BABY_GATE * (CALL_MEDIAN_MS.stepA + closersFrom(0));
    case "gate":
      return CALL_MEDIAN_MS.gate + PAST_BABY_GATE * (CALL_MEDIAN_MS.stepA + closersFrom(0));
    case "stepA":
      return CALL_MEDIAN_MS.stepA + closersFrom(0);
    case "closer":
      return closersFrom(step.index);
  }
}

export function stageOfWalk(step: WalkStep): ProgressStage {
  return step.step === "quality" ? "photo" : "body";
}

/**
 * Age scan: the walk runs beside the cross-check, so the time left is the
 * longer of the two, plus a second to save the result.
 */
export function ageEtaMs(input: { walk: WalkStep | "done"; crossCheckStartedAt: number | null; now: number }): number {
  const walk = input.walk === "done" ? 0 : walkRemainingMs(input.walk);
  const cross = input.crossCheckStartedAt == null
    ? 0
    : Math.max(0, CALL_MEDIAN_MS.crossCheck - (input.now - input.crossCheckStartedAt));
  return Math.round(Math.max(walk, cross) + CALL_MEDIAN_MS.finish);
}

export type ProgressSink = (progress: ScanProgress) => void;

/**
 * Tracks one age scan. The walk reports each call; when the walk is done and the
 * cross-check is still running, the stage is "crosscheck".
 */
export function ageProgress(sink: ProgressSink, options?: { startedAt?: number; now?: () => number; crossCheck?: boolean }) {
  const now = options?.now ?? Date.now;
  const startedAt = options?.startedAt ?? now();
  let crossAt: number | null = options?.crossCheck === false ? null : now();
  let walk: WalkStep | "done" = { step: "quality" };
  const emit = (stage: ProgressStage) => {
    const at = now();
    sink({ stage, etaMs: ageEtaMs({ walk, crossCheckStartedAt: crossAt, now: at }), startedAt, at });
  };
  return {
    walkStep(step: WalkStep) {
      walk = step;
      emit(stageOfWalk(step));
    },
    walkDone() {
      walk = "done";
      emit(crossAt != null ? "crosscheck" : "finishing");
    },
    crossCheckDone() {
      crossAt = null;
      if (walk === "done") emit("finishing");
    },
    finishing() {
      walk = "done";
      crossAt = null;
      emit("finishing");
    },
  };
}

/** One-call scans (Quick Check plain read, B&C score). */
export function singleCallProgress(kind: "plain" | "score", startedAt: number, now = Date.now()): ScanProgress {
  const median = kind === "plain" ? CALL_MEDIAN_MS.plain : CALL_MEDIAN_MS.score;
  return { stage: "photo", etaMs: median + CALL_MEDIAN_MS.finish, startedAt, at: now };
}

/** The progress a new job starts with, before any call has reported. */
export function initialProgress(kind: "age" | "plain" | "score", now = Date.now()): ScanProgress {
  if (kind !== "age") return singleCallProgress(kind, now, now);
  return { stage: "photo", etaMs: ageEtaMs({ walk: { step: "quality" }, crossCheckStartedAt: now, now }), startedAt: now, at: now };
}
