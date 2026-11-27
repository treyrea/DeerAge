/**
 * Hydrogen is the primary age walk. A provider error, timeout, or open circuit
 * uses the gateway age pipeline and shows a range, because that backup is less certain.
 * A retake is a finished photo check, not a provider failure.
 */

import { hydrogenAgeBody } from "./result.js";
import type { WalkResult } from "./pipeline.js";
import { RETAKE_MESSAGES } from "./rules.js";
import { classStep } from "../field-call.js";

const STEPS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];

export function backupRange(years: number): { low: number; high: number; label: string } {
  const step = classStep(years);
  const index = STEPS.findIndex((item) => Math.abs(item - step) < 0.01);
  if (index <= 0) return { low: 1.5, high: 2.5, label: "1.5–2.5" };
  const low = STEPS[index - 1];
  const high = STEPS[index];
  const highLabel = high >= 6.5 ? "6.5+" : high >= 5.5 ? "5.5+" : String(high);
  return { low, high, label: `${String(low)}–${highLabel}` };
}

export function backupAgeBody(result: Record<string, unknown>, minimum: number, rangeNote?: string): Record<string, unknown> {
  const years = Number(result.estimatedAgeYears ?? result.ageYears);
  if (!Number.isFinite(years) || years <= 0) {
    return { ...result, pipeline: "backup", backup: true };
  }
  const range = backupRange(years);
  const body = hydrogenAgeBody({
    low: range.low,
    high: range.high,
    label: range.label,
    isRange: true,
    hunterCue: "",
    reason: "The first model did not finish, so this is a range.",
    minimum,
    rangeNote,
  });
  return { ...body, pipeline: "backup", backup: true };
}

export type AgeResolution =
  | { kind: "no_deer" }
  | { kind: "harvested"; message: string }
  | { kind: "no_antlers"; message: string }
  | { kind: "antlerless"; sex: "probably_doe" | "buck_possible"; age: "fawn" | "cant_tell" | null; message: string }
  | { kind: "not_live"; message: string }
  | { kind: "no_body"; message: string }
  | { kind: "retake"; message: string }
  | { kind: "stop" }
  | { kind: "age"; result: Record<string, unknown>; backup: boolean }
  | { kind: "fail" };

export async function resolveHydrogenAge(input: {
  minimum: number;
  primary: () => Promise<WalkResult>;
  backup: () => Promise<Record<string, unknown> | null>;
  circuitOpen: () => Promise<boolean>;
  note: (ok: boolean) => Promise<void>;
  log?: (event: Record<string, unknown>) => void;
  rangeNote?: string;
  /** C4nr: an unparsed walk with no plain age uses the gateway range. Off keeps today's error. */
  backupOnStop?: boolean;
}): Promise<AgeResolution> {
  const log = input.log ?? ((event) => {
    console.log(JSON.stringify(event));
  });
  if (await input.circuitOpen()) {
    log({ event: "provider_fallback", provider: "gemini", reason: "circuit_open" });
    return fromBackup(input.backup, input.minimum, log, input.rangeNote);
  }
  try {
    const outcome = await input.primary();
    await input.note(true);
    if (outcome.kind === "no_deer") return { kind: "no_deer" };
    if (outcome.kind === "antlerless") {
      return { kind: "antlerless", sex: outcome.sex, age: outcome.age, message: outcome.message };
    }
    if (outcome.kind === "harvested" || outcome.kind === "no_antlers" || outcome.kind === "not_live" || outcome.kind === "no_body") {
      return { kind: outcome.kind, message: outcome.message };
    }
    if (outcome.kind === "retake") return { kind: "retake", message: outcome.message };
    if (outcome.kind === "stop" && outcome.reason === "unparsed quality") {
      // Do not send a photo we could not quality-check to the gateway backup;
      // that path is what turned tiny long-range frames into "couldn't finish."
      return { kind: "retake", message: RETAKE_MESSAGES.deer_large_enough };
    }
    if (outcome.kind === "age") {
      return {
        kind: "age",
        backup: false,
        result: hydrogenAgeBody({ ...outcome, minimum: input.minimum, rangeNote: input.rangeNote }),
      };
    }
    if (input.backupOnStop) {
      log({ event: "provider_fallback", provider: "gemini", reason: "walk_stop", detail: outcome.reason });
      return fromBackup(input.backup, input.minimum, log, input.rangeNote);
    }
    return { kind: "stop" };
  } catch (error) {
    await input.note(false);
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status: number }).status) : 0;
    log({
      event: "provider_error",
      provider: "gemini",
      status: Number.isFinite(status) ? status : 0,
      reason: error instanceof Error ? error.name : "error",
    });
    log({ event: "provider_fallback", provider: "gemini", to: "gateway" });
    return fromBackup(input.backup, input.minimum, log, input.rangeNote);
  }
}

async function fromBackup(
  backup: () => Promise<Record<string, unknown> | null>,
  minimum: number,
  log: (event: Record<string, unknown>) => void,
  rangeNote?: string,
): Promise<AgeResolution> {
  try {
    const result = await backup();
    if (!result) return { kind: "fail" };
    if (result.kind === "no_deer" && result.ageYears == null && result.estimatedAgeYears == null && result.grossScore == null) {
      return { kind: "no_deer" };
    }
    log({ event: "provider_latency", provider: "gateway", backup: true });
    return { kind: "age", backup: true, result: backupAgeBody(result, minimum, rangeNote) };
  } catch (error) {
    log({
      event: "provider_error",
      provider: "gateway",
      reason: error instanceof Error ? error.name : "error",
    });
    return { kind: "fail" };
  }
}
