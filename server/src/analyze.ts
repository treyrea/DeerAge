import { costUsd, emptyUsage, inputUsdPerMillion, outputUsdPerMillion, reserveUsd, type TokenUsage } from "./cost.js";
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
import { reasoningTokenHeadroom, UpstreamError, usesCompletionTokenCap, visionJson } from "./openai.js";
import { agePrompt, baselinePrompt, quickPrompt, scorePrompt, type HuntContext } from "./prompts.js";
import { consensusRack, median, num, rackIsUnmeasurable, readScale, roundHalf, scoreRack, type RackEstimate, type ScaleEstimate } from "./scoring.js";

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
  const calls = images.length;
  const maxOutput = (mode === "quick" ? 500 : mode === "score" ? 900 : mode === "age" ? 700 : 200)
    + (usesCompletionTokenCap() ? reasoningTokenHeadroom() : 0);

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

    spendReserved = reserveUsd(body.baseline ? 1 : calls, maxOutput);
    const underCap = await reserveSpend(spendReserved);
    if (!underCap) {
      if (fairUseHeld) await releaseFairUse(appUserId);
      fairUseHeld = false;
      spendReserved = 0;
      return fail(503, "busy", "DeerAge is busy right now. Try again in a little while.");
    }

    const context = contextOf(body);
    const result = body.baseline
      ? await runBaseline(images[0], usage)
      : mode === "quick"
        ? await runQuick(images[0], context, usage)
        : mode === "age"
          ? await runAge(images, context, usage)
          : await runScore(images, context, usage);

    const estimatedCostUsd = await settleCost(usage, spendReserved, mode, appUserId);
    spendReserved = 0;

    if (result && typeof result === "object" && "invalid" in result) {
      await refund();
      return fail(result.status, result.code, result.message);
    }

    const remaining = !access || access.entitled || isEval ? null : Math.max(0, FREE_LIFETIME_ANALYSES - (access.freeUsesUsed + 1));
    return {
      status: 200,
      body: {
        ok: true,
        mode,
        model: modelName(),
        baseline: Boolean(body.baseline),
        latencyMs: Date.now() - started,
        entitled: Boolean(access?.entitled),
        freeUsesRemaining: remaining,
        fairUsePerDay: fairUsePerDay(),
        estimatedCostUsd,
        result,
      },
    };
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

interface InvalidPhoto {
  invalid: true;
  status: number;
  code: FailureCode;
  message: string;
}

function invalidFrom(reason: string | undefined, fallback: string): InvalidPhoto {
  if (reason === "head_only" || reason === "head_mount" || reason === "no_body" || reason === "no_body_visible") {
    return { invalid: true, status: 422, code: "no_body", message: "The deer's body isn't visible enough to age. Use a broadside photo of the whole deer." };
  }
  if (reason === "no_antlers") {
    return { invalid: true, status: 422, code: "no_antlers", message: "No antlers are visible in this photo." };
  }
  if (reason === "poor_quality") {
    return { invalid: true, status: 422, code: "poor_quality", message: "The photo is too dark or blurry to analyze. Try a clearer shot." };
  }
  return { invalid: true, status: 422, code: "not_deer", message: fallback };
}

async function runQuick(image: string, context: HuntContext, usage: TokenUsage) {
  const raw = await visionJson({
    prompt: quickPrompt(context),
    images: [image],
    detail: "low",
    maxTokens: 500,
    timeoutMs: 25_000,
    retries: 1,
    usage,
  });
  if (raw.isValidImage === false) {
    return invalidFrom(typeof raw.invalidImageReason === "string" ? raw.invalidImageReason : "not_deer", "This photo doesn't show a deer.");
  }
  const ageYears = roundHalf(num(raw.ageYears) || 3.5);
  const goal = context.minimumShooterAge ?? 4.5;
  const decision = raw.decision === "SHOOT" || raw.decision === "LET WALK" ? raw.decision : ageYears >= goal ? "SHOOT" : "LET WALK";
  return {
    ...raw,
    decision,
    ageYears,
    isValidImage: true,
    disclaimer: "Age estimates are based on proportional body characteristics and represent age classes, not exact age.",
  };
}

interface AgeFrame {
  ageYears: number;
  confidence: number;
  ageCall: "young" | "middle-aged" | "mature";
  meetsMinimum: boolean;
  explanation: string;
  imageQuality: "good" | "fair" | "poor";
  topCues: string[];
  cues: Array<Record<string, unknown>>;
  scale: ScaleEstimate;
  isValidDeer: boolean;
  invalidReason?: string;
}

function ageCallOf(years: number): "young" | "middle-aged" | "mature" {
  if (years >= 4.5) return "mature";
  if (years >= 3.5) return "middle-aged";
  return "young";
}

function ageBand(years: number): string {
  if (years < 2.5) return "1.5-2.5 years";
  if (years < 3.5) return "2.5-3.5 years";
  if (years < 4.5) return "3.5-4.5 years";
  if (years < 5.5) return "4.5-5.5 years";
  return "5.5+ years";
}

async function oneAge(image: string, context: HuntContext, usage: TokenUsage): Promise<AgeFrame | InvalidPhoto> {
  const raw = await visionJson({
    prompt: agePrompt(context),
    images: [image],
    detail: "low",
    maxTokens: 700,
    timeoutMs: 25_000,
    usage,
  });
  if (raw.isValidDeer === false) {
    return invalidFrom(typeof raw.invalidReason === "string" ? raw.invalidReason : "not_deer", "This photo doesn't show a deer.");
  }
  const ageYears = roundHalf(num(raw.ageYears) || 2.5);
  const quality = raw.imageQuality === "good" || raw.imageQuality === "poor" ? raw.imageQuality : "fair";
  return {
    ageYears,
    confidence: Math.max(0, Math.min(100, Math.round(num(raw.confidence) || 50))),
    ageCall: ageCallOf(ageYears),
    meetsMinimum: ageYears >= (context.minimumShooterAge ?? 4.5),
    explanation: typeof raw.explanation === "string" ? raw.explanation : "",
    imageQuality: quality,
    topCues: Array.isArray(raw.topCues) ? raw.topCues.filter((cue): cue is string => typeof cue === "string").slice(0, 3) : [],
    cues: Array.isArray(raw.cues) ? (raw.cues as Array<Record<string, unknown>>) : [],
    scale: readScale(raw.scale),
    isValidDeer: true,
  };
}

async function runAge(images: string[], context: HuntContext, usage: TokenUsage) {
  const settled = await Promise.all(images.map(async (image) => {
    try {
      return await oneAge(image, context, usage);
    } catch (error) {
      return error;
    }
  }));
  const frames = settled.filter((item): item is AgeFrame => Boolean(item) && !(item instanceof Error) && !("invalid" in (item as object)));
  if (frames.length === 0) {
    const invalid = settled.find((item) => item && typeof item === "object" && "invalid" in item) as InvalidPhoto | undefined;
    if (invalid) return invalid;
    const upstream = settled.find((item) => item instanceof UpstreamError);
    if (upstream) throw upstream;
    throw new UpstreamError("No frame could be analyzed.", 502, false);
  }
  const years = frames.map((frame) => frame.ageYears);
  const ageYears = roundHalf(median(years));
  const spread = Math.max(...years) - Math.min(...years);
  const agreement = Math.max(0.45, 1 - spread / 6);
  const confidence = Math.round((frames.reduce((total, frame) => total + frame.confidence, 0) / frames.length) * agreement);
  const closest = [...frames].sort((a, b) => Math.abs(a.ageYears - ageYears) - Math.abs(b.ageYears - ageYears))[0];
  const goal = context.minimumShooterAge ?? 4.5;
  const call = ageCallOf(ageYears);
  const callLabel = call === "middle-aged" ? "middle-aged" : call;
  return {
    estimatedAgeYears: ageYears,
    estimatedAge: ageBand(ageYears),
    ageCall: call,
    overallConfidence: confidence,
    meetsMinimumAge: ageYears >= goal,
    minimumAgeThreshold: goal,
    shooterPassLabel: ageYears >= goal ? "SHOOTER" : "LET WALK",
    shooterPassReason: closest.explanation || `Across ${frames.length} frame${frames.length === 1 ? "" : "s"}, the body reads ${callLabel} (${ageYears} years).`,
    topCues: closest.topCues,
    cues: closest.cues,
    imageQuality: closest.imageQuality,
    scale: frames.find((frame) => frame.scale.pixelsPerInch > 0)?.scale ?? closest.scale,
    frameVotes: years,
    frameCount: frames.length,
    consensus: "median",
  };
}

async function runScore(images: string[], context: HuntContext, usage: TokenUsage) {
  const settled = await Promise.all(images.map(async (image) => {
    try {
      const raw = await visionJson({
        prompt: scorePrompt(context),
        images: [image],
        detail: "auto",
        maxTokens: 900,
        timeoutMs: 25_000,
        usage,
      });
      return scoreRack(raw);
    } catch (error) {
      return error;
    }
  }));
  const racks = settled.filter((item): item is RackEstimate => item instanceof Object && !(item instanceof Error) && "beams" in item);
  const usable = racks.filter((rack) => rack.isValidDeer);
  if (usable.length === 0) {
    const reason = racks.find((rack) => rack.invalidReason)?.invalidReason;
    if (racks.length > 0) return invalidFrom(reason, "No antlers could be scored from these photos.");
    const upstream = settled.find((item) => item instanceof UpstreamError);
    if (upstream) throw upstream;
    throw new UpstreamError("No frame could be scored.", 502, false);
  }
  const merged = consensusRack(usable);
  if (rackIsUnmeasurable(merged)) {
    return {
      invalid: true as const,
      status: 422,
      code: "poor_quality" as const,
      message: "The rack couldn't be measured in this photo. Try a clearer, head-on shot of the antlers.",
    };
  }
  return { ...merged, frameCount: usable.length, consensus: "median-measurements" };
}

async function runBaseline(image: string, usage: TokenUsage) {
  const raw = await visionJson({
    prompt: baselinePrompt(),
    images: [image],
    detail: "low",
    maxTokens: 200,
    timeoutMs: 25_000,
    usage,
  });
  if (raw.isValidDeer === false) {
    return invalidFrom("not_deer", "This photo doesn't show a deer.");
  }
  const ageYears = roundHalf(num(raw.ageYears));
  return {
    estimatedAgeYears: ageYears,
    ageCall: raw.mature === true || ageYears >= 4.5 ? "mature" : ageCallOf(ageYears),
    grossScore: num(raw.grossScore),
    baseline: true,
  };
}
