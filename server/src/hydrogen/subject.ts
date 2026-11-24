/**
 * Live-buck gate. DeerAge ages a standing buck in the field, with his body in the frame.
 * One look, before any age call, stops a harvested deer, a deer with no antlers,
 * something that is not a live deer, or a head-only / neck-only photo.
 * A spike, buttons, velvet, or a head that is hidden stays on the normal path.
 * A missing or unsure answer does not stop.
 *
 * Installed age builds show a retake as "NEED A BETTER LOOK" plus the server message,
 * and no_antlers as "NO ANTLERS VISIBLE" plus the server message. Neither screen
 * shows an age, "LET HIM WALK", or "Save pre-shot record". A not-live photo uses
 * that same retake screen. A head-only photo uses the no_body screen those builds
 * already have. Quick Check shows not_deer for a mount so the title is not "get closer".
 */

import { extractJsonObject } from "./rules.js";

export const HARVESTED_MESSAGE =
  "DeerAge ages live standing deer. This deer looks harvested or dead, so there is no pre-shot call. For an accurate age, check the teeth on the lower jawbone.";

export const NO_ANTLERS_MESSAGE =
  "No antlers are visible. DeerAge is built for live bucks. A doe, a fawn, or a deer with no antlers in the frame does not get an age or a shoot-or-pass call.";

export const NO_BODY_MESSAGE =
  "Wait for him to stand broadside. A head-only or neck-only photo does not get an age.";

const POINT_AT_LIVE = "Point DeerAge at a live buck standing broadside.";

export type SubjectStop = "harvested" | "no_antlers" | "not_live" | "no_body";
export type SubjectScene = "LIVE" | "MOUNT" | "DECOY" | "PICTURE" | "DRAWING" | "CANT_TELL";
export type SubjectBody = "FULL" | "HEAD" | "NECK" | "CANT_TELL";

export interface SubjectFacts {
  posture: "STANDING" | "BEDDED" | "DEAD" | "HANGING" | "CANT_TELL";
  antlers: "YES" | "NO" | "CANT_TELL";
  /** Null when the reply omitted it. Omitted does not stop. */
  scene: SubjectScene | null;
  /** Null when the reply omitted it. Omitted does not stop. */
  body: SubjectBody | null;
}

const POSTURES = new Set(["STANDING", "BEDDED", "DEAD", "HANGING", "CANT_TELL"]);
const ANTLERS = new Set(["YES", "NO", "CANT_TELL"]);
const SCENES = new Set<SubjectScene>(["LIVE", "MOUNT", "DECOY", "PICTURE", "DRAWING", "CANT_TELL"]);
const BODIES = new Set<SubjectBody>(["FULL", "HEAD", "NECK", "CANT_TELL"]);

/** Appended to the one-read Quick Check prompt. A missing line does not stop. */
export const QUICK_SUBJECT_TAIL = `After those lines, add these lines and do not change the age:
POSTURE: STANDING, BEDDED, DEAD, HANGING, or CANT_TELL. Use DEAD for a deer lying dead on its side, on the ground, on a tailgate or truck bed, or field-dressed. Use HANGING for a deer hung from a gambrel or pole. A standing or bedded live deer is not DEAD.
ANTLERS: YES, NO, or CANT_TELL. YES if any antler is visible, including spikes, buttons, velvet, or one side. NO only when the head is visible and there are no antlers. CANT_TELL if the head is hidden, cropped, or turned away.
SCENE: LIVE, MOUNT, DECOY, PICTURE, DRAWING, or CANT_TELL. LIVE is a real deer outdoors or on a trail camera, including a dead deer. MOUNT is a taxidermy shoulder mount, head mount, or European skull mount. DECOY is a statue, decoy, or 3D target. PICTURE is a photo of a screen, a print, or a TV. DRAWING is a cartoon or a drawing. CANT_TELL if you are unsure. A live deer is not MOUNT, and a trail-camera photo of a real deer is not PICTURE.
BODY_VISIBLE: FULL, HEAD, NECK, or CANT_TELL. HEAD is only the head. NECK is the head and neck with no chest, belly, or legs. FULL when the chest, belly, or legs are in the frame. CANT_TELL if you are unsure. A small deer whose whole body is in a wide frame is FULL or CANT_TELL, not HEAD.`;

function lastLabel(text: string, label: string, values: readonly string[]): string | null {
  const found = [...text.matchAll(new RegExp(`\\b${label}\\s*:\\s*(${values.join("|")})\\b`, "gi"))];
  const last = found.at(-1)?.[1];
  return last ? last.toUpperCase() : null;
}

/** Reads the Quick Check lines. A reply that omits posture or antlers does not stop. Scene and body are optional. */
export function subjectFromQuickText(text: string): SubjectFacts | null {
  const posture = lastLabel(text, "POSTURE", ["STANDING", "BEDDED", "DEAD", "HANGING", "CANT_TELL"]);
  const antlers = lastLabel(text, "ANTLERS", ["YES", "NO", "CANT_TELL"]);
  if (!posture || !antlers) return null;
  const scene = lastLabel(text, "SCENE", ["LIVE", "MOUNT", "DECOY", "PICTURE", "DRAWING", "CANT_TELL"]);
  const body = lastLabel(text, "BODY_VISIBLE", ["FULL", "HEAD", "NECK", "CANT_TELL"]);
  return parseSubject(JSON.stringify({
    posture,
    antlers,
    ...(scene ? { scene } : {}),
    ...(body ? { body } : {}),
  }));
}

export function subjectPrompt(): string {
  return `Subject check. Look only at this photo. Do not age the deer. Do not name an age. If you are unsure, use CANT_TELL. A live standing buck in the field, including a spike or a young buck with small antlers, is posture STANDING, antlers YES, scene LIVE, and body FULL when his chest, belly, or legs are in the frame.

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

SCENE — is this a live deer in the field?
LIVE — a real deer outdoors or on a trail camera, alive or dead. A deer seen through a window is still LIVE.
MOUNT — a taxidermy shoulder mount, head mount, or European skull mount, including one on a wall.
DECOY — a statue, decoy, or 3D archery target.
PICTURE — a photo of a screen, a print, a magazine, or a TV. A trail-camera photo of a real deer is LIVE, not PICTURE.
DRAWING — a cartoon, drawing, or illustration.
CANT_TELL — you are unsure. Use CANT_TELL rather than MOUNT for a live deer.

BODY — how much of a live deer is in the frame?
FULL — the chest, the belly, or the legs are visible, even if brush hides the hooves or the deer is bedded.
HEAD — only the head is in the frame. The neck, chest, belly, and legs are out of the photo.
NECK — only the head and neck are in the frame, with no chest, belly, or legs.
CANT_TELL — you are unsure, or the deer is a small shape in a wide scene. A distant deer whose whole body is in the frame is FULL or CANT_TELL, not HEAD.

Output JSON only:
{"posture":"STANDING or BEDDED or DEAD or HANGING or CANT_TELL","antlers":"YES or NO or CANT_TELL","scene":"LIVE or MOUNT or DECOY or PICTURE or DRAWING or CANT_TELL","body":"FULL or HEAD or NECK or CANT_TELL"}`;
}

function oneOf<T extends string>(value: unknown, allowed: Set<T>): T | null {
  const text = String(value ?? "").trim().toUpperCase();
  return allowed.has(text as T) ? text as T : null;
}

export function parseSubject(text: string): SubjectFacts | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  const posture = String(json.posture ?? json.subject_posture ?? "").trim().toUpperCase();
  const antlers = String(json.antlers ?? json.antlers_visible ?? "").trim().toUpperCase();
  if (!POSTURES.has(posture) || !ANTLERS.has(antlers)) return null;
  return {
    posture: posture as SubjectFacts["posture"],
    antlers: antlers as SubjectFacts["antlers"],
    scene: oneOf(json.scene ?? json.subject_scene, SCENES),
    body: oneOf(json.body ?? json.body_visible, BODIES),
  };
}

/**
 * A mount, decoy, screen, or drawing stops before a carcass or a doe.
 * Antlers NO stops only a deer that is still a live animal.
 * Head-only or neck-only stops only after those, so a doe or a mount keeps its own message.
 * CANT_TELL and a missing field do not stop.
 */
export function subjectStop(facts: SubjectFacts | null): SubjectStop | null {
  if (!facts) return null;
  if (facts.scene === "MOUNT" || facts.scene === "DECOY" || facts.scene === "PICTURE" || facts.scene === "DRAWING") return "not_live";
  if (facts.posture === "DEAD" || facts.posture === "HANGING") return "harvested";
  if (facts.antlers === "NO") return "no_antlers";
  if (facts.body === "HEAD" || facts.body === "NECK") return "no_body";
  return null;
}

export function notLiveMessage(scene: SubjectScene | null): string {
  if (scene === "DECOY") return `This looks like a decoy or a target, not a live deer. ${POINT_AT_LIVE}`;
  if (scene === "PICTURE") return `This looks like a photo of a screen or a print, not a live deer. ${POINT_AT_LIVE}`;
  if (scene === "DRAWING") return `This looks like a drawing, not a live deer. ${POINT_AT_LIVE}`;
  return `This looks like a mount, not a live deer. ${POINT_AT_LIVE}`;
}

/** The stop and the sentence the hunter sees. Null when this photo can still be aged. */
export function subjectHalt(facts: SubjectFacts | null): { kind: SubjectStop; message: string } | null {
  const kind = subjectStop(facts);
  if (!kind) return null;
  if (kind === "harvested") return { kind, message: HARVESTED_MESSAGE };
  if (kind === "no_antlers") return { kind, message: NO_ANTLERS_MESSAGE };
  if (kind === "no_body") return { kind, message: NO_BODY_MESSAGE };
  return { kind, message: notLiveMessage(facts?.scene ?? null) };
}

/**
 * Wire shape for builds already on the store.
 * Harvested and not-live use retake so the age screen shows this message, with no age.
 * No-antlers uses the code those builds already title "NO ANTLERS VISIBLE".
 * No-body uses the code those builds already title as needing the whole body.
 * Pass message when the stop named a decoy, a screen, or a drawing.
 */
export function subjectJobError(kind: SubjectStop, message?: string): { code: "retake" | "no_antlers" | "no_body"; message: string } {
  if (kind === "harvested") return { code: "retake", message: HARVESTED_MESSAGE };
  if (kind === "no_antlers") return { code: "no_antlers", message: NO_ANTLERS_MESSAGE };
  if (kind === "no_body") return { code: "no_body", message: message?.trim() || NO_BODY_MESSAGE };
  return { code: "retake", message: message?.trim() || notLiveMessage("MOUNT") };
}
