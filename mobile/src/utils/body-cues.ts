/**
 * Short cues for the age-result body list.
 * Old payloads only have a label (often a filler-heavy, cut-off sentence).
 * A newer payload may add optional shortCue, detail, lean, ageWeight, or anchor.
 */

import type { BodyFeatureOverlay } from "../types/deer-scoring";

export type AgeLean = "older" | "younger" | "neutral";

export const LEAN_WORD: Record<AgeLean, string> = {
  older: "Older",
  younger: "Younger",
  neutral: "Neutral",
};

const LEADING_FILLER = [
  /^the recorded\b(?:(?!\bis described as\b).){0,120}?\bis described as\b[\s,.:;-]*/i,
  /^the recorded\b[\s,.:;-]*/i,
  /^is described as\b[\s,.:;-]*/i,
];

const DANGLING = /^(a|an|the|and|or|of|to|with|into|as|in|on|for|from)$/i;

export interface BodyRegionInput {
  featureId: string;
  name: string;
  label?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  shortCue?: string;
  detail?: string;
  lean?: string;
  direction?: string;
  ageWeight?: number;
  cue?: { ageWeight?: number };
  anchor?: { x?: number; y?: number };
}

export interface BodyRegionRow {
  featureId: string;
  number: number;
  name: string;
  cue: string;
  detail: string;
  lean?: AgeLean;
  anchor: { x: number; y: number };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Drops leading "The recorded … is described as", "The recorded", and "is described as". */
export function stripFiller(text: string): string {
  let value = clean(text);
  for (let pass = 0; pass < 4; pass += 1) {
    const next = LEADING_FILLER.reduce((current, pattern) => current.replace(pattern, ""), value).trim();
    if (next === value) break;
    value = next;
  }
  return value.replace(/^[,.:;-]+\s*/, "").trim();
}

export function plainExplanation(text: string): string {
  return stripFiller(clean(text).replace(/[…]+$/g, ""));
}

/** A plain cue of at most `maxWords` words. Trailing joining words are dropped. */
export function shortCue(text: string, maxWords = 8): string {
  const plain = plainExplanation(text);
  if (!plain) return "";
  const words = plain.split(" ");
  if (words.length <= maxWords) return plain.replace(/[.,;:]+$/g, "");
  const kept = words.slice(0, maxWords);
  while (kept.length > 1 && DANGLING.test(kept[kept.length - 1].replace(/[.,;:]+$/g, ""))) {
    kept.pop();
  }
  return kept.join(" ").replace(/[.,;:]+$/g, "");
}

export function ageLean(row: {
  lean?: string;
  direction?: string;
  ageWeight?: number;
  cue?: { ageWeight?: number };
}): AgeLean | undefined {
  const named = leanWord(row.lean) ?? leanWord(row.direction);
  if (named) return named;
  const weight = typeof row.ageWeight === "number" ? row.ageWeight : row.cue?.ageWeight;
  if (typeof weight !== "number" || !Number.isFinite(weight)) return undefined;
  if (weight > 0) return "older";
  if (weight < 0) return "younger";
  return "neutral";
}

function leanWord(value: unknown): AgeLean | undefined {
  if (value === "older" || value === "younger" || value === "neutral") return value;
  return undefined;
}

function withoutName(label: string, name: string): string {
  const text = clean(label);
  if (!text || (name && text.toLowerCase() === name.toLowerCase())) return "";
  const prefix = `${name}:`;
  if (name && text.toLowerCase().startsWith(prefix.toLowerCase())) return text.slice(prefix.length).trim();
  return text;
}

function anchorOf(row: BodyRegionInput): { x: number; y: number } {
  const x = row.anchor?.x;
  const y = row.anchor?.y;
  if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
    return { x: clampPct(x), y: clampPct(y) };
  }
  return {
    x: clampPct(row.boundingBox.x + row.boundingBox.width / 2),
    y: clampPct(row.boundingBox.y + row.boundingBox.height / 2),
  };
}

/**
 * Notes that are not already the line under the photo.
 * A shortened on-photo label does not hide a longer note.
 */
export function extraBodyNotes(notes: string[], overlays: BodyRegionInput[]): string[] {
  const shown = regionRows(overlays).flatMap((row) =>
    [row.detail, row.cue].filter(Boolean).map((line) => line.toLowerCase()),
  );
  const out: string[] = [];
  for (const note of notes) {
    const plain = plainExplanation(note);
    if (!plain) continue;
    const key = plain.toLowerCase();
    const covered = shown.some((line) => line === key || (line.length >= key.length && line.startsWith(key)));
    if (!covered && !out.some((line) => line.toLowerCase() === key)) out.push(plain);
  }
  return out;
}

/** One numbered row per overlay, in payload order. The anchor is the box center unless one was sent. */
export function regionRows(overlays: BodyRegionInput[]): BodyRegionRow[] {
  return overlays.map((row, index) => {
    const name = clean(row.name) || row.featureId;
    const provided = row.shortCue ? shortCue(row.shortCue) : "";
    const source = plainExplanation(row.detail || withoutName(row.label ?? "", name));
    const cue = provided || shortCue(source);
    const detail = source || provided;
    const lean = ageLean(row);
    return {
      featureId: row.featureId,
      number: index + 1,
      name,
      cue,
      detail,
      ...(lean ? { lean } : {}),
      anchor: anchorOf(row),
    };
  });
}

/** Optional fields from a server overlay. Missing fields stay missing so an old payload is unchanged. */
export function optionalOverlayFields(row: Record<string, unknown>): Partial<BodyFeatureOverlay> {
  const extra: Partial<BodyFeatureOverlay> = {};
  const detail = clean(row.detail);
  const cue = clean(row.shortCue);
  const lean = leanWord(row.lean) ?? leanWord(row.direction);
  const anchor = row.anchor;
  if (detail) extra.detail = detail;
  if (cue) extra.shortCue = cue;
  if (lean) extra.lean = lean;
  if (row.ageWeight != null && row.ageWeight !== "" && Number.isFinite(Number(row.ageWeight))) {
    extra.ageWeight = Number(row.ageWeight);
  }
  if (anchor && typeof anchor === "object") {
    const point = anchor as { x?: unknown; y?: unknown };
    const x = typeof point.x === "number" ? point.x : Number(point.x);
    const y = typeof point.y === "number" ? point.y : Number(point.y);
    if (Number.isFinite(x) && Number.isFinite(y)) extra.anchor = { x, y };
  }
  return extra;
}
