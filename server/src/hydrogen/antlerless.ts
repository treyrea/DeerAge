/**
 * Antlerless notes for a live, full-body deer whose subject read said antlers NO.
 * One extra model call, then this file decides. The model never names an age or a sex.
 * A parse failure or a model error stays today's no-antlers stop.
 */

import { extractJsonObject } from "./rules.js";
import { NO_ANTLERS_MESSAGE, type SubjectFacts } from "./subject.js";
import type { ModelCaller } from "./pipeline.js";

export const ANTLERLESS_NOTES_PROMPT = `Antlerless deer notes. Look only at this photo. Do not name an age, an age class, or whether the deer is a buck or a doe. Answer each item with one of the listed words only. If you are unsure, or the part is hidden, cropped, too dark or too small, use CANT_TELL. If more than one deer is in the photo, describe only the largest, closest deer.

SPOTS: YES or NO or CANT_TELL — white spots on the coat.
BODY_SHAPE: RECTANGLE or SQUARE or CANT_TELL — torso clearly longer (chest to rump) than it is tall (back to belly plus legs), or about as long as tall.
SNOUT: LONG or SHORT or CANT_TELL — nose long and slender compared with the rest of the head, or short and stubby.
EAR_EYE_VS_EYE_NOSE: EAR_EYE_SHORTER or ABOUT_EQUAL or CANT_TELL — distance from the base of the ear to the eye compared with the distance from the eye to the tip of the nose.
EARS_VS_HEAD: LARGE or NORMAL or SHORT or CANT_TELL — ears look large for the head, in proportion, or short for the head.
BELLY: TUCKED or FLAT or SAGGING or CANT_TELL — belly line rises up toward the hind legs, runs level, or hangs below the line of the chest.
BACK: STRAIGHT or SWAYED or CANT_TELL — top line level, or dips noticeably behind the shoulders.
LOOSE_SKIN: YES or NO or CANT_TELL — loose or wrinkled skin on the neck, brisket or face.
LEGS_VS_BODY: LONG or PROPORTIONAL or SHORT or CANT_TELL — legs look long, in proportion, or short next to the depth of the chest.
CROWN: ROUNDED or FLAT or CANT_TELL — top of the head between the ears, seen from the side or front.
HEAD_BUMPS: YES or NO or CANT_TELL — any bump, knob, button, hair whorl lump, or scab or scar on top of the head where antlers grow.
NECK: LONG_SLENDER or SHORT_THICK or CANT_TELL — neck length compared with its thickness.

Output JSON only, with exactly these keys:
{"spots":"","body_shape":"","snout":"","ear_eye_vs_eye_nose":"","ears_vs_head":"","belly":"","back":"","loose_skin":"","legs_vs_body":"","crown":"","head_bumps":"","neck":""}
`;

export type AntlerlessSex = "probably_doe" | "buck_possible" | "unclear";
export type AntlerlessAge = "fawn" | "cant_tell" | null;

export interface AntlerlessNotes {
  spots: "YES" | "NO" | "CANT_TELL";
  body_shape: "RECTANGLE" | "SQUARE" | "CANT_TELL";
  snout: "LONG" | "SHORT" | "CANT_TELL";
  ear_eye_vs_eye_nose: "EAR_EYE_SHORTER" | "ABOUT_EQUAL" | "CANT_TELL";
  ears_vs_head: "LARGE" | "NORMAL" | "SHORT" | "CANT_TELL";
  belly: "TUCKED" | "FLAT" | "SAGGING" | "CANT_TELL";
  back: "STRAIGHT" | "SWAYED" | "CANT_TELL";
  loose_skin: "YES" | "NO" | "CANT_TELL";
  legs_vs_body: "LONG" | "PROPORTIONAL" | "SHORT" | "CANT_TELL";
  crown: "ROUNDED" | "FLAT" | "CANT_TELL";
  head_bumps: "YES" | "NO" | "CANT_TELL";
  neck: "LONG_SLENDER" | "SHORT_THICK" | "CANT_TELL";
}

export interface AntlerlessDecision {
  sex: AntlerlessSex;
  age: AntlerlessAge;
}

const NOTE_FIELDS: { key: keyof AntlerlessNotes; allowed: readonly string[] }[] = [
  { key: "spots", allowed: ["YES", "NO", "CANT_TELL"] },
  { key: "body_shape", allowed: ["RECTANGLE", "SQUARE", "CANT_TELL"] },
  { key: "snout", allowed: ["LONG", "SHORT", "CANT_TELL"] },
  { key: "ear_eye_vs_eye_nose", allowed: ["EAR_EYE_SHORTER", "ABOUT_EQUAL", "CANT_TELL"] },
  { key: "ears_vs_head", allowed: ["LARGE", "NORMAL", "SHORT", "CANT_TELL"] },
  { key: "belly", allowed: ["TUCKED", "FLAT", "SAGGING", "CANT_TELL"] },
  { key: "back", allowed: ["STRAIGHT", "SWAYED", "CANT_TELL"] },
  { key: "loose_skin", allowed: ["YES", "NO", "CANT_TELL"] },
  { key: "legs_vs_body", allowed: ["LONG", "PROPORTIONAL", "SHORT", "CANT_TELL"] },
  { key: "crown", allowed: ["ROUNDED", "FLAT", "CANT_TELL"] },
  { key: "head_bumps", allowed: ["YES", "NO", "CANT_TELL"] },
  { key: "neck", allowed: ["LONG_SLENDER", "SHORT_THICK", "CANT_TELL"] },
];

/**
 * The notes call runs only after not_live, harvested, and head/neck stops.
 * Antlers YES and CANT_TELL never qualify. The body must be the whole deer, and the scene must be live.
 */
export function antlerlessEligible(facts: SubjectFacts | null): boolean {
  if (!facts || facts.antlers !== "NO") return false;
  if (facts.posture === "DEAD" || facts.posture === "HANGING") return false;
  if (facts.scene !== "LIVE") return false;
  if (facts.body !== "FULL") return false;
  return true;
}

function listed(value: unknown, allowed: readonly string[]): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  return allowed.includes(text) ? text : null;
}

/** Null when the reply is not the notes JSON, or any field is missing or not a listed word. */
export function parseAntlerlessNotes(text: string): AntlerlessNotes | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  const notes = {} as AntlerlessNotes;
  for (const field of NOTE_FIELDS) {
    const value = listed(json[field.key], field.allowed);
    if (!value) return null;
    notes[field.key] = value as never;
  }
  return notes;
}

function doeAge(notes: AntlerlessNotes): "fawn" | "cant_tell" {
  if (notes.spots === "YES") return "fawn";
  const fawnSigns = [
    notes.body_shape === "SQUARE",
    notes.snout === "SHORT",
    notes.ear_eye_vs_eye_nose === "ABOUT_EQUAL",
    notes.ears_vs_head === "LARGE",
  ].filter(Boolean).length;
  const adultSigns = [
    notes.body_shape === "RECTANGLE",
    notes.snout === "LONG",
    notes.ear_eye_vs_eye_nose === "EAR_EYE_SHORTER",
    notes.belly === "FLAT" || notes.belly === "SAGGING",
  ].filter(Boolean).length;
  if (fawnSigns >= 3 && adultSigns <= 1) return "fawn";
  return "cant_tell";
}

/**
 * Sex, then age only for a probable doe.
 * There is no adult age. An adult rule sent a fawn to adult in testing.
 */
export function decideAntlerless(notes: AntlerlessNotes): AntlerlessDecision {
  if (notes.head_bumps === "YES") return { sex: "buck_possible", age: null };
  if (notes.neck === "SHORT_THICK" && notes.spots !== "YES") return { sex: "buck_possible", age: null };
  if (notes.head_bumps === "NO") return { sex: "probably_doe", age: doeAge(notes) };
  return { sex: "unclear", age: null };
}

export type AntlerlessOutcome =
  | { kind: "no_antlers"; message: string }
  | { kind: "antlerless"; sex: "probably_doe" | "buck_possible"; age: "fawn" | "cant_tell" | null; message: string };

/**
 * One notes call on the same client as the subject read.
 * A non-empty reply is accepted as-is, so a bad JSON does not trigger the client's retry.
 * A thrown error, or notes that do not parse, falls back to today's no-antlers stop.
 */
export async function readAntlerless(
  call: ModelCaller,
  log: (event: Record<string, unknown>) => void = (event) => {
    console.log(JSON.stringify(event));
  },
): Promise<AntlerlessOutcome> {
  let text = "";
  try {
    text = (await call(ANTLERLESS_NOTES_PROMPT, (body) => body.trim().length > 0)).text;
  } catch (error) {
    log({
      event: "antlerless_notes",
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message.slice(0, 120) : "error",
    });
    return { kind: "no_antlers", message: NO_ANTLERS_MESSAGE };
  }
  const notes = parseAntlerlessNotes(text);
  if (!notes) {
    log({ event: "antlerless_notes", ok: false, reason: "parse" });
    return { kind: "no_antlers", message: NO_ANTLERS_MESSAGE };
  }
  const decision = decideAntlerless(notes);
  log({ event: "antlerless_notes", ok: true, notes, decision });
  if (decision.sex === "unclear") return { kind: "no_antlers", message: NO_ANTLERS_MESSAGE };
  return { kind: "antlerless", sex: decision.sex, age: decision.age, message: NO_ANTLERS_MESSAGE };
}

/**
 * Same no_antlers code and sentence installed builds already show.
 * sex and age sit beside them. An older app ignores the extra fields.
 */
export function antlerlessJobError(outcome: Extract<AntlerlessOutcome, { kind: "antlerless" }>): {
  code: "no_antlers";
  message: string;
  kind: "antlerless";
  sex: "probably_doe" | "buck_possible";
  age: "fawn" | "cant_tell" | null;
} {
  return {
    code: "no_antlers",
    message: NO_ANTLERS_MESSAGE,
    kind: "antlerless",
    sex: outcome.sex,
    age: outcome.age,
  };
}
