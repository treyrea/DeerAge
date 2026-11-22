/**
 * Quick Check engines. The default is one Gemini Hydrogen plain read with a
 * DEER_PRESENT line (about 1¢). A hunter with lease rules on whose plain read
 * is 3.5 or older is handed to the full age-mode pipeline, and that answer is
 * returned in the Quick Check shape. The 6-call gateway pipeline stays selectable.
 * The engine is a live remote-config setting, so it changes without a deploy.
 */

import { classStep } from "./field-call.js";
import { formatAgeLabel } from "./hydrogen/router.js";
import { hydrogenAgeBody } from "./hydrogen/result.js";
import { RETAKE_MESSAGES } from "./hydrogen/rules.js";
import { parseAge } from "./hydrogen/plain.js";
import { activeQuickPrompt } from "./hydrogen/prompts.js";
import type { AgeResolution } from "./hydrogen/failover.js";
import type { ModelCaller } from "./hydrogen/pipeline.js";
import type { DeerPresentAnswer } from "./hydrogen/no-deer.js";

export const QUICK_ENGINES = ["gateway", "plain", "plain_escalate", "age"] as const;
export type QuickEngine = (typeof QUICK_ENGINES)[number];

export interface QuickConfig {
  /** gateway = the old 6-call pipeline; plain = one read; plain_escalate = one read, lease users 3.5+ get the full pipeline; age = always the full pipeline. */
  engine: QuickEngine;
  /** What to do when the app does not say whether lease rules are on (build 18 and older). */
  leaseUnknown: "plain" | "escalate";
  /** Plain reads at or above this class go to the full pipeline for lease users. */
  escalateAt: number;
  /** Empty means the bundled plain_deer_v1.txt. */
  prompt: string;
}

export const QUICK_PROMPT_MAX = 2000;

export function defaultQuickConfig(): QuickConfig {
  return { engine: "plain_escalate", leaseUnknown: "escalate", escalateAt: 3.5, prompt: "" };
}

function engineOf(value: unknown): QuickEngine | null {
  return typeof value === "string" && (QUICK_ENGINES as readonly string[]).includes(value) ? value as QuickEngine : null;
}

function escalateAtOf(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1.5 || parsed > 6.5) return null;
  return classStep(parsed);
}

function cleanPrompt(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

/** Stored config merged onto the defaults. Anything unreadable keeps the default. */
export function normalizeQuick(stored: unknown): QuickConfig {
  const base = defaultQuickConfig();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const row = stored as Record<string, unknown>;
  return {
    engine: engineOf(row.engine) ?? base.engine,
    leaseUnknown: row.leaseUnknown === "plain" || row.leaseUnknown === "escalate" ? row.leaseUnknown : base.leaseUnknown,
    escalateAt: escalateAtOf(row.escalateAt) ?? base.escalateAt,
    prompt: typeof row.prompt === "string" ? cleanPrompt(row.prompt).slice(0, QUICK_PROMPT_MAX) : base.prompt,
  };
}

export class QuickConfigError extends Error {}

/** Admin patch. Throws QuickConfigError with a readable message on a bad field. */
export function patchQuick(current: QuickConfig, incoming: unknown): QuickConfig {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    throw new QuickConfigError("quick must be an object.");
  }
  const row = incoming as Record<string, unknown>;
  const next: QuickConfig = { ...current };
  if (row.engine != null) {
    const engine = engineOf(row.engine);
    if (!engine) throw new QuickConfigError(`quick.engine must be one of ${QUICK_ENGINES.join(", ")}.`);
    next.engine = engine;
  }
  if (row.leaseUnknown != null) {
    if (row.leaseUnknown !== "plain" && row.leaseUnknown !== "escalate") {
      throw new QuickConfigError("quick.leaseUnknown must be plain or escalate.");
    }
    next.leaseUnknown = row.leaseUnknown;
  }
  if (row.escalateAt != null) {
    const at = escalateAtOf(row.escalateAt);
    if (at == null) throw new QuickConfigError("quick.escalateAt must be an age class from 1.5 to 6.5.");
    next.escalateAt = at;
  }
  if (row.prompt != null) {
    if (typeof row.prompt !== "string") throw new QuickConfigError("quick.prompt must be text.");
    const text = cleanPrompt(row.prompt);
    if (text.length > QUICK_PROMPT_MAX) throw new QuickConfigError("quick.prompt is too long.");
    next.prompt = text;
  }
  return next;
}

/** The app's lease-rules switch, when it sends one. Build 18 and older send nothing. */
export function leaseRulesOf(body: { leaseRules?: unknown; context?: { leaseRules?: unknown } | null }): boolean | undefined {
  const value = body.leaseRules ?? body.context?.leaseRules;
  return typeof value === "boolean" ? value : undefined;
}

/** The last DEER_LARGE_ENOUGH line. Only an explicit NO is "too small". */
export function deerLargeLine(text: string): "ok" | "too_small" | "unknown" {
  const found = [...text.matchAll(/DEER_LARGE_ENOUGH\s*:\s*\**\s*(YES|NO|CANT_TELL)\b/gi)];
  const last = found.at(-1)?.[1]?.toUpperCase();
  if (last === "NO") return "too_small";
  if (last === "YES" || last === "CANT_TELL") return "ok";
  return "unknown";
}

/** The last DEER_PRESENT line. Only an explicit NO is "no deer". */
export function deerLine(text: string): DeerPresentAnswer {
  const found = [...text.matchAll(/DEER_PRESENT\s*:\s*\**\s*(YES|NO|CANT_TELL)\b/gi)];
  const last = found.at(-1)?.[1]?.toUpperCase();
  if (last === "NO") return "absent";
  if (last === "YES" || last === "CANT_TELL") return "present";
  return "unknown";
}

/** Should this plain read go on to the full pipeline? */
export function shouldEscalate(input: {
  engine: QuickEngine;
  leaseRules: boolean | undefined;
  leaseUnknown: QuickConfig["leaseUnknown"];
  plainLow: number;
  escalateAt: number;
  /** The lease minimum. A plain read that would already be a shooter always gets the deeper check. */
  minimum: number;
}): boolean {
  if (input.engine !== "plain_escalate") return false;
  const lease = input.leaseRules ?? (input.leaseUnknown === "escalate");
  if (!lease) return false;
  const line = Math.min(input.escalateAt, classStep(input.minimum));
  return classStep(input.plainLow) + 1e-9 >= line;
}

/** Up to four short "why" lines from the plain answer's bullet list. */
export function plainReasons(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^([-*•]|\d+\.)\s+/.test(line)) continue;
    const clean = line
      .replace(/^([-*•]|\d+\.)\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length < 8) continue;
    lines.push(clean.length > 180 ? `${clean.slice(0, 177).replace(/\s+\S*$/, "")}…` : clean);
    if (lines.length >= 4) break;
  }
  return lines;
}

const APP_CLASSES = ["1.5-2.5", "2.5-3.5", "3.5-4.5", "4.5-5.5"];

/**
 * The Quick Check screen shows one number (ageYears). For a range we show the
 * younger end, the same choice age mode makes, so a range never reads older
 * than the evidence. estimatedAgeClass carries the range when it is one class wide.
 */
export function quickClassFor(low: number, high: number): string | undefined {
  const lo = classStep(low);
  const hi = classStep(high);
  if (lo >= 5.5) return "5.5+";
  if (lo === hi) return undefined;
  const key = `${lo.toFixed(1)}-${Math.min(hi, 5.5).toFixed(1)}`;
  return APP_CLASSES.includes(key) ? key : hi >= 5.5 && lo >= 4.5 ? "4.5-5.5" : undefined;
}

/** Adds the Quick Check fields to an age-mode body. */
export function toQuickShape(body: Record<string, unknown>, extra: { engine: QuickEngine; escalated: boolean; plainAge: number | null }): Record<string, unknown> {
  const low = Number(body.ageYears);
  const high = Number(body.highYears ?? body.ageYears);
  const ageClass = Number.isFinite(low) ? quickClassFor(low, Number.isFinite(high) ? high : low) : undefined;
  return {
    ...body,
    ...(ageClass ? { estimatedAgeClass: ageClass } : {}),
    quickEngine: extra.engine,
    escalated: extra.escalated,
    plainAge: extra.plainAge,
  };
}

export function plainAgeBody(low: number, high: number, text: string, minimum: number, rangeNote?: string): Record<string, unknown> {
  const lo = classStep(low);
  const hi = Math.max(lo, classStep(high));
  const isRange = lo !== hi;
  const label = formatAgeLabel(lo, hi);
  const reasons = plainReasons(text);
  const body = hydrogenAgeBody({ low: lo, high: hi, label, isRange, hunterCue: "", reason: "", minimum, rangeNote });
  return {
    ...body,
    highYears: hi,
    pipeline: "plain",
    reasons,
    topCues: reasons,
    cueBullets: reasons.map((text) => ({ area: "Body", text })),
    cues: reasons.map((text) => ({ name: "chest_depth", displayName: "Body", pattern: text })),
  };
}

export type QuickOutcome =
  | { kind: "no_deer" }
  | { kind: "retake"; message: string }
  | { kind: "fail"; reason: string }
  | { kind: "age"; result: Record<string, unknown>; escalated: boolean; backup: boolean; plainAge: number | null };

/**
 * Runs the Hydrogen engines (plain, plain_escalate, age). The gateway engine is
 * handled by the caller. resolveFull runs the age-mode pipeline with the plain
 * answer reused; its backup is the plain answer as a one-class range.
 */
export async function runQuickHydrogen(input: {
  engine: Exclude<QuickEngine, "gateway">;
  call: ModelCaller;
  minimum: number;
  leaseRules: boolean | undefined;
  config: QuickConfig;
  rangeNote?: string;
  /** plain undefined = the pipeline makes its own plain call (engine "age"). */
  resolveFull: (plain: [number, number] | undefined) => Promise<AgeResolution>;
  log?: (event: Record<string, unknown>) => void;
}): Promise<QuickOutcome> {
  const log = input.log ?? ((event) => console.log(JSON.stringify(event)));
  if (input.engine === "age") {
    const full = await input.resolveFull(undefined);
    return fromFull(full, false, null);
  }
  let text = "";
  try {
    const prompt = activeQuickPrompt(input.config.prompt);
    text = (await input.call(prompt, (body) => parseAge(body) != null || deerLine(body) === "absent")).text;
  } catch (error) {
    log({ event: "quick_plain_failed", reason: error instanceof Error ? error.message.slice(0, 120) : "error" });
    return { kind: "fail", reason: "plain_call_failed" };
  }
  const deer = deerLine(text);
  if (deer === "absent") return { kind: "no_deer" };
  if (deerLargeLine(text) === "too_small") {
    return { kind: "retake", message: RETAKE_MESSAGES.deer_large_enough };
  }
  const plain = parseAge(text);
  if (!plain) {
    log({ event: "quick_plain_failed", reason: "no_age", deer });
    return { kind: "fail", reason: "no_age" };
  }
  const [low, high] = plain;
  const escalate = shouldEscalate({
    engine: input.engine,
    leaseRules: input.leaseRules,
    leaseUnknown: input.config.leaseUnknown,
    plainLow: low,
    escalateAt: input.config.escalateAt,
    minimum: input.minimum,
  });
  log({ event: "quick_plain", engine: input.engine, plain: formatAgeLabel(classStep(low), classStep(high)), deer, leaseRules: input.leaseRules ?? null, escalate });
  if (!escalate) {
    return { kind: "age", escalated: false, backup: false, plainAge: classStep(low), result: plainAgeBody(low, high, text, input.minimum, input.rangeNote) };
  }
  const full = await input.resolveFull(plain);
  // One YES keeps the deer: a plain read that saw a deer is not overruled by the walk's photo check.
  const walkSaysNoDeer = full.kind === "no_deer" && deer === "present";
  if (full.kind === "retake" || full.kind === "stop" || full.kind === "fail" || walkSaysNoDeer) {
    // The deeper check could not finish. Show the plain read as a one-class range ending at it, never a firm shooter.
    log({ event: "quick_escalation_fallback", kind: full.kind });
    const lo = Math.max(1.5, classStep(low) - 1);
    const body = plainAgeBody(lo, classStep(low), text, input.minimum, input.rangeNote);
    return {
      kind: "age",
      escalated: true,
      backup: true,
      plainAge: classStep(low),
      result: { ...body, betterAngle: full.kind === "retake" ? full.message : "" },
    };
  }
  return fromFull(full, true, classStep(low));
}

function fromFull(full: AgeResolution, escalated: boolean, plainAge: number | null): QuickOutcome {
  if (full.kind === "no_deer") return { kind: "no_deer" };
  if (full.kind === "age") {
    const label = String(full.result.ageLabel ?? "");
    const high = highFromLabel(label, Number(full.result.ageYears));
    return { kind: "age", escalated, backup: full.backup, plainAge, result: { ...full.result, highYears: high } };
  }
  return { kind: "fail", reason: full.kind };
}

function highFromLabel(label: string, low: number): number {
  const parts = label.split(/[–-]/).map((part) => Number.parseFloat(part));
  const last = parts.at(-1);
  return parts.length > 1 && last != null && Number.isFinite(last) ? last : low;
}

/** High hold against the daily cap before the calls return. Real cost settles after. */
export function quickReserveUsd(input: { engine: QuickEngine; mayEscalate: boolean; hydrogenReserve: number; plainReserve: number }): number {
  if (input.engine === "gateway") return 0.3;
  if (input.engine === "age") return input.hydrogenReserve;
  if (input.engine === "plain_escalate" && input.mayEscalate) return input.hydrogenReserve;
  return input.plainReserve;
}
