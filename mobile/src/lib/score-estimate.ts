/**
 * Copy for a photo B&C score. A burst is one viewpoint.
 * The server scoreRange is a ±6% formula, not a measured band, so it is never shown.
 */

export const ONE_ANGLE_LINE = "From one angle — a rough estimate, not a tape score.";
export const MULTI_PHOTO_LINE = "From these photos — still an estimate, not a tape score.";

export const SCORE_ESTIMATE_SHEET_TITLE = "How this works";

export const SCORE_ESTIMATE_BLOCKS = [
  {
    title: "How it works",
    body: "DeerAge estimates Boone & Crockett inches from the photo you gave it: the spread, beams, tines, and mass that are visible.",
  },
  {
    title: "What it is not",
    body: "It is not an official B&C score. Official scores are taped on both sides of the rack by a certified measurer.",
  },
  {
    title: "A better photo",
    body: "One angle hides the far side and flattens depth, so a single photo can be a long way off. Photos from different sides of the rack give a better estimate. A tape is still the official number.",
  },
] as const;

export const SHARE_ESTIMATE_LINE = "Estimate from a photo, not an official B&C score.";

export const SCORE_PRO_TIP_STEADY = "Hold steady for the 2-second burst so the frames stay sharp.";
export const SCORE_PRO_TIP_WHY_TITLE = "WHY HOLD STEADY:";
export const SCORE_PRO_TIP_WHY = "The burst takes several shots over about 2 seconds from one angle. Hold the phone steady so those frames stay sharp.";

/** Recorded viewpoints on a scan. Omitted, 0, and 1 all stay the single-angle line. Burst frame counts are not viewpoints. */
export function viewpointCount(recorded?: number | null): number {
  if (typeof recorded !== "number" || !Number.isFinite(recorded) || recorded <= 1) return 1;
  return Math.floor(recorded);
}

export function scoreEstimateLine(viewpoints?: number | null): string {
  return viewpointCount(viewpoints) > 1 ? MULTI_PHOTO_LINE : ONE_ANGLE_LINE;
}

export function shareMinimumLabel(category: "Typical" | "Non-Typical"): string {
  const inches = category === "Typical" ? "160" : "185";
  return `Est. above B&C minimum (${inches}")`;
}

export function qualificationHeading(qualifies: boolean, category: string): string {
  return qualifies
    ? `Est. above B&C ${category} minimum`
    : `${category} (Below B&C Minimum)`;
}

export function qualificationSummary(qualifies: boolean, category: string): string {
  return qualifies
    ? `Est. above B&C ${category} minimum`
    : `${category} • Below B&C minimum`;
}

/** Collapsed B&C row. Same branches as the old "Qualified" labels, without the claim. */
export function bcMinimumSummary(adjustedScore: number | null, typical: boolean, nonTypical: boolean): string {
  if (adjustedScore !== null) {
    if (adjustedScore >= 185) return "Est. above non-typical minimum (Adjusted)";
    if (adjustedScore >= 160) return "Est. above typical minimum (Adjusted)";
    return "Below minimum (Adjusted)";
  }
  if (typical) return "Est. above typical minimum";
  if (nonTypical) return "Est. above non-typical minimum";
  return "Below minimum";
}

export function bcMinimumStatus(above: boolean, unmet: "Not Met" | "Not Qualified" = "Not Met"): string {
  return above ? "Est. above" : unmet;
}

export function qualificationNote(input: {
  qualifies: boolean;
  netScore: number;
  minimumThreshold: number;
  category: string;
}): string {
  if (input.qualifies) {
    return `This estimate is above the Boone & Crockett minimum of ${input.minimumThreshold}" for ${input.category} scoring. Have it taped by a certified measurer to know for sure.`;
  }
  const net = Number.isFinite(input.netScore) ? input.netScore.toFixed(1) : "0.0";
  return `This estimate is ${net}", which is below the B&C minimum of ${input.minimumThreshold}" for ${input.category} bucks.`;
}

/** Drop the formula band before a score payload is read for display. */
export function withoutScoreRange<T extends Record<string, unknown>>(result: T): Omit<T, "scoreRange"> {
  if (!("scoreRange" in result)) return result;
  const next = { ...result };
  delete next.scoreRange;
  return next;
}
