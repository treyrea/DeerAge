/**
 * One-photo Hydrogen walk.
 *
 * Order, from the tested stack plus the quality check that now runs first:
 * 1. Photo quality (e5_quality_v4 prompt, e5_quality_v5 decision).
 * 2. Baby gate. BABY stops at 1.5.
 * 3. Step A body description, binding on every closer.
 * 4. Closers top-down: 5.5 vs 4.5, 4.5 vs 3.5, 3.5 vs 2.5, 2.5 vs 1.5.
 *    OLDER accepts the older age. RANGE accepts that pair's honest range.
 *    YOUNGER moves down. The last pair's YOUNGER is 1.5.
 */

import { buildCloserPrompt, hydrogenPrompts } from "./prompts.js";
import { PAIRS, allowRange, decideQuality, formatFinal, parseCloser, parseGate, parseQuality } from "./rules.js";

export interface ModelReply {
  text: string;
}

export type ModelCaller = (prompt: string) => Promise<ModelReply>;

export type WalkResult =
  | { kind: "retake"; message: string; fails: string[] }
  | {
      kind: "age";
      label: string;
      low: number;
      high: number;
      isRange: boolean;
      hunterCue: string;
      reason: string;
    }
  | { kind: "stop"; reason: string };

export async function walkHydrogen(call: ModelCaller): Promise<WalkResult> {
  const prompts = hydrogenPrompts();

  const quality = parseQuality((await call(prompts.quality)).text);
  if (!quality) return { kind: "stop", reason: "unparsed quality" };
  const photo = decideQuality(quality);
  if (photo.decision === "RETAKE") {
    return { kind: "retake", message: photo.retake_message, fails: photo.fails };
  }

  const gate = parseGate((await call(prompts.babyGate)).text);
  if (!gate) return { kind: "stop", reason: "unparsed baby gate" };
  if (gate === "BABY") {
    return { kind: "age", label: "1.5", low: 1.5, high: 1.5, isRange: false, hunterCue: "", reason: "" };
  }

  const description = (await call(prompts.stepA)).text.trim();
  if (!description) return { kind: "stop", reason: "empty step A" };

  let final: [number, number] | null = null;
  let isRange = false;
  let hunterCue = "";
  let reason = "";

  for (const [older, younger] of PAIRS) {
    const rangeOk = allowRange(younger, older);
    const parsed = parseCloser((await call(buildCloserPrompt(younger, older, description))).text, rangeOk);
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
