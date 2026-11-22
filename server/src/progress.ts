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
  /** Photo check, baby gate and Step A started together: median of the slowest of the three. */
  parallelStart: 10_500,
  /** All closer pairs started together: median of the slowest of four. */
  parallelClosers: 11_100,
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

/** parallel: the call was started together with its neighbours (aging.parallelStart / parallelClosers). */
export type WalkStep =
  | { step: "quality"; parallel?: boolean }
  | { step: "gate"; parallel?: boolean }
  | { step: "stepA"; parallel?: boolean }
  | { step: "closer"; index: number; parallel?: boolean };

/**
 * Expected walk time left (ms) when `step` is reported. sinceMs is how long the
 * parallel batch this step belongs to has been running.
 */
export function walkRemainingMs(step: WalkStep, sinceMs = 0): number {
  const closersSequential = (index: number) => expectedClosersFrom(index) * CALL_MEDIAN_MS.closer;
  const closersParallel = Math.max(0, CALL_MEDIAN_MS.parallelClosers - sinceMs);
  const closers = (index: number, parallel: boolean) => (parallel ? closersParallel : closersSequential(index));
  if (step.parallel && step.step !== "closer") {
    // One batch: what is left of it, then the closers (if he gets past the gate).
    const batch = Math.max(0, CALL_MEDIAN_MS.parallelStart - sinceMs);
    const after = step.step === "stepA" ? 1 : step.step === "gate" ? PAST_BABY_GATE : PAST_BABY_GATE;
    return batch + after * CALL_MEDIAN_MS.parallelClosers;
  }
  switch (step.step) {
    case "quality":
      return CALL_MEDIAN_MS.quality + CALL_MEDIAN_MS.gate + PAST_BABY_GATE * (CALL_MEDIAN_MS.stepA + closersSequential(0));
    case "gate":
      return CALL_MEDIAN_MS.gate + PAST_BABY_GATE * (CALL_MEDIAN_MS.stepA + closersSequential(0));
    case "stepA":
      return CALL_MEDIAN_MS.stepA + closersSequential(0);
    case "closer":
      return closers(step.index, step.parallel === true);
  }
}

export function stageOfWalk(step: WalkStep): ProgressStage {
  return step.step === "quality" ? "photo" : "body";
}

/**
 * Age scan: the walk runs beside the cross-check, so the time left is the
 * longer of the two, plus a second to save the result.
 */
export function ageEtaMs(input: { walk: WalkStep | "done"; crossCheckStartedAt: number | null; now: number; batchStartedAt?: number }): number {
  const since = input.batchStartedAt == null ? 0 : Math.max(0, input.now - input.batchStartedAt);
  const walk = input.walk === "done" ? 0 : walkRemainingMs(input.walk, since);
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
  let batchAt = startedAt;
  const emit = (stage: ProgressStage) => {
    const at = now();
    sink({ stage, etaMs: ageEtaMs({ walk, crossCheckStartedAt: crossAt, now: at, batchStartedAt: batchAt }), startedAt, at });
  };
  return {
    walkStep(step: WalkStep) {
      const previous = walk;
      // A parallel batch starts with the photo check or with the first closer.
      const newBatch = step.step === "quality" || (step.step === "closer" && (step.index === 0 || !step.parallel));
      if (newBatch || previous === "done" || previous.step !== step.step && !step.parallel) batchAt = now();
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
  // Code defaults (parallel walk); the first walk report corrects it within a moment if a switch is off.
  return { stage: "photo", etaMs: ageEtaMs({ walk: { step: "quality", parallel: true }, crossCheckStartedAt: now, now, batchStartedAt: now }), startedAt: now, at: now };
}
