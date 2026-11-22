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
import { PAIRS, allowRange, decideQuality, deerAnswer, formatFinal, parseCloser, parseGate, parseQuality } from "./rules.js";

export interface ModelReply {
  text: string;
}

/** accept is false when the body is empty or unparsed, which asks the caller to retry once. */
export type ModelCaller = (prompt: string, accept?: (text: string) => boolean) => Promise<ModelReply>;

export type WalkResult =
  | { kind: "no_deer" }
  | { kind: "retake"; message: string; fails: string[] }
  | {
      kind: "age";
      label: string;
      low: number;
      high: number;
      isRange: boolean;
      hunterCue: string;
      reason: string;
      /** True only for the baby-gate yearling. R4a needs it. */
      viaBabyGate?: boolean;
    }
  | { kind: "stop"; reason: string };

/** Told before each walk call starts, for the waiting screen's progress bar. */
export type WalkStepListener = (step: WalkStep) => void;

export async function walkHydrogen(call: ModelCaller, onStep?: WalkStepListener): Promise<WalkResult> {
  const prompts = hydrogenPrompts();
  const step = (next: WalkStep) => {
    try {
      onStep?.(next);
    } catch {
      // Progress is display only; it never stops a scan.
    }
  };

  step({ step: "quality" });
  const qualityText = (await call(prompts.quality, (text) => deerAnswer(text) === "absent" || parseQuality(text) != null)).text;
  if (deerAnswer(qualityText) === "absent") return { kind: "no_deer" };
  const quality = parseQuality(qualityText);
  if (!quality) return { kind: "stop", reason: "unparsed quality" };
  const photo = decideQuality(quality);
  if (photo.decision === "RETAKE") {
    return { kind: "retake", message: photo.retake_message, fails: photo.fails };
  }

  step({ step: "gate" });
  const gate = parseGate((await call(prompts.babyGate, (text) => parseGate(text) != null)).text);
  if (!gate) return { kind: "stop", reason: "unparsed baby gate" };
  if (gate === "BABY") {
    return { kind: "age", label: "1.5", low: 1.5, high: 1.5, isRange: false, hunterCue: "", reason: "", viaBabyGate: true };
  }

  step({ step: "stepA" });
  const description = (await call(prompts.stepA, (text) => text.trim().length > 0)).text.trim();
  if (!description) return { kind: "stop", reason: "empty step A" };

  let final: [number, number] | null = null;
  let isRange = false;
  let hunterCue = "";
  let reason = "";

  for (const [index, [older, younger]] of PAIRS.entries()) {
    step({ step: "closer", index });
    const rangeOk = allowRange(younger, older);
    const closerText = (await call(buildCloserPrompt(younger, older, description), (text) => {
      const named = parseCloser(text, true).closer;
      return named === "YOUNGER" || named === "OLDER" || named === "RANGE";
    })).text;
    const parsed = parseCloser(closerText, rangeOk);
    if (rangeOk && !parsed.ok) {
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
    if (final) break;
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
  };
}
