/**
 * One-photo Hydrogen walk.
 *
 * Order, from the tested stack plus the quality check that now runs first:
 * 1. Photo quality (e5_quality_v4 prompt, e5_quality_v5 decision).
 * 2. Baby gate. BABY stops at 1.5 and is marked viaBabyGate so a later rule can widen it.
 * 3. Step A body description, binding on every closer.
 * 4. Closers top-down: 5.5 vs 4.5, 4.5 vs 3.5, 3.5 vs 2.5, 2.5 vs 1.5.
 *    OLDER accepts the older age. RANGE accepts that pair's honest range.
 *    YOUNGER moves down. The last pair's YOUNGER is 1.5.
 */

import { buildCloserPrompt, hydrogenPrompts } from "./prompts.js";
import type { WalkStep } from "../progress.js";
import { RETAKE_MESSAGES, PAIRS, allowRange, decideQuality, deerAnswer, formatFinal, parseCloser, parseGate, parseQuality } from "./rules.js";
import { HARVESTED_MESSAGE, NO_ANTLERS_MESSAGE, parseSubject, subjectPrompt, subjectStop, type SubjectFacts } from "./subject.js";

export interface ModelReply {
  text: string;
}

/**
 * accept is false when the body is empty or unparsed, which asks the caller to retry once.
 * signal cancels a call whose answer is no longer needed (a speculative call after the walk ended).
 */
export type ModelCaller = (prompt: string, accept?: (text: string) => boolean, signal?: AbortSignal) => Promise<ModelReply>;

/**
 * How the walk schedules its calls. Both default on; remote config aging.parallelStart /
 * aging.parallelClosers turn them off without a deploy.
 * - parallelStart: photo check, baby gate and Step A start together. Step A and the gate do not
 *   read the photo check's answer, so the answers are the same; only the waiting changes.
 * - parallelClosers: all closer pairs start together once Step A is in (each reads only Step A).
 * Either way the answers are read in the original order with the original rules, so the result
 * equals the one-at-a-time walk for the same model outputs. Calls the walk no longer needs are cancelled.
 */
export interface WalkSchedule {
  parallelStart: boolean;
  parallelClosers: boolean;
  /**
   * Live scans only. Left off in tests so a scripted call list keeps its old order.
   * Asks whether the deer is harvested or has no antlers, in parallel with the photo check.
   */
  subjectCheck?: boolean;
}

export const SEQUENTIAL_WALK: WalkSchedule = { parallelStart: false, parallelClosers: false };

export type WalkResult =
  | { kind: "no_deer" }
  | { kind: "harvested"; message: string }
  | { kind: "no_antlers"; message: string }
  | { kind: "retake"; message: string; fails: string[] }
  | {
      kind: "age";
      label: string;
      low: number;
      high: number;
      isRange: boolean;
      hunterCue: string;
      reason: string;
      /** Step A body notes, or the baby-gate facts. Cue text only. */
      observations?: string;
      /** Photo-quality view_angle. Cue tip only. */
      viewAngle?: string;
      /** True only for the baby-gate yearling. R4a needs it. */
      viaBabyGate?: boolean;
    }
  | { kind: "stop"; reason: string };

/** Told before each walk call starts, for the waiting screen's progress bar. */
export type WalkStepListener = (step: WalkStep) => void;

interface Pending {
  promise: Promise<ModelReply>;
  cancel: () => void;
}

function launch(call: ModelCaller, prompt: string, accept: (text: string) => boolean): Pending {
  const controller = new AbortController();
  const promise = call(prompt, accept, controller.signal);
  // A cancelled or unused call must never surface as an unhandled rejection.
  promise.catch(() => undefined);
  return { promise, cancel: () => controller.abort() };
}

export async function walkHydrogen(
  call: ModelCaller,
  onStep?: WalkStepListener,
  schedule: WalkSchedule = SEQUENTIAL_WALK,
  qualityPrompt?: string,
): Promise<WalkResult> {
  const prompts = hydrogenPrompts();
  const step = (next: WalkStep) => {
    try {
      onStep?.(next);
    } catch {
      // Progress is display only; it never stops a scan.
    }
  };
  const acceptQuality = (text: string) => deerAnswer(text) === "absent" || parseQuality(text) != null;
  const acceptGate = (text: string) => parseGate(text) != null;
  const acceptStepA = (text: string) => text.trim().length > 0;
  const acceptCloser = (text: string) => {
    const named = parseCloser(text, true).closer;
    return named === "YOUNGER" || named === "OLDER" || named === "RANGE";
  };

  step({ step: "quality", parallel: schedule.parallelStart });
  const quality$ = launch(call, qualityPrompt ?? prompts.quality, acceptQuality);
  const subject$ = schedule.subjectCheck
    ? launch(call, subjectPrompt(), (text) => parseSubject(text) != null)
    : null;
  let gate$: Pending | null = schedule.parallelStart ? launch(call, prompts.babyGate, acceptGate) : null;
  let stepA$: Pending | null = schedule.parallelStart ? launch(call, prompts.stepA, acceptStepA) : null;
  const cancelRest = () => {
    gate$?.cancel();
    stepA$?.cancel();
    subject$?.cancel();
  };
  const readSubject = async (): Promise<SubjectFacts | null> => {
    if (!subject$) return null;
    try {
      return parseSubject((await subject$.promise).text);
    } catch {
      return null;
    }
  };

  let qualityText: string;
  try {
    qualityText = (await quality$.promise).text;
  } catch (error) {
    cancelRest();
    throw error;
  }
  if (deerAnswer(qualityText) === "absent") {
    cancelRest();
    return { kind: "no_deer" };
  }
  const quality = parseQuality(qualityText);
  if (!quality) {
    const stop = subjectStop(await readSubject());
    cancelRest();
    // A speck or unreadable frame often comes back as unstructured text.
    // Retake instead of stopping and falling through to a gateway backup
    // that then fails as "couldn't finish this photo." A clear carcass still stops.
    if (stop === "harvested") return { kind: "harvested", message: HARVESTED_MESSAGE };
    return { kind: "retake", message: RETAKE_MESSAGES.deer_large_enough, fails: ["deer_large_enough"] };
  }
  const facts = await readSubject();
  const stop = subjectStop(facts);
  const photo = decideQuality(quality);
  const tooSmall = photo.fails.includes("deer_large_enough") || photo.fails.includes("contour_readable");
  // Lying dead often fails "standing". That retake used to be replaced by a plain age.
  if (stop === "harvested" && !tooSmall) {
    cancelRest();
    return { kind: "harvested", message: HARVESTED_MESSAGE };
  }
  if (photo.decision === "RETAKE") {
    cancelRest();
    return { kind: "retake", message: photo.retake_message, fails: photo.fails };
  }
  if (stop === "no_antlers") {
    cancelRest();
    return { kind: "no_antlers", message: NO_ANTLERS_MESSAGE };
  }

  step({ step: "gate", parallel: schedule.parallelStart });
  gate$ ??= launch(call, prompts.babyGate, acceptGate);
  let gateText: string;
  try {
    gateText = (await gate$.promise).text;
  } catch (error) {
    stepA$?.cancel();
    throw error;
  }
  const gate = parseGate(gateText);
  if (!gate) {
    stepA$?.cancel();
    if (quality.deer_large_enough !== "YES") {
      return { kind: "retake", message: RETAKE_MESSAGES.deer_large_enough, fails: ["deer_large_enough"] };
    }
    return { kind: "stop", reason: "unparsed baby gate" };
  }
  if (gate === "BABY") {
    stepA$?.cancel();
    return {
      kind: "age",
      label: "1.5",
      low: 1.5,
      high: 1.5,
      isRange: false,
      hunterCue: "",
      reason: "",
      observations: "Thin body and a young face.",
      viewAngle: quality.view_angle,
      viaBabyGate: true,
    };
  }

  step({ step: "stepA", parallel: schedule.parallelStart });
  stepA$ ??= launch(call, prompts.stepA, acceptStepA);
  const description = (await stepA$.promise).text.trim();
  gate$ = null;
  stepA$ = null;
  if (!description) {
    if (quality.deer_large_enough !== "YES") {
      return { kind: "retake", message: RETAKE_MESSAGES.deer_large_enough, fails: ["deer_large_enough"] };
    }
    return { kind: "stop", reason: "empty step A" };
  }

  const closers: Array<Pending | null> = PAIRS.map(([older, younger]) =>
    schedule.parallelClosers ? launch(call, buildCloserPrompt(younger, older, description), acceptCloser) : null,
  );
  const cancelClosersFrom = (index: number) => {
    for (let i = index; i < closers.length; i += 1) closers[i]?.cancel();
  };

  let final: [number, number] | null = null;
  let isRange = false;
  let hunterCue = "";
  let reason = "";

  for (const [index, [older, younger]] of PAIRS.entries()) {
    step({ step: "closer", index, parallel: schedule.parallelClosers });
    const rangeOk = allowRange(younger, older);
    const pending = closers[index] ?? launch(call, buildCloserPrompt(younger, older, description), acceptCloser);
    let closerText: string;
    try {
      closerText = (await pending.promise).text;
    } catch (error) {
      cancelClosersFrom(index + 1);
      throw error;
    }
    const parsed = parseCloser(closerText, rangeOk);
    if (rangeOk && !parsed.ok) {
      cancelClosersFrom(index + 1);
      return { kind: "stop", reason: `unparsed ${younger} vs ${older}` };
    }
    if (rangeOk && parsed.closer === "RANGE" && parsed.ok) {
      if (younger === 4.5 && older === 5.5) final = [4.5, 5.5];
      else if (younger === 3.5 && older === 4.5) final = [3.5, 4.5];
      else final = [2.5, 3.5];
      isRange = true;
      hunterCue = parsed.hunterCue;
      reason = parsed.reason;
    } else if (parsed.closer === "OLDER" && parsed.ok) {
      final = [older, older];
      reason = parsed.reason;
    } else if (older === 2.5 && younger === 1.5) {
      final = [1.5, 1.5];
      reason = parsed.reason;
    }
    if (final) {
      cancelClosersFrom(index + 1);
      break;
    }
  }

  if (!final) return { kind: "stop", reason: "no final" };
  return {
    kind: "age",
    label: formatFinal(final[0], final[1]),
    low: final[0],
    high: final[1],
    isRange,
    hunterCue,
    reason,
    observations: description,
    viewAngle: quality.view_angle,
  };
}
