/**
 * The steps a hunter sees on a report. Defaults live here and can be
 * overridden in remote config or on one report.
 */

export const TRACKER_STEPS = ["received", "studying", "waiting_proof", "reviewing", "verdict"] as const;
export type TrackerStep = (typeof TRACKER_STEPS)[number];

export interface TrackerTiming {
  hours: number;
  expected: string;
  label: string;
}

export const TRACKER_DEFAULTS: Record<TrackerStep, TrackerTiming> = {
  received: { hours: 24, expected: "Usually within 24 hours", label: "Received" },
  studying: { hours: 24, expected: "Usually within 24 hours", label: "Studying your scan" },
  waiting_proof: { hours: 24 * 18, expected: "Lab results usually take 2–3 weeks", label: "Waiting for your jawbone or lab age" },
  reviewing: { hours: 24, expected: "Usually within 24 hours", label: "Reviewing" },
  verdict: { hours: 0, expected: "", label: "Verdict" },
};

export interface TrackerUpdate {
  at: string;
  step: TrackerStep;
  text: string;
}

export function trackerStepOf(value: unknown): TrackerStep | null {
  if (typeof value === "string" && (TRACKER_STEPS as readonly string[]).includes(value)) return value as TrackerStep;
  return null;
}

export function dueAtFrom(now: number, hours: number): string {
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

export function isOverdue(step: TrackerStep, dueAt: string | null, now = Date.now()): boolean {
  if (step === "verdict" || !dueAt) return false;
  const due = Date.parse(dueAt);
  return Number.isFinite(due) && due <= now;
}

export function stepText(step: TrackerStep, expected: string, timing = TRACKER_DEFAULTS): string {
  const label = timing[step].label;
  if (!expected || step === "verdict") return label;
  return `${label}. ${expected}`;
}

export const STILL_WORKING = "Still working on it. Here's where we are.";
