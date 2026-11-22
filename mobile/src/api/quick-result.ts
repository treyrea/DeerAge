/**
 * Turns the server's Quick Check result into what the screen shows.
 * Never makes up an age, a confidence, or a key feature. No age means the read failed.
 */

import { AnalysisError } from "./errors";

export type QuickKeyFeature = "neck_brisket" | "chest_hindquarter" | "leg_body";

/** A positive age the server actually read, or null. The lease minimum is never a stand-in. */
export function quickAgeOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The read age, or an upstream error the caller shows as "Quick Check failed". */
export function requireQuickAge(value: unknown): number {
  const age = quickAgeOrNull(value);
  if (age === null) throw new AnalysisError("upstream");
  return age;
}

/** The server's confidence, clamped. A missing one is 0, never a made-up 50. */
export function quickConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

/** Only a key feature the server named. */
export function quickKeyFeature(value: unknown): QuickKeyFeature | undefined {
  return value === "neck_brisket" || value === "chest_hindquarter" || value === "leg_body" ? value : undefined;
}
