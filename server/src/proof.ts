/**
 * A lab tooth age, or a young jawbone age, can owe a free month.
 * An older jawbone disagreement is reviewed and is not granted automatically.
 */

import { classStep } from "./field-call.js";

export const FAIR_LIMIT_NOTE = "Photo aging is an estimate. A jawbone or lab tooth age is the tiebreaker, and a lab tooth age is the strongest proof. If one proves us wrong, your next month is free.";

export type ProofMethod = "lab_tooth" | "jawbone" | "other";
export type ProofEffect = "free_month" | "review" | "none";

export function proofMethodOf(value: unknown): ProofMethod | null {
  if (value === "lab_tooth" || value === "jawbone" || value === "other") return value;
  return null;
}

function disagrees(fieldCall: string, ageYears: number, minimum: number): boolean {
  if (fieldCall !== "SHOOTER" && fieldCall !== "LET WALK") return false;
  const meets = classStep(ageYears) >= classStep(minimum);
  return fieldCall === "SHOOTER" ? !meets : meets;
}

export function proofEffect(input: {
  fieldCall: string;
  minimum: number;
  ageYears: number;
  method: ProofMethod;
}): ProofEffect {
  if (!Number.isFinite(input.ageYears) || input.ageYears <= 0) return "none";
  if (!disagrees(input.fieldCall, input.ageYears, input.minimum)) return "none";
  const step = classStep(input.ageYears);
  if (input.method === "lab_tooth") return "free_month";
  if (input.method === "jawbone" && step <= 2.5) return "free_month";
  if (input.method === "jawbone" && step >= 3.5) return "review";
  return "none";
}

export function disputeReply(input: {
  fieldCall: string;
  age: string;
  cues: { area: string; text: string }[];
  secondAge: number | null;
  agree: boolean | null;
}): string {
  const call = input.fieldCall ? `The call on the photo was ${input.fieldCall}${input.age ? ` at ${input.age}` : ""}.` : "The photo had a call on file.";
  const cueLine = input.cues.length
    ? `Here's what the photo shows: ${input.cues.map((cue) => `${cue.area}: ${cue.text}`).join("; ")}.`
    : "Here's what the photo shows. The read did not name a separate body cue.";
  const look = input.secondAge == null
    ? "A second look has not been run on this photo yet."
    : input.agree
      ? `A second look also reads ${input.secondAge}. The two reads agree.`
      : `A second look reads ${input.secondAge}. The two reads disagree.`;
  return `${cueLine} ${call} ${look} ${FAIR_LIMIT_NOTE}`;
}
