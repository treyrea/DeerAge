/**
 * One age scan: the Hydrogen walk, the age-blind cross-check, and the plain
 * question run together. R1–R5 turn the walk into the 1.0.10 answer. C4nr
 * then picks what the hunter sees. A quality retake shows the plain age.
 */

import { createHash } from "node:crypto";
import type { AgingConfig } from "./aging.js";
import { ScanDeadlineError } from "./budget.js";
import { applyRules, parseCc, type CrossCheck, type RuleDecision } from "./crosscheck.js";
import { parseAge } from "./plain.js";
import { walkHydrogen, type ModelCaller, type WalkResult, type WalkSchedule, type WalkStepListener } from "./pipeline.js";
import { activeCrossCheckPrompt, activePlainPrompt } from "./prompts.js";
import { cls, formatAgeLabel, route, type Ours, type RouteResult } from "./router.js";

export interface AgeRouterLog {
  event: "age_router";
  branch: string;
  plainLabel: string;
  oursLabel: string;
  finalLabel: string;
  plainOk: boolean;
  ccOk: boolean;
  ms: number;
  /** No deer: answered as soon as the walk knew, without waiting for (or retrying) the side calls. */
  early?: boolean;
  plainPromptSha?: string;
  crossCheckPromptSha?: string;
  rule?: string;
  retakeReason?: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function oursLabel(ours: Ours): string {
  if (!ours) return "";
  if (ours[0] === "retake") return "RETAKE";
  const lo = cls(ours[1]);
  const hi = cls(ours[2]);
  if (lo == null || hi == null) return "";
  return formatAgeLabel(lo, hi);
}

function plainLabel(plain: [number, number] | null): string {
  if (!plain) return "";
  const lo = cls(plain[0]);
  const hi = cls(plain[1]);
  if (lo == null || hi == null) return "";
  return formatAgeLabel(lo, hi);
}

async function readPlain(call: ModelCaller, prompt: string, signal?: AbortSignal): Promise<[number, number] | null> {
  try {
    const text = (await call(prompt, (body) => parseAge(body) != null, signal)).text;
    return parseAge(text);
  } catch {
    return null;
  }
}

async function readCrossCheck(call: ModelCaller, prompt: string, signal?: AbortSignal): Promise<CrossCheck | null> {
  try {
    const text = (await call(prompt, (body) => parseCc(body) != null, signal)).text;
    return parseCc(text);
  } catch {
    return null;
  }
}

function shownAge(result: RouteResult, walk: WalkResult | null, rule: RuleDecision | null): WalkResult {
  if (result.source === "retake" || result.label === "RETAKE") {
    const message = rule?.kind === "retake" && rule.reason
      ? rule.reason
      : walk?.kind === "retake"
        ? walk.message
        : "Try another photo of the whole deer.";
    const fails = walk?.kind === "retake" ? walk.fails : [];
    return { kind: "retake", message, fails };
  }
  if (result.lo == null || result.hi == null || !result.label) {
    return { kind: "stop", reason: result.branch || "no answer" };
  }
  const fromWalk = walk?.kind === "age" ? walk : null;
  const sameNumbers = fromWalk != null && result.lo === fromWalk.low && result.hi === fromWalk.high;
  const ruleReason = rule && rule.rule !== "none" && rule.rule !== "none_no_crosscheck" ? rule.reason : "";
  return {
    kind: "age",
    label: result.label,
    low: result.lo,
    high: result.hi,
    isRange: result.is_range,
    hunterCue: sameNumbers ? fromWalk.hunterCue : "",
    reason: ruleReason || (sameNumbers ? fromWalk.reason : ""),
    viaBabyGate: fromWalk?.viaBabyGate,
  };
}

export async function ageWithRouter(input: {
  call: ModelCaller;
  settings: AgingConfig;
  walk?: (call: ModelCaller, onStep?: WalkStepListener, schedule?: WalkSchedule) => Promise<WalkResult>;
  log?: (event: AgeRouterLog) => void;
  now?: () => number;
  /** A plain answer this scan already paid for (Quick Check hand-off). Skips the second plain call. */
  plain?: [number, number] | null;
  /** Display-only progress: each walk call, the walk finishing, the cross-check finishing. */
  progress?: { walkStep: WalkStepListener; walkDone: () => void; crossCheckDone: () => void };
}): Promise<WalkResult> {
  const now = input.now ?? Date.now;
  const started = now();
  const log = input.log ?? ((event: AgeRouterLog) => {
    console.log(JSON.stringify(event));
  });
  const routerOn = input.settings.router === "c4nr";
  const wantCrossCheck = input.settings.crossCheck;
  const plainPrompt = routerOn ? activePlainPrompt(input.settings.plainPrompt) : "";
  const crossPrompt = wantCrossCheck ? activeCrossCheckPrompt(input.settings.crossCheckPrompt) : "";
  const walk = input.walk ?? walkHydrogen;

  const progress = input.progress;
  const safely = (fn: (() => void) | undefined) => {
    try {
      fn?.();
    } catch {
      // Progress is display only.
    }
  };
  const schedule: WalkSchedule = {
    parallelStart: input.settings.parallelStart !== false,
    parallelClosers: input.settings.parallelClosers !== false,
  };
  // Cancels the plain read and the cross-check when the walk finds no deer.
  const side = new AbortController();
  const walkTask = walk(input.call, progress?.walkStep, schedule)
    .finally(() => safely(progress?.walkDone))
    .then((result) => ({ ok: true as const, result, error: null }))
    .catch((error: unknown) => ({ ok: false as const, result: null, error }));
  const plainTask = !routerOn
    ? Promise.resolve(null)
    : input.plain !== undefined
      ? Promise.resolve(input.plain)
      : readPlain(input.call, plainPrompt, side.signal);
  const crossTask = wantCrossCheck
    ? readCrossCheck(input.call, crossPrompt, side.signal).finally(() => safely(progress?.crossCheckDone))
    : Promise.resolve(null);
  const walkBox = await walkTask;
  const walkResult = walkBox.ok ? walkBox.result : null;
  if (walkResult?.kind === "no_deer") {
    // No deer: answer now. The plain read and cross-check cannot change that, so stop them (no retries).
    side.abort();
    log({
      event: "age_router",
      branch: "no_deer",
      plainLabel: "",
      oursLabel: "",
      finalLabel: "",
      plainOk: false,
      ccOk: false,
      early: true,
      ms: Math.max(0, now() - started),
      ...(plainPrompt ? { plainPromptSha: sha256(plainPrompt) } : {}),
      ...(crossPrompt ? { crossCheckPromptSha: sha256(crossPrompt) } : {}),
    });
    return walkResult;
  }
  const [plain, crossCheck] = await Promise.all([plainTask, crossTask]);
  const rule = walkResult?.kind === "age" && wantCrossCheck
    ? applyRules(walkResult.low, walkResult.high, crossCheck, walkResult.viaBabyGate === true)
    : null;
  const ours: Ours = !walkResult || walkResult.kind === "stop"
    ? null
    : walkResult.kind === "retake"
      ? ["retake"]
      : rule?.kind === "retake"
        ? ["retake"]
        : ["age", rule?.lo ?? walkResult.low, rule?.hi ?? walkResult.high];

  const decided = routerOn ? route(plain, ours) : null;
  const retakeReason = rule?.kind === "retake"
    ? rule.reason
    : walkResult?.kind === "retake"
      ? walkResult.message
      : undefined;
  const finalLabel = decided
    ? decided.label
    : oursLabel(ours);
  log({
    event: "age_router",
    branch: decided?.branch ?? "router_off",
    plainLabel: plainLabel(plain),
    oursLabel: oursLabel(ours),
    finalLabel,
    plainOk: plain != null,
    ccOk: crossCheck != null,
    ms: Math.max(0, now() - started),
    ...(plainPrompt ? { plainPromptSha: sha256(plainPrompt) } : {}),
    ...(crossPrompt ? { crossCheckPromptSha: sha256(crossPrompt) } : {}),
    ...(rule ? { rule: rule.rule } : {}),
    ...(retakeReason ? { retakeReason } : {}),
  });

  if (!routerOn) {
    if (!walkBox.ok) throw walkBox.error;
    if (!walkResult || walkResult.kind === "stop") return walkResult ?? { kind: "stop", reason: "no answer" };
    if (rule?.kind === "retake") return { kind: "retake", message: rule.reason, fails: [] };
    if (walkResult.kind === "retake") return walkResult;
    return shownAge(
      {
        lo: ours && ours[0] === "age" ? ours[1] : walkResult.low,
        hi: ours && ours[0] === "age" ? ours[2] : walkResult.high,
        is_range: (ours && ours[0] === "age" ? ours[1] : walkResult.low) !== (ours && ours[0] === "age" ? ours[2] : walkResult.high),
        label: finalLabel,
        branch: "router_off",
        source: "ours",
      },
      walkResult,
      rule,
    );
  }

  const shown = shownAge(decided!, walkResult, rule);
  if (shown.kind === "stop" && !walkBox.ok && !(walkBox.error instanceof ScanDeadlineError)) {
    throw walkBox.error;
  }
  return shown;
}
