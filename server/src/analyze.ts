import { costUsd, emptyUsage, inputUsdPerMillion, outputUsdPerMillion, type TokenUsage } from "./cost.js";
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
import { runScoreCall } from "./score-pipeline.js";
import { keepAlive, loadJob, newJobId, saveJob, type ScanJob } from "./jobs.js";
import type { ModelCall } from "./gateway.js";
interface HuntContext {
  state?: string;
  ecoregion?: string;
  homeState?: string;
  homeEcoregion?: string;
  landType?: string;
  goal?: string;
  minimumShooterAge?: number;
  species?: string;
  month?: number;
  distanceYards?: number;
  fenceType?: string;
}

export interface AnalyzeBody {
  mode?: string;
  appUserId?: string;
  images?: unknown;
  context?: HuntContext;
  baseline?: boolean;
  minimumShooterAge?: number;
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

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return fail(503, "not_configured", "The analysis service is not configured.");
  }

  let access: AccessSnapshot | null = null;
  if (!isEval) {
    if (!revenueCatConfigured()) {
      return fail(503, "not_configured", "Entitlement checks are not configured.");
    }
    try {
      access = await readAccess(appUserId);
    } catch {
      return fail(502, "upstream", "Could not verify the subscription. Try again.");
    }
    if (!access.entitled && access.freeUsesRemaining === 0) {
      return fail(402, "quota", "You've used your 3 free analyses.");
    }
    if (!access.entitled) {
      try {
        await writeFreeUses(appUserId, access.freeUsesUsed + 1);
      } catch {
        return fail(502, "upstream", "Could not reserve a free analysis. Try again.");
      }
    }
  }

  const refund = async () => {
    if (!access || access.entitled || isEval) return;
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

    spendReserved = mode === "score" ? 0.05 : 0.12;
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
    const job: ScanJob = { id: jobId, status: "running", mode, provisional: null, final: null, error: null };
    await saveJob(job);
    const reserved = spendReserved;
    spendReserved = 0;
    keepAlive(finishJob({
      job,
      images,
      mode,
      minimum,
      appUserId,
      reserved,
      usage,
      refund,
      releaseFairUse: async () => {
        if (fairUseHeld) await releaseFairUse(appUserId);
      },
    }));
    return { status: 202, body: { ok: true, jobId, mode } };
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
  refund: () => Promise<void>;
  releaseFairUse: () => Promise<void>;
}): Promise<void> {
  try {
    if (input.mode === "score") {
      const score = await runScoreCall(input.images);
      const usd = await settleCalls(score.costs, input.reserved, input.mode, input.appUserId, input.usage);
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
    const age = await runAgeCall(input.images[0], input.minimum, (provisional) => {
      void saveJob({ ...input.job, provisional });
    });
    if (age.stop || !age.result) {
      await input.refund();
      await input.releaseFairUse();
      const code = age.stop ?? "unreadable";
      await saveJob({
        ...input.job,
        status: "error",
        error: { code, message: STOP_MESSAGE[code] },
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
  } catch {
    await input.refund().catch(() => undefined);
    await input.releaseFairUse().catch(() => undefined);
    await saveJob({
      ...input.job,
      status: "error",
      error: { code: "upstream", message: "Analysis failed. Try again in a moment." },
    });
  }
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
  return { status: 200, body: { ok: true, ...job } };
}

