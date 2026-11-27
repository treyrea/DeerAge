/**
 * What the hunter sees for a live deer with no antlers.
 * The server sends sex and age. This file owns the words, so an older
 * payload that omits them stays today's no-antlers message.
 */

import type { AntlerlessRead, DeerScoringResult } from "../types/deer-scoring";

export const BUTTON_BUCK_NOTE =
  "Check the top of the head for small bumps. A button buck looks a lot like a doe fawn.";

export const PROBABLY_DOE = "Probably a doe";
export const FAWN_AGE = "Fawn";
export const CANT_TELL_AGE = "Can't tell the age from this photo";
export const CANT_TELL_REASON = "Adult doe ages can't be read reliably from one photo yet.";
export const YOUNG_BUCK = "Could be a young buck";
export const YOUNG_BUCK_REASON = "Head bumps or a thick neck seen. Try a closer photo of the top of the head.";

/** Null unless this is a doe or a possible young buck the new screen can show. */
export function antlerlessView(sex: unknown, age: unknown): AntlerlessRead | null {
  if (sex === "probably_doe" && age === "fawn") {
    return { sex: "probably_doe", age: "fawn", headline: PROBABLY_DOE, ageLine: FAWN_AGE, reason: null, note: BUTTON_BUCK_NOTE };
  }
  if (sex === "probably_doe" && age === "cant_tell") {
    return {
      sex: "probably_doe",
      age: "cant_tell",
      headline: PROBABLY_DOE,
      ageLine: CANT_TELL_AGE,
      reason: CANT_TELL_REASON,
      note: BUTTON_BUCK_NOTE,
    };
  }
  if (sex === "buck_possible") {
    return { sex: "buck_possible", age: null, headline: YOUNG_BUCK, ageLine: null, reason: YOUNG_BUCK_REASON, note: null };
  }
  return null;
}

/** Reads the fields added beside the existing no_antlers error. Anything else is today's stop. */
export function antlerlessFromJobError(error: { kind?: unknown; sex?: unknown; age?: unknown } | null | undefined): AntlerlessRead | null {
  if (!error || error.kind !== "antlerless") return null;
  return antlerlessView(error.sex, error.age);
}

export function antlerlessListLine(read: AntlerlessRead): string {
  if (read.age === "fawn" && read.ageLine) return `${read.headline} · ${read.ageLine}`;
  return read.headline;
}

/** A saved scan the history screen can open. It is not a buck age and not a rack score. */
export function antlerlessHistoryResult(input: {
  imageUri: string;
  read: AntlerlessRead;
  mode: "age" | "quick";
}): DeerScoringResult {
  const now = new Date();
  return {
    analysisId: `antlerless-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    analysisMode: input.mode,
    capturedFrames: input.imageUri
      ? [{ frameIndex: 0, imageUri: input.imageUri, detectedAntlers: false, confidence: "Low", partialOcclusion: false }]
      : [],
    fusedFrameCount: 1,
    scale: { method: "skull-prior", pixelsPerInch: 0, confidence: "Low" },
    age: {
      estimatedAge: "1.5-2.5 years",
      confidence: "Low",
      factors: { bodySize: "Low", antlerMass: "Low", beamDiameter: "Low", neckSize: "Low" },
    },
    antlerless: input.read,
    processingTime: 0,
    onDeviceProcessing: false,
    cloudRefinementUsed: true,
    distanceAdjusted: false,
  };
}
