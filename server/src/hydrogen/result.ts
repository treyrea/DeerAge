/**
 * Turns a Hydrogen age into the same result shape the 1.0.9 job already returns.
 * A range that crosses the lease minimum is BORDERLINE. The low end decides a shooter.
 */

import { classLabel, classStep, type FieldCall } from "../field-call.js";
import { fillRangeNote } from "./aging.js";
import { observationCues } from "./cues.js";
import { readCopy } from "./read-copy.js";

export function hydrogenAgeBody(input: {
  low: number;
  high: number;
  label: string;
  isRange: boolean;
  hunterCue: string;
  reason: string;
  minimum: number;
  rangeNote?: string;
  /** Step A notes, or cross-check body facts. Used only when the model sent no cue text. */
  observations?: string;
}): Record<string, unknown> {
  const leaseMinimum = classStep(input.minimum);
  const minimumLabel = classLabel(leaseMinimum);
  const above = input.low + 1e-9 >= leaseMinimum;
  const below = input.high + 1e-9 < leaseMinimum;
  const fieldCall: FieldCall = above ? "SHOOTER" : below ? "LET WALK" : "BORDERLINE";
  const rangeSentence = input.isRange ? fillRangeNote(input.rangeNote, input.label) : "";
  const fieldCallNote = !input.isRange
    ? above
      ? `Reads ${input.label}, at or above your lease minimum of ${minimumLabel}. This is a field read from the photo, not a jawbone age.`
      : below
        ? `Reads ${input.label}, under your lease minimum of ${minimumLabel}. Let him walk. This is a field read from the photo, not a jawbone age.`
        : `Reads ${input.label}, and your minimum is ${minimumLabel}. Don't risk the fine.`
    : above
      ? `${rangeSentence} At or above your lease minimum of ${minimumLabel}. This is a field read from the photo, not a jawbone age.`
      : below
        ? `${rangeSentence} Under your lease minimum of ${minimumLabel}. Let him walk. This is a field read from the photo, not a jawbone age.`
        : `${rangeSentence} Your minimum is ${minimumLabel}. Don't risk the fine.`;
  const why = input.reason.trim();
  const copy = readCopy(input.hunterCue, why);
  let lookFor = copy.lookFor;
  let reasons = copy.reasons;
  if (!lookFor && reasons.length === 0) {
    const fallback = observationCues(input.observations);
    if (fallback.length > 0) {
      lookFor = fallback[0];
      reasons = fallback.slice(1);
    }
  } else if (!lookFor && reasons.length > 0) {
    // A single-class closer often sends a body sentence and no look-for line.
    // Put the first sentence on the card. The rest stay under "Why this age".
    lookFor = reasons[0];
    reasons = reasons.slice(1);
  }
  // Reasons only. The look-for line stays in hunterCue so 1.0.9 does not
  // print a second, cut-off copy of it under "WHY THIS AGE CLASS".
  const cueBullets = reasons.map((text) => ({ area: "Body", text }));
  // When the only sentence is the look-for line, 1.0.9's detail section still
  // needs one full cue or it shows a false "no body features" warning.
  const detail = reasons.length > 0 ? reasons : lookFor ? [lookFor] : [];
  const fromObservations = !copy.lookFor && copy.reasons.length === 0 && Boolean(lookFor);
  const cues = detail.map((text) => ({
    name: "chest_depth",
    displayName: copy.reasons.length > 0 || fromObservations ? "Body" : "What to look for",
    pattern: text,
  }));
  return {
    ageYears: input.low,
    estimatedAgeYears: input.low,
    ageClass: input.label,
    estimatedAge: input.label,
    ageLabel: input.label,
    isRange: input.isRange,
    hunterCue: lookFor,
    lookFor,
    reasons,
    ageReason: why,
    pipeline: "hydrogen",
    confidence: 0,
    overallConfidence: 0,
    fieldCall,
    fieldCallNote,
    leaseMinimum,
    meetsMinimumAge: above,
    minimumAgeThreshold: leaseMinimum,
    shooterPassLabel: fieldCall === "SHOOTER" ? "SHOOTER" : "LET WALK",
    shooterPassReason: fieldCallNote,
    cueBullets,
    cues,
    topCues: detail,
    visibleParts: [],
    betterAngle: "",
    decision: fieldCall === "SHOOTER" ? "SHOOT" : "LET WALK",
    isValidDeer: true,
    isValidImage: true,
    imageQuality: "good",
  };
}
