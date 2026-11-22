/**
 * Parse and decision rules from the tested stack.
 * Quality decisions follow e5_quality_v5.py. Closer decisions follow
 * run_e5_stack_r55v3_full51.py. Prompt wording lives in the text files.
 */

import { deerPresentValue, type DeerPresentAnswer } from "./no-deer.js";

export const RETAKE_MESSAGES: Record<string, string> = {
  view_angle: "Try a side-on shot so the chest, belly, and rump are all visible.",
  standing_upright: "Try a photo of the deer standing, not bedded, with the body upright.",
  head_position: "Try again when the deer's head is up, so the neck and back line are easy to see.",
  belly_waist_visible: "Try a side-on shot with the belly and waist clear of grass, trees, or other deer.",
  neck_chest_visible: "Try a side-on shot with the neck and chest clear of trees, brush, or other deer.",
  subject_separable: "Try a photo of just one deer, with no other deer overlapping its body.",
  deer_large_enough: "Get closer or zoom in until the body fills the frame.",
  contour_readable: "Get closer or zoom in, and hold still, so the belly, neck, and back are sharp.",
};

/**
 * v5 uses this when more than one check fails. The v1 module that defined the
 * original sentence was not in the tested upload, so this line is the
 * multi-issue message in that same voice.
 */
export const RETAKE_MESSAGE_DEFAULT = "Try a clearer side-on photo of one deer standing with its head up, so the chest, belly, and back are easy to see.";

const QUALITY_KEYS = [
  "view_angle",
  "standing_upright",
  "head_position",
  "belly_waist_visible",
  "neck_chest_visible",
  "legs_judgeable",
  "subject_separable",
  "deer_large_enough",
  "contour_readable",
  "lighting",
] as const;

export type QualityKey = (typeof QUALITY_KEYS)[number];
export type QualityFields = Partial<Record<QualityKey, string>>;

export interface QualityDecision {
  decision: "RETAKE" | "AGEABLE";
  fails: string[];
  retake_message: string;
}

export interface CloserParse {
  closer: "YOUNGER" | "OLDER" | "RANGE" | "";
  reason: string;
  hunterCue: string;
  ok: boolean;
}

/** Top-down pairs, older then younger, matching the tested walk. */
export const PAIRS: Array<[number, number]> = [
  [5.5, 4.5],
  [4.5, 3.5],
  [3.5, 2.5],
  [2.5, 1.5],
];

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = trimmed.slice(start, end + 1);
  const parsed = tryParse(slice);
  if (parsed) return parsed;
  const loose = slice
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, "$1\"$2\":")
    .replace(/:\s*(YOUNGER|OLDER|RANGE|YES|NO|BABY|NOT_BABY|BROADSIDE|QUARTERING|HEAD_ON|REAR|CANT_TELL|UP|SLIGHT_DIP|DOWN_FEEDING|DAY|NIGHT_IR|NIGHT_OTHER)\b/g, ": \"$1\"");
  return tryParse(loose);
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type DeerAnswer = DeerPresentAnswer;

/**
 * Only an explicit NO means no deer. A missing field, YES, or CANT_TELL
 * stays "present" or "unknown", and both keep the normal age path.
 * A false "no deer" on a real deer is the miss we refuse to make.
 */
export function deerAnswer(text: string): DeerAnswer {
  const json = extractJsonObject(text);
  if (!json) return "unknown";
  return deerPresentValue(json.deer_present);
}

export function parseQuality(text: string): QualityFields | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  if (typeof json.view_angle !== "string" || typeof json.standing_upright !== "string") return null;
  const fields: QualityFields = {};
  for (const key of QUALITY_KEYS) {
    const value = json[key];
    if (typeof value === "string" && value.trim()) fields[key] = value.trim().toUpperCase();
  }
  return fields;
}

/** v5 rule: legs never retake, and CANT_TELL never retakes. */
/** A photo-quality retake because the deer is too small or too soft to read body shape. */
export function isSizeRetake(result: { kind?: string; fails?: string[]; message?: string }): boolean {
  if (result.kind !== "retake") return false;
  const fails = result.fails ?? [];
  if (fails.includes("deer_large_enough") || fails.includes("contour_readable")) return true;
  return typeof result.message === "string" && /Get closer or zoom in/i.test(result.message);
}

export function decideQuality(fields: QualityFields): QualityDecision {
  const fails: string[] = [];
  if (fields.view_angle === "HEAD_ON" || fields.view_angle === "REAR") fails.push("view_angle");
  if (fields.standing_upright === "NO") fails.push("standing_upright");
  if (fields.head_position === "DOWN_FEEDING") fails.push("head_position");
  for (const key of ["belly_waist_visible", "neck_chest_visible", "subject_separable", "deer_large_enough", "contour_readable"] as const) {
    if (fields[key] === "NO") fails.push(key);
  }
  // Minimum size: CANT_TELL never retakes on its own, but if we also cannot
  // clearly read the body contour, do not age a distant speck.
  if (fields.deer_large_enough !== "YES" && fields.deer_large_enough !== "NO" && fields.contour_readable !== "YES") {
    fails.push("deer_large_enough");
  }
  if (fails.length === 0) {
    return { decision: "AGEABLE", fails: [], retake_message: "" };
  }
  // A too-small or too-soft deer always gets the get-closer tip, even when other
  // checks also failed (a distant speck often fails several at once).
  if (fails.includes("deer_large_enough")) {
    return { decision: "RETAKE", fails, retake_message: RETAKE_MESSAGES.deer_large_enough };
  }
  if (fails.includes("contour_readable")) {
    return { decision: "RETAKE", fails, retake_message: RETAKE_MESSAGES.contour_readable };
  }
  const tip = RETAKE_MESSAGES[fails[0]] ?? RETAKE_MESSAGE_DEFAULT;
  return {
    decision: "RETAKE",
    fails,
    retake_message: fails.length === 1 ? tip : RETAKE_MESSAGE_DEFAULT,
  };
}

/**
 * BABY only when both factual checks are YES, which is the gate prompt's rule.
 * A model "gate" field cannot override a NO.
 */
export function parseGate(text: string): "BABY" | "NOT_BABY" | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  const thin = String(json.thin_body ?? "").trim().toUpperCase();
  const face = String(json.baby_face ?? "").trim().toUpperCase();
  if (thin !== "YES" && thin !== "NO") return null;
  if (face !== "YES" && face !== "NO") return null;
  return thin === "YES" && face === "YES" ? "BABY" : "NOT_BABY";
}

export function parseCloser(text: string, allowRange: boolean): CloserParse {
  const json = extractJsonObject(text);
  let closer = "";
  let reason = "";
  let hunterCue = "";
  if (json) {
    closer = String(json.closer ?? "").trim().toUpperCase();
    reason = typeof json.reason === "string" ? json.reason.trim() : "";
    const cue = json.hunter_cue ?? json.hunterCue;
    hunterCue = typeof cue === "string" ? cue.trim() : "";
  }
  if (closer !== "YOUNGER" && closer !== "OLDER" && closer !== "RANGE") {
    const match = text.match(/\bcloser\b["']?\s*[:=]\s*["']?(YOUNGER|OLDER|RANGE)\b/i);
    closer = match ? match[1].toUpperCase() : "";
  }
  const named = closer === "YOUNGER" || closer === "OLDER" || closer === "RANGE";
  const ok = closer === "YOUNGER" || closer === "OLDER" || (allowRange && closer === "RANGE");
  return {
    closer: named ? closer as CloserParse["closer"] : "",
    reason,
    hunterCue,
    ok,
  };
}

export function formatFinal(low: number, high: number): string {
  const side = (age: number) => (age >= 5.5 ? "5.5+" : String(age));
  if (low === high) return side(low);
  return `${side(low)}–${side(high)}`;
}

export function allowRange(younger: number, older: number): boolean {
  return (younger === 4.5 && older === 5.5)
    || (younger === 3.5 && older === 4.5)
    || (younger === 2.5 && older === 3.5);
}
