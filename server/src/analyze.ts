import { saveContributionForJob } from "./contributions.js";
import { findBodyBoxes, gatewayBoxCaller, withOverlays } from "./body-boxes.js";
import { agingEngineFor, HYDROGEN_MODEL, type AgingEngine } from "./aging-switch.js";
import { costUsd, emptyUsage, geminiInputUsdPerMillion, geminiOutputUsdPerMillion, hydrogenReserveUsd, inputUsdPerMillion, outputUsdPerMillion, plainReserveUsd, type TokenUsage } from "./cost.js";
import { FREE_LIFETIME_ANALYSES, modelName } from "./config.js";
import { readAccess, revenueCatConfigured, writeFreeUses, type AccessSnapshot } from "./entitlement.js";
import {
  LimitStoreError,
  allowRate,
  fairUsePerDay,
  fairUsePerMonth,
  rateLimitPerMinute,
  reconcileSpend,
  redisConfigured,
  releaseFairUse,
  reserveFairUse,
  reserveSpend,
} from "./limits.js";
import { UpstreamError } from "./openai.js";
import { issueRecord } from "./record.js";
import { runAgeCall } from "./age-pipeline.js";
import { geminiCaller } from "./hydrogen/gemini.js";
import { circuitNote, circuitOpen } from "./hydrogen/circuit.js";
import { resolveHydrogenAge } from "./hydrogen/failover.js";
import { ageWithRouter } from "./hydrogen/age-with-router.js";
import { hydrogenFinishPlan, noDeerCopy, noDeerJobError, noDeerJobForMode } from "./hydrogen/no-deer.js";
import { createScanBudget } from "./hydrogen/budget.js";
import { loadRemoteConfig } from "./remote-config.js";
import { leaseRulesOf, quickReserveUsd, runQuickHydrogen, toQuickShape, type QuickConfig, type QuickEngine } from "./quick-engine.js";
import { runScoreCall } from "./score-pipeline.js";
import { consumeCredit, readCredits, returnCredit } from "./scan-credits.js";
import { keepAlive, loadJob, newJobId, saveJob, saveProgress, type ScanJob } from "./jobs.js";
import { ageProgress, initialProgress } from "./progress.js";
import type { ModelCall } from "./gateway.js";
interface HuntContext {
  state?: string;
  ecoregion?: string;
  homeState?: string;
  homeEcoregion?: string;
  landType?: string;
  goal?: string;
  minimumShooterAge?: number;
  /** The app's Lease rules switch (sent by builds after 18). */
  leaseRules?: boolean;
  species?: string;
  month?: number;
  distanceYards?: number;
  fenceType?: string;
}

export interface AnalyzeBody {
  /** "Help improve DeerAge" switch from the app. */
  contribute?: boolean;
  mode?: string;
  appUserId?: string;
  images?: unknown;
  context?: HuntContext;
  baseline?: boolean;
  minimumShooterAge?: number;
  appVersion?: string;
  /** The app's Lease rules switch. Build 18 and older do not send it. */
  leaseRules?: boolean;
}

interface Auth {
  evalToken: string;
}

type FailureCode =
  | "invalid_request"
  | "not_configured"
  | "rate_limited"
  | "quota"
  | "not_deer"
  | "no_body"
  | "no_antlers"
  | "poor_quality"
  | "timeout"
  | "upstream"
  | "fair_use"
  | "busy";

function fail(status: number, code: FailureCode, message: string) {
  return { status, body: { ok: false, code, message } };
}

function tokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function imagesOf(body: AnalyzeBody): string[] | null {
  if (!Array.isArray(body.images) || body.images.length === 0 || body.images.length > 4) return null;
  const images: string[] = [];
  for (const image of body.images) {
    if (typeof image !== "string" || image.length < 100 || image.length > 2_000_000) return null;
    images.push(image);
  }
  return images;
}

function contextOf(body: AnalyzeBody): HuntContext {
  const context = body.context ?? {};
  return {
    ...context,
    minimumShooterAge: body.minimumShooterAge ?? context.minimumShooterAge ?? 4.5,
    month: context.month ?? new Date().getMonth() + 1,
  };
}

export async function getAccess(appUserId: string) {
  if (!appUserId || appUserId.length > 200) {
    return fail(400, "invalid_request", "appUserId is required.");
  }
  if (!revenueCatConfigured()) {
    return fail(503, "not_configured", "Entitlement checks are not configured.");
  }
  try {
    const access = await readAccess(appUserId);
    return {
      status: 200,
      body: {
        ok: true,
        entitled: access.entitled,
        entitlementIds: access.entitlementIds,
        freeUsesRemaining: access.entitled ? null : access.freeUsesRemaining,
        scanCredits: await readCredits(appUserId),
        fairUsePerDay: fairUsePerDay(),
        fairUsePerMonth: fairUsePerMonth(),
        freeLifetimeAnalyses: FREE_LIFETIME_ANALYSES,
      },
    };
  } catch {
    return fail(502, "upstream", "Could not read the subscription. Try again.");
  }
}

export async function runAnalysis(body: AnalyzeBody, auth: Auth) {
  const started = Date.now();
  const mode = body.mode;
  if (mode !== "quick" && mode !== "age" && mode !== "score") {
    return fail(400, "invalid_request", "mode must be quick, age, or score.");
  }
  const images = imagesOf(body);
  if (!images) {
    return fail(400, "invalid_request", "Send 1 to 4 JPEG images as base64.");
  }
  const appUserId = typeof body.appUserId === "string" ? body.appUserId.trim() : "";
  if (!appUserId || appUserId.length > 200) {
    return fail(400, "invalid_request", "appUserId is required.");
  }

  const evalToken = process.env.DEERAGE_EVAL_TOKEN?.trim() ?? "";
  const isEval = tokensMatch(auth.evalToken, evalToken);
  if (body.baseline && !isEval) {
    return fail(400, "invalid_request", "The baseline prompt is only for the eval harness.");
  }

  if (!redisConfigured()) {
    return fail(503, "not_configured", "Usage limits are not configured.");
  }
  try {
    const allowed = await allowRate(appUserId, rateLimitPerMinute(isEval));
    if (!allowed) {
      return fail(429, "rate_limited", "Too many requests. Wait a moment and try again.");
    }
  } catch (error) {
    if (error instanceof LimitStoreError) {
      return fail(503, "busy", "DeerAge is busy right now. Try again in a little while.");
    }
    throw error;
  }

  const appVersion = typeof body.appVersion === "string" ? body.appVersion.trim().slice(0, 32) : "";
  const engine: AgingEngine = mode === "age" && !body.baseline ? agingEngineFor(appVersion) : "current";
  const quickConfig: QuickConfig | null = mode === "quick" && !body.baseline
    ? (await loadRemoteConfig().catch(() => null))?.quick ?? null
    : null;
  const quickEngine: QuickEngine = quickConfig?.engine ?? "gateway";
  const leaseRules = leaseRulesOf(body);
  const quickHydrogen = mode === "quick" && quickEngine !== "gateway";
  if (engine === "hydrogen" || quickHydrogen) {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      return fail(503, "not_configured", "The analysis service is not configured.");
    }
  } else if (!process.env.OPENAI_API_KEY?.trim()) {
    return fail(503, "not_configured", "The analysis service is not configured.");
  }

  let access: AccessSnapshot | null = null;
  let creditHeld = false;
  let freeHeld = false;
  if (!isEval) {
    if (!revenueCatConfigured()) {
      return fail(503, "not_configured", "Entitlement checks are not configured.");
    }
    try {
      access = await readAccess(appUserId);
    } catch {
      return fail(502, "upstream", "Could not verify the subscription. Try again.");
    }
    if (!access.entitled) {
      let spentCredit = false;
      try {
        spentCredit = await consumeCredit(appUserId);
      } catch {
        return fail(503, "busy", "DeerAge is busy right now. Try again in a little while.");
      }
      if (spentCredit) {
        creditHeld = true;
      } else if (access.freeUsesRemaining === 0) {
        return fail(402, "quota", "You've used your 3 free analyses.");
      } else {
        try {
          await writeFreeUses(appUserId, access.freeUsesUsed + 1);
          freeHeld = true;
        } catch {
          return fail(502, "upstream", "Could not reserve a free analysis. Try again.");
        }
      }
    }
  }

  const refund = async () => {
    if (creditHeld) {
      creditHeld = false;
      try {
        await returnCredit(appUserId);
      } catch {
        // A failed refund spends the credit. That is the closed direction.
      }
      return;
    }
    if (!freeHeld || !access || access.entitled || isEval) return;
    freeHeld = false;
    try {
      await writeFreeUses(appUserId, access.freeUsesUsed);
    } catch {
      // A failed refund spends a free use. That is the closed direction.
    }
  };

  let fairUseHeld = false;
  let spendReserved = 0;
  const usage = emptyUsage();

  try {
    if (access?.entitled) {
      const fair = await reserveFairUse(appUserId);
      if (fair === "daily") {
        return fail(429, "fair_use", "You've used today's analyses. The cap resets tomorrow.");
      }
      if (fair === "monthly") {
        return fail(429, "fair_use", "You've used this month's analyses. The daily cap still resets tomorrow, and the monthly cap resets at the start of next month.");
      }
      fairUseHeld = true;
    }

    spendReserved = engine === "hydrogen"
      ? hydrogenReserveUsd()
      : mode === "quick"
        ? quickReserveUsd({
          engine: quickEngine,
          mayEscalate: leaseRules ?? quickConfig?.leaseUnknown === "escalate",
          hydrogenReserve: hydrogenReserveUsd(),
          plainReserve: plainReserveUsd(),
        })
        : mode === "score" ? 0.05 : 0.12;
    const underCap = await reserveSpend(spendReserved);
    if (!underCap) {
      if (fairUseHeld) await releaseFairUse(appUserId);
      fairUseHeld = false;
      spendReserved = 0;
      return fail(503, "busy", "DeerAge is busy right now. Try again in a little while.");
    }

    const context = contextOf(body);
    const minimum = context.minimumShooterAge ?? 4.5;
    const jobId = newJobId();
    const progressKind = mode === "score" ? "score" : mode === "quick" && quickEngine !== "age" ? "plain" : "age";
    const job: ScanJob = { id: jobId, status: "running", mode, provisional: null, final: null, error: null, progress: initialProgress(progressKind) };
    await saveJob(job);
    const reserved = spendReserved;
    spendReserved = 0;
    // "Help improve DeerAge": only when the hunter opted in; the owner switch is checked inside.
    const contribute = body.contribute === true && !isEval;
    const finished = finishJob({
      job,
      images,
      mode,
      minimum,
      appUserId,
      reserved,
      usage,
      engine,
      quick: quickHydrogen && quickConfig ? { config: quickConfig, engine: quickEngine as Exclude<QuickEngine, "gateway">, leaseRules } : null,
      refund,
      releaseFairUse: async () => {
        if (fairUseHeld) await releaseFairUse(appUserId);
      },
    });
    keepAlive(contribute
      ? finished.then(() => saveContributionForJob({ jobId, appUserId, mode, minimum, images }).catch((error: unknown) => {
        console.log(JSON.stringify({ event: "contribution_failed", message: error instanceof Error ? error.message.slice(0, 120) : "failed" }));
      }))
      : finished);
    const scanCredits = await readCredits(appUserId);
    const freeUsesRemaining = !access || access.entitled || isEval
      ? null
      : freeHeld
        ? Math.max(0, (access.freeUsesRemaining ?? 0) - 1)
        : access.freeUsesRemaining;
    return { status: 202, body: { ok: true, jobId, mode, entitled: Boolean(access?.entitled), freeUsesRemaining, scanCredits, progress: job.progress, serverNow: Date.now() } };
  } catch (error) {
    if (spendReserved > 0) {
      await settleCost(usage, spendReserved, mode, appUserId).catch(() => undefined);
      spendReserved = 0;
    }
    if (fairUseHeld && usage.promptTokens + usage.completionTokens === 0) {
      await releaseFairUse(appUserId).catch(() => undefined);
    }
    await refund();
    if (error instanceof LimitStoreError) {
      return fail(503, "busy", "DeerAge is busy right now. Try again in a little while.");
    }
    if (error instanceof UpstreamError) {
      if (error.status === 504) return fail(504, "timeout", "Analysis took too long. Try a clearer photo.");
      if (error.status === 429) return fail(429, "rate_limited", "The analysis service is busy. Wait a moment and try again.");
      return fail(502, "upstream", "Analysis failed. Try again in a moment.");
    }
    return fail(502, "upstream", "Analysis failed. Try again in a moment.");
  }
}

async function settleCost(usage: TokenUsage, reserved: number, mode: string, appUserId: string): Promise<number> {
  const estimatedCostUsd = costUsd(usage);
  await reconcileSpend(reserved, estimatedCostUsd);
  console.log(JSON.stringify({
    event: "analysis_cost",
    mode,
    model: modelName(),
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    inputUsdPerMillion: inputUsdPerMillion(),
    outputUsdPerMillion: outputUsdPerMillion(),
    appUserIdPrefix: appUserId.slice(0, 16),
  }));
  return Number(estimatedCostUsd.toFixed(6));
}

const STOP_MESSAGE = {
  not_deer: "This photo doesn't show a deer.",
  no_antlers: "No antlers are visible in this photo.",
  unreadable: "The photo is too dark or blurry to read.",
} as const;

async function finishJob(input: {
  job: ScanJob;
  images: string[];
  mode: "quick" | "age" | "score";
  minimum: number;
  appUserId: string;
  reserved: number;
  usage: TokenUsage;
  engine: AgingEngine;
  quick?: { config: QuickConfig; engine: Exclude<QuickEngine, "gateway">; leaseRules: boolean | undefined } | null;
  refund: () => Promise<void>;
  releaseFairUse: () => Promise<void>;
}): Promise<void> {
  try {
    if (input.mode === "quick" && input.quick) {
      const handled = await finishQuickHydrogen(input, input.quick);
      if (handled) return;
      // The plain read never came back (provider down). Fall through to the gateway pipeline below.
    }
    if (input.mode === "score") {
      const score = await runScoreCall(input.images);
      const usd = await settleCalls(score.costs, input.reserved, input.mode, input.appUserId, input.usage);
      if (score.noDeer || !score.result) {
        await input.refund();
        await input.releaseFairUse();
        const remote = await loadRemoteConfig().catch(() => null);
        await saveJob({
          ...input.job,
          status: "error",
          provisional: null,
          error: noDeerJobForMode("score", noDeerCopy(remote?.copy)),
        });
        return;
      }
      const record = await issueRecord({
        appUserId: input.appUserId,
        images: input.images,
        mode: input.mode,
        result: score.result,
        minimum: input.minimum,
      });
      await saveJob({
        ...input.job,
        status: "done",
        final: { ok: true, mode: input.mode, estimatedCostUsd: usd, record, result: score.result, backupEstimate: score.backup },
      });
      return;
    }
    if (input.mode === "age" && input.engine === "hydrogen") {
      await saveJob({
        ...input.job,
        provisional: { fieldCall: "HOLD", note: "Hold, checking his body.", ageClass: "" },
      });
      const started = Date.now();
      const remote = await loadRemoteConfig();
      const aging = remote.aging;
      const budget = createScanBudget(aging.callTimeoutMs);
      const caller = geminiCaller(input.images[0], input.usage, { timeoutMs: aging.callTimeoutMs, budget });
      const progress = ageProgress((next) => saveProgress(input.job, next), {
        startedAt: input.job.progress?.startedAt,
        crossCheck: aging.crossCheck,
      });
      // Runs beside the age read; it only draws outlines and never changes the age.
      const outlines = aging.bodyBoxes ? findBodyBoxes(input.images[0], gatewayBoxCaller) : null;
      const resolved = await resolveHydrogenAge({
        minimum: input.minimum,
        rangeNote: aging.rangeNote,
        backupOnStop: aging.router === "c4nr",
        circuitOpen: () => circuitOpen("gemini"),
        note: (ok) => circuitNote("gemini", ok),
        primary: () => ageWithRouter({ call: caller, settings: aging, progress }),
        backup: async () => {
          const age = await runAgeCall(input.images[0], input.minimum);
          if (age.stop === "not_deer") return { kind: "no_deer" };
          return age.result;
        },
      });
      console.log(JSON.stringify({
        event: "provider_latency",
        provider: resolved.kind === "age" && resolved.backup ? "gateway" : "gemini",
        ms: Date.now() - started,
        backup: resolved.kind === "age" && resolved.backup,
      }));
      if (resolved.kind !== "age") {
        const plan = hydrogenFinishPlan(resolved.kind);
        if (!plan.charge) {
          await input.refund();
          await input.releaseFairUse();
        }
        const error = resolved.kind === "no_deer"
          ? noDeerJobError(noDeerCopy(remote.copy))
          : resolved.kind === "retake"
            ? { code: "retake", message: resolved.message }
            : { code: "upstream", message: "DeerAge couldn't finish this photo. Try it once more." };
        await saveJob({
          ...input.job,
          status: "error",
          provisional: resolved.kind === "no_deer" ? null : input.job.provisional,
          error,
        });
        return;
      }
      progress.finishing();
      const found = outlines ? await outlines : null;
      const result = found ? withOverlays(resolved.result, found.boxes) : resolved.result;
      if (found) {
        console.log(JSON.stringify({
          event: "body_boxes",
          parts: Object.keys(found.boxes).length,
          overlays: Array.isArray(result.overlays) ? result.overlays.length : 0,
          usd: Number(found.usd.toFixed(6)),
        }));
      }
      const usd = await settleHydrogen(input.usage, input.reserved, input.mode, input.appUserId, found?.usd ?? 0);
      const record = await issueRecord({
        appUserId: input.appUserId,
        images: input.images,
        mode: input.mode,
        result,
        minimum: input.minimum,
      });
      await saveJob({
        ...input.job,
        status: "done",
        provisional: { fieldCall: "HOLD", note: "Hold, checking his body.", ageClass: "" },
        final: {
          ok: true,
          mode: input.mode,
          model: resolved.backup ? "gateway-backup" : HYDROGEN_MODEL,
          estimatedCostUsd: usd,
          record,
          result,
          backup: resolved.backup,
        },
      });
      return;
    }
    const age = await runAgeCall(input.images[0], input.minimum, (provisional) => {
      void saveJob({ ...input.job, provisional });
    });
    if (age.error === "upstream" || (!age.stop && !age.result)) {
      if (age.costs.length > 0) {
        await settleCalls(age.costs, input.reserved, input.mode, input.appUserId, input.usage);
      }
      await input.refund();
      await input.releaseFairUse();
      console.log(JSON.stringify({ event: "analysis_failed", mode: input.mode, reason: "no_reading", calls: age.costs.length }));
      await saveJob({
        ...input.job,
        status: "error",
        error: { code: "upstream", message: "Analysis failed. Try again in a moment." },
      });
      return;
    }
    if (age.stop || !age.result) {
      if (age.costs.length > 0) {
        await settleCalls(age.costs, input.reserved, input.mode, input.appUserId, input.usage);
      }
      await input.refund();
      await input.releaseFairUse();
      const code = age.stop ?? "unreadable";
      const remote = code === "not_deer" ? await loadRemoteConfig().catch(() => null) : null;
      await saveJob({
        ...input.job,
        status: "error",
        provisional: code === "not_deer" ? null : input.job.provisional,
        error: code === "not_deer"
          ? noDeerJobForMode(input.mode === "quick" ? "quick" : "age", noDeerCopy(remote?.copy))
          : { code, message: STOP_MESSAGE[code] },
      });
      return;
    }
    const usd = await settleCalls(age.costs, input.reserved, input.mode, input.appUserId, input.usage);
    const record = await issueRecord({
      appUserId: input.appUserId,
      images: input.images,
      mode: input.mode,
      result: age.result,
      minimum: input.minimum,
    });
    await saveJob({
      ...input.job,
      status: "done",
      provisional: age.provisional,
      final: {
        ok: true,
        mode: input.mode,
        estimatedCostUsd: usd,
        record,
        readings: age.readings,
        result: age.result,
      },
    });
  } catch (error) {
    console.log(JSON.stringify({
      event: "analysis_failed",
      mode: input.mode,
      reason: "exception",
      message: error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
    }));
    await input.refund().catch(() => undefined);
    await input.releaseFairUse().catch(() => undefined);
    await saveJob({
      ...input.job,
      status: "error",
      error: { code: "upstream", message: "Analysis failed. Try again in a moment." },
    });
  }
}

/** Hydrogen Quick Check. Returns false only when the plain call failed and the gateway should try. */
async function finishQuickHydrogen(
  input: Parameters<typeof finishJob>[0],
  quick: { config: QuickConfig; engine: Exclude<QuickEngine, "gateway">; leaseRules: boolean | undefined },
): Promise<boolean> {
  await saveJob({
    ...input.job,
    provisional: { fieldCall: "HOLD", note: "Hold, checking his body.", ageClass: "" },
  });
  const remote = await loadRemoteConfig();
  const aging = remote.aging;
  const budget = createScanBudget(aging.callTimeoutMs);
  const caller = geminiCaller(input.images[0], input.usage, { timeoutMs: aging.callTimeoutMs, budget });
  const started = Date.now();
  const outcome = await runQuickHydrogen({
    engine: quick.engine,
    call: caller,
    minimum: input.minimum,
    leaseRules: quick.leaseRules,
    config: quick.config,
    rangeNote: aging.rangeNote,
    resolveFull: (plain) => resolveHydrogenAge({
      minimum: input.minimum,
      rangeNote: aging.rangeNote,
      backupOnStop: aging.router === "c4nr",
      circuitOpen: () => circuitOpen("gemini"),
      note: (ok) => circuitNote("gemini", ok),
      primary: () => ageWithRouter({
        call: caller,
        settings: aging,
        plain,
        progress: ageProgress((next) => saveProgress(input.job, next), {
          startedAt: input.job.progress?.startedAt,
          crossCheck: aging.crossCheck,
        }),
      }),
      backup: async () => {
        if (plain) return { ageYears: plain[0] };
        const age = await runAgeCall(input.images[0], input.minimum);
        if (age.stop === "not_deer") return { kind: "no_deer" };
        return age.result;
      },
    }),
  });
  if (outcome.kind === "fail" && outcome.reason === "plain_call_failed") {
    console.log(JSON.stringify({ event: "provider_fallback", provider: "gemini", mode: "quick", to: "gateway" }));
    return false;
  }
  const usd = await settleHydrogen(input.usage, input.reserved, input.mode, input.appUserId);
  console.log(JSON.stringify({
    event: "quick_engine",
    engine: quick.engine,
    leaseRules: quick.leaseRules ?? null,
    outcome: outcome.kind,
    escalated: outcome.kind === "age" ? outcome.escalated : false,
    backup: outcome.kind === "age" ? outcome.backup : false,
    estimatedCostUsd: usd,
    ms: Date.now() - started,
  }));
  if (outcome.kind === "no_deer") {
    await input.refund();
    await input.releaseFairUse();
    await saveJob({ ...input.job, status: "error", provisional: null, error: noDeerJobForMode("quick", noDeerCopy(remote.copy)) });
    return true;
  }
  if (outcome.kind === "fail") {
    await input.refund();
    await input.releaseFairUse();
    console.log(JSON.stringify({ event: "analysis_failed", mode: input.mode, reason: outcome.reason }));
    await saveJob({ ...input.job, status: "error", error: { code: "upstream", message: "Analysis failed. Try again in a moment." } });
    return true;
  }
  const result = toQuickShape(outcome.result, { engine: quick.engine, escalated: outcome.escalated, plainAge: outcome.plainAge });
  const record = await issueRecord({
    appUserId: input.appUserId,
    images: input.images,
    mode: input.mode,
    result,
    minimum: input.minimum,
  });
  await saveJob({
    ...input.job,
    status: "done",
    final: {
      ok: true,
      mode: input.mode,
      model: HYDROGEN_MODEL,
      quickEngine: quick.engine,
      escalated: outcome.escalated,
      estimatedCostUsd: usd,
      record,
      result,
      backup: outcome.backup,
    },
  });
  return true;
}

async function settleHydrogen(usage: TokenUsage, reserved: number, mode: string, appUserId: string, extraUsd = 0): Promise<number> {
  const estimated = costUsd(usage, {
    inputPerMillion: geminiInputUsdPerMillion(),
    outputPerMillion: geminiOutputUsdPerMillion(),
  }) + Math.max(0, extraUsd);
  await reconcileSpend(reserved, estimated);
  console.log(JSON.stringify({
    event: "analysis_cost",
    mode,
    model: HYDROGEN_MODEL,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    estimatedCostUsd: Number(estimated.toFixed(6)),
    appUserIdPrefix: appUserId.slice(0, 16),
  }));
  return Number(estimated.toFixed(6));
}

async function settleCalls(calls: ModelCall[], reserved: number, mode: string, appUserId: string, usage: TokenUsage): Promise<number> {
  for (const call of calls) {
    usage.promptTokens += call.promptTokens;
    usage.completionTokens += call.completionTokens;
  }
  const gateway = calls.reduce((sum, call) => sum + call.usd, 0);
  const estimated = gateway > 0 ? gateway : costUsd(usage);
  await reconcileSpend(reserved, estimated);
  console.log(JSON.stringify({
    event: "analysis_cost",
    mode,
    model: calls.map((call) => `${call.role}:${call.model}`).join(","),
    models: calls.map((call) => ({ role: call.role, model: call.model, usd: call.usd, ms: call.ms })),
    estimatedCostUsd: Number(estimated.toFixed(6)),
    appUserIdPrefix: appUserId.slice(0, 16),
  }));
  return Number(estimated.toFixed(6));
}

export async function handleJobStatus(id: string): Promise<{ status: number; body: unknown }> {
  if (!/^job_[a-f0-9]{16}$/.test(id)) {
    return { status: 400, body: { ok: false, code: "invalid_request", message: "That job id is not valid." } };
  }
  const job = await loadJob(id);
  if (!job) return { status: 404, body: { ok: false, code: "invalid_request", message: "No scan with that id." } };
  return { status: 200, body: { ok: true, ...job, serverNow: Date.now() } };
}

