/**
 * Cue text only. Does not choose an age.
 * Observations are the Step A notes, or the cross-check body facts when Step A never ran.
 * The side-on tip is added only when the pose check said the deer is not broadside.
 */

import { stripMarkdown } from "../trait-text.js";
import { SIDE_ON_TIP, type CrossCheck } from "./crosscheck.js";

const NOT_BROADSIDE = new Set(["QUARTERING", "HEAD_ON", "REAR"]);
const CONFLICT_RULES = new Set(["R1_old_call_young_rack", "R5_young_range_strong_rack"]);

export function poseNeedsSideOn(viewAngle: string | undefined): boolean {
  return NOT_BROADSIDE.has((viewAngle ?? "").trim().toUpperCase());
}

export function showSideOnTip(rule: string | undefined, viewAngle: string | undefined, fails?: string[]): boolean {
  if (!rule || !CONFLICT_RULES.has(rule)) return false;
  if (poseNeedsSideOn(viewAngle)) return true;
  return (fails ?? []).includes("view_angle");
}

export function applySideOnTip(text: string, show: boolean): string {
  const base = text.split(SIDE_ON_TIP).join(" ").replace(/\s+/g, " ").trim();
  if (!show) return base;
  if (base.toLowerCase().includes(SIDE_ON_TIP.toLowerCase())) return base;
  return base ? `${base} ${SIDE_ON_TIP}` : SIDE_ON_TIP;
}

/** Short sentences from a Step A note. Blank and duplicate lines are dropped. */
export function observationCues(text: string | undefined, limit = 4): string[] {
  const raw = stripMarkdown(text ?? "").replace(/\r/g, "").trim();
  if (!raw) return [];
  const pieces = raw.split(/\n+/).flatMap((line) => {
    const cleaned = line.replace(/^[\s*\-•]+/, "").replace(/\s+/g, " ").trim();
    if (!cleaned) return [];
    return cleaned.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  });
  const cues: string[] = [];
  const seen = new Set<string>();
  for (const piece of pieces) {
    let sentence = piece.replace(/\s+/g, " ").trim();
    if (sentence.length > 140) {
      const cut = sentence.slice(0, 140);
      const last = cut.lastIndexOf(" ");
      sentence = (last > 40 ? cut.slice(0, last) : cut).trim();
    }
    sentence = sentence.replace(/[;:,]+$/, "");
    if (!sentence) continue;
    if (!/[.!?]$/.test(sentence)) sentence = `${sentence}.`;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cues.push(sentence);
    if (cues.length >= limit) break;
  }
  return cues;
}

/** Body facts from the cross-check. CANT_TELL and rack measurements are left out. */
export function crossCheckCues(cc: CrossCheck | null | undefined): string {
  if (!cc) return "";
  const lines: string[] = [];
  if (cc.legs_vs_chest === "LEGS_LONGER") lines.push("Legs look longer than the chest.");
  if (cc.legs_vs_chest === "LEGS_SHORTER") lines.push("Legs look shorter than the chest.");
  if (cc.legs_vs_chest === "ABOUT_EQUAL") lines.push("Legs and chest look about equal.");
  if (cc.belly_line === "TUCK_UP") lines.push("The belly tucks up.");
  if (cc.belly_line === "STRAIGHT") lines.push("The belly line is straight.");
  if (cc.belly_line === "SAG") lines.push("The belly sags.");
  if (cc.back_line === "LEVEL") lines.push("The back line is level.");
  if (cc.back_line === "SWAYED") lines.push("The back line is swayed.");
  if (cc.front_vs_rear === "FRONT_MUCH_HEAVIER") lines.push("The front end is heavier than the rear.");
  if (cc.front_vs_rear === "SIMILAR") lines.push("The front and rear look similar.");
  if (cc.brisket === "YES") lines.push("A brisket shows under the chest.");
  return observationCues(lines.join("\n")).join(" ");
}
