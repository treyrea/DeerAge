/**
 * The two-second call on the age result.
 * A range that does not clear the lease minimum is LET HIM WALK.
 * TAKE HIM is only when the low end is at or above that minimum.
 * Missing fields fall back to the age, with no command word.
 */

import { stripMarkdown } from "../../../shared/trait-text";

export type VerdictKind = "take" | "walk" | "look" | "age";

export const VERDICT_WORDS = {
  take: "TAKE HIM",
  walk: "LET HIM WALK",
  look: "NEED A BETTER LOOK",
} as const;

export const FIELD_READ_NOTE = "A field read from the photo, not a jawbone age.";
export const SET_MINIMUM_PROMPT = "Set a lease minimum so the next buck is a clear call.";
export const NO_DEER_TITLE = "No deer found";
export const NO_DEER_TIP = "Get the whole deer in frame, broadside if you can, and try again.";

export const BLIND = {
  bg: "#121410",
  ink: "#E6E0D4",
  muted: "#9C9486",
  line: "#2C2A24",
  walk: "#E0A45A",
  take: "#7EBF93",
  look: "#B7B3A8",
  button: "#C4A15A",
  buttonInk: "#1A1814",
};

export function minimumIsSet(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function formatMinimum(value: number): string {
  if (value >= 6.5) return "6.5+";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function verdictKind(input: {
  fieldCall?: string | null;
  meetsMinimum?: boolean;
  imageQuality?: string | null;
  minimum?: number | null;
  shootOrPass?: boolean;
}): VerdictKind {
  if (input.imageQuality === "poor") return "look";
  if (input.shootOrPass === false) return "age";
  if (!minimumIsSet(input.minimum)) return "age";
  if (input.fieldCall === "SHOOTER") return "take";
  if (input.fieldCall === "LET WALK" || input.fieldCall === "BORDERLINE") return "walk";
  return input.meetsMinimum ? "take" : "walk";
}

export function verdictWord(kind: VerdictKind, copy?: { take?: string; walk?: string; look?: string }): string {
  const pick = (value: string | undefined, fallback: string) => {
    const text = value?.trim();
    return text ? text : fallback;
  };
  if (kind === "take") return pick(copy?.take, VERDICT_WORDS.take);
  if (kind === "walk") return pick(copy?.walk, VERDICT_WORDS.walk);
  if (kind === "look") return pick(copy?.look, VERDICT_WORDS.look);
  return "";
}

export function verdictColor(kind: VerdictKind): string {
  if (kind === "take") return BLIND.take;
  if (kind === "walk") return BLIND.walk;
  if (kind === "look") return BLIND.look;
  return BLIND.ink;
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripMarkdown(value).replace(/\s+/g, " ").trim();
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[.!?]+$/g, "");
}

function isCutOff(shorter: string, longer: string): boolean {
  const brief = fold(shorter);
  const full = fold(longer);
  if (!brief || !full || brief.length >= full.length) return false;
  return full.startsWith(brief);
}

function uniqueClues(lines: string[], lookFor: string): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    if (lookFor && (fold(line) === fold(lookFor) || isCutOff(line, lookFor) || isCutOff(lookFor, line))) continue;
    const earlier = kept.findIndex((item) => fold(item) === fold(line) || isCutOff(line, item) || isCutOff(item, line));
    if (earlier >= 0) {
      if (line.length > kept[earlier].length) kept[earlier] = line;
      continue;
    }
    const key = fold(line);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
  }
  return kept;
}

function withArea(area: string, text: string): string {
  if (!area || /^(body|cue|what to look for)$/i.test(area)) return text;
  if (text.toLowerCase().startsWith(area.toLowerCase())) return text;
  return `${area}: ${text}`;
}

/**
 * lookFor is shown once. reasons, when the server sent the array, are the only
 * body clues. An older payload is de-duplicated here, including a 90-character cut.
 */
export function bodyRead(input: {
  lookFor?: string | null;
  hunterCue?: string | null;
  reasons?: unknown;
  cueBullets?: { area?: string; text?: string }[] | null;
  detectedCues?: { displayName?: string; detectedPattern?: string; explanation?: string }[] | null;
}): { lookFor: string; clues: string[] } {
  const lookFor = clean(input.lookFor) || clean(input.hunterCue);
  const reasonLines = Array.isArray(input.reasons)
    ? input.reasons.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : null;
  // An empty reasons array means "no extra clues" only when a look-for line is already showing.
  // With no line at all, a cue bullet is the written reason and must not be dropped.
  if (reasonLines && (reasonLines.length > 0 || lookFor)) {
    return { lookFor, clues: uniqueClues(reasonLines, lookFor) };
  }
  const fromBullets = (input.cueBullets ?? []).map((bullet) => withArea(clean(bullet.area), clean(bullet.text)));
  const fromDetected = (input.detectedCues ?? []).flatMap((cue) => {
    const pattern = clean(cue.detectedPattern);
    const explanation = clean(cue.explanation);
    const name = clean(cue.displayName);
    if (pattern) return [pattern];
    if (explanation && fold(explanation) !== fold(name)) return [explanation];
    if (name && name.split(" ").length > 3) return [name];
    return [];
  });
  return { lookFor, clues: uniqueClues([...fromBullets, ...fromDetected], lookFor) };
}
