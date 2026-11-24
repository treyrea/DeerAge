/**
 * Live-buck gate. DeerAge ages a standing buck.
 * A harvested deer or a deer with no antlers stops before any age or shoot-or-pass call.
 * A spike, buttons, velvet, or a head that is hidden stays on the normal path.
 *
 * Installed age builds show a retake as "NEED A BETTER LOOK" plus the server message,
 * and no_antlers as "NO ANTLERS VISIBLE" plus the server message. Neither screen
 * shows an age, "LET HIM WALK", or "Save pre-shot record".
 */

import { extractJsonObject } from "./rules.js";

export const HARVESTED_MESSAGE =
  "DeerAge ages live standing deer. This deer looks harvested or dead, so there is no pre-shot call. For an accurate age, check the teeth on the lower jawbone.";

export const NO_ANTLERS_MESSAGE =
  "No antlers are visible. DeerAge is built for live bucks. A doe, a fawn, or a deer with no antlers in the frame does not get an age or a shoot-or-pass call.";

export type SubjectStop = "harvested" | "no_antlers";

export interface SubjectFacts {
  posture: "STANDING" | "BEDDED" | "DEAD" | "HANGING" | "CANT_TELL";
  antlers: "YES" | "NO" | "CANT_TELL";
}

const POSTURES = new Set(["STANDING", "BEDDED", "DEAD", "HANGING", "CANT_TELL"]);
const ANTLERS = new Set(["YES", "NO", "CANT_TELL"]);

/** Appended to the one-read Quick Check prompt. Missing lines mean "do not stop". */
export const QUICK_SUBJECT_TAIL = `After those lines, add two more lines and do not change the age:
POSTURE: STANDING, BEDDED, DEAD, HANGING, or CANT_TELL. Use DEAD for a deer lying dead on its side, on the ground, on a tailgate or truck bed, or field-dressed. Use HANGING for a deer hung from a gambrel or pole. A standing or bedded live deer is not DEAD.
ANTLERS: YES, NO, or CANT_TELL. YES if any antler is visible, including spikes, buttons, velvet, or one side. NO only when the head is visible and there are no antlers. CANT_TELL if the head is hidden, cropped, or turned away.`;

/** Reads the two Quick Check lines. A reply that omits them does not stop. */
export function subjectFromQuickText(text: string): SubjectFacts | null {
  const posture = text.match(/\bPOSTURE:\s*(STANDING|BEDDED|DEAD|HANGING|CANT_TELL)\b/i);
  const antlers = text.match(/\bANTLERS:\s*(YES|NO|CANT_TELL)\b/i);
  if (!posture || !antlers) return null;
  return parseSubject(JSON.stringify({ posture: posture[1], antlers: antlers[1] }));
}

export function subjectPrompt(): string {
  return `Subject check. Look only at this photo. Do not age the deer. Do not name an age. Answer two facts. If you are unsure, use CANT_TELL. A live standing buck, including a spike or a young buck with small antlers, is STANDING and antlers YES.

POSTURE:
STANDING — alive and on its feet, including a deer feeding with its head down.
BEDDED — alive and lying in a bed, body curled or tucked, not sprawled out dead.
DEAD — clearly dead or harvested: lying flat on its side on the ground, grass, a tailgate, a truck bed, or a processing table; field-dressed; or otherwise obviously not alive. Grass under a dead deer does not make it standing.
HANGING — hung by the hind legs from a gambrel, skinning pole, or meat pole.
CANT_TELL — you cannot tell.

ANTLERS:
YES — any antler is visible, including spikes, buttons, velvet, a broken beam, or one side only.
NO — the top of the head is visible and there are clearly no antlers, spikes, or buttons.
CANT_TELL — the head is cropped, hidden, turned away, or too dark or small to see the top of the head. Use CANT_TELL rather than NO when antlers might simply be out of frame.

Output JSON only:
{"posture":"STANDING or BEDDED or DEAD or HANGING or CANT_TELL","antlers":"YES or NO or CANT_TELL"}`;
}

export function parseSubject(text: string): SubjectFacts | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  const posture = String(json.posture ?? json.subject_posture ?? "").trim().toUpperCase();
  const antlers = String(json.antlers ?? json.antlers_visible ?? "").trim().toUpperCase();
  if (!POSTURES.has(posture) || !ANTLERS.has(antlers)) return null;
  return { posture: posture as SubjectFacts["posture"], antlers: antlers as SubjectFacts["antlers"] };
}

/** DEAD and HANGING stop even when the same reply also names antlers. Antlers NO stops only a deer that is not harvested. */
export function subjectStop(facts: SubjectFacts | null): SubjectStop | null {
  if (!facts) return null;
  if (facts.posture === "DEAD" || facts.posture === "HANGING") return "harvested";
  if (facts.antlers === "NO") return "no_antlers";
  return null;
}

/**
 * Wire shape for builds already on the store.
 * Harvested uses retake so the age screen shows this message as the body, with no stock "not a deer" title.
 * No-antlers uses the code those builds already title "NO ANTLERS VISIBLE", with this message under it.
 */
export function subjectJobError(kind: SubjectStop): { code: "retake" | "no_antlers"; message: string } {
  if (kind === "harvested") return { code: "retake", message: HARVESTED_MESSAGE };
  return { code: "no_antlers", message: NO_ANTLERS_MESSAGE };
}
