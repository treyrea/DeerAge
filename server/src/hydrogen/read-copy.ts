/**
 * One full "what to look for" line, and body reasons that are not that same sentence.
 * Nothing is cut off mid-sentence. The 1.0.9 app still reads hunterCue, cueBullets,
 * and cues. It ignores lookFor and reasons.
 */

import { stripMarkdown } from "../trait-text.js";

export function cleanSentence(value: string): string {
  return stripMarkdown(value).replace(/\s+/g, " ").trim();
}

function fold(value: string): string {
  return cleanSentence(value).toLowerCase().replace(/[.!?]+$/g, "");
}

/** A shorter line the longer one starts with was cut off, not a new clue. */
export function isCutOff(shorter: string, longer: string): boolean {
  const brief = fold(shorter);
  const full = fold(longer);
  if (!brief || !full || brief.length >= full.length) return false;
  return full.startsWith(brief);
}

function sentences(value: string): string[] {
  const text = cleanSentence(value);
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+/).map(cleanSentence).filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

export function readCopy(hunterCue: string, reason: string): { lookFor: string; reasons: string[] } {
  let lookFor = cleanSentence(hunterCue);
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const line of sentences(reason)) {
    if (lookFor && (fold(line) === fold(lookFor) || isCutOff(line, lookFor))) continue;
    if (lookFor && isCutOff(lookFor, line)) {
      lookFor = line;
      continue;
    }
    const key = fold(line);
    if (!key || seen.has(key)) continue;
    const earlier = reasons.findIndex((kept) => isCutOff(line, kept) || isCutOff(kept, line));
    if (earlier >= 0) {
      if (line.length > reasons[earlier].length) reasons[earlier] = line;
      continue;
    }
    seen.add(key);
    reasons.push(line);
  }
  return { lookFor, reasons };
}
