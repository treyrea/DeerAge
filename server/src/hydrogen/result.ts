/**
 * Turns a Hydrogen age into the same result shape the 1.0.9 job already returns.
 * A range that crosses the lease minimum is BORDERLINE. The low end decides a shooter.
 */

import { classLabel, classStep, type FieldCall } from "../field-call.js";

export function hydrogenAgeBody(input: {
  low: number;
  high: number;
  label: string;
  isRange: boolean;
  hunterCue: string;
  reason: string;
  minimum: number;
}): Record<string, unknown> {
  const leaseMinimum = classStep(input.minimum);
  const minimumLabel = classLabel(leaseMinimum);
  const above = input.low + 1e-9 >= leaseMinimum;
  const below = input.high + 1e-9 < leaseMinimum;
  const fieldCall: FieldCall = above ? "SHOOTER" : below ? "LET WALK" : "BORDERLINE";
  const fieldCallNote = above
    ? `Reads ${input.label}, at or above your lease minimum of ${minimumLabel}. This is a field read from the photo, not a jawbone age.`
    : below
      ? `Reads ${input.label}, under your lease minimum of ${minimumLabel}. Let him walk. This is a field read from the photo, not a jawbone age.`
      : `Reads ${input.label}, and your minimum is ${minimumLabel}. Don't risk the fine.`;
  const cue = input.hunterCue.trim();
  const why = input.reason.trim();
  const cueBullets = [
    ...(why ? [{ area: "Body", text: why.slice(0, 90) }] : []),
    ...(cue ? [{ area: "Cue", text: cue.slice(0, 90) }] : []),
  ];
  return {
    ageYears: input.low,
    estimatedAgeYears: input.low,
    ageClass: input.label,
    estimatedAge: input.label,
    ageLabel: input.label,
    isRange: input.isRange,
    hunterCue: cue,
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
    topCues: cue ? [cue] : [],
    visibleParts: [],
    betterAngle: "",
    decision: fieldCall === "SHOOTER" ? "SHOOT" : "LET WALK",
    isValidDeer: true,
    isValidImage: true,
    imageQuality: "good",
  };
}
