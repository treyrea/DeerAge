/**
 * Remote config the owner can change without an app release.
 * Stored in Redis. Env defaults still apply when Redis is empty or down.
 */

import { fairUsePerDay, fairUsePerMonth } from "./limits.js";
import { allowBucket, ensureRedis, readJson, redisSet } from "./kv.js";
import { FREE_LIFETIME_ANALYSES } from "./config.js";
import {
  CROSSCHECK_PROMPT_MAX,
  defaultAgingConfig,
  normalizeAging,
  PLAIN_PROMPT_MAX,
  RANGE_NOTE_MAX,
  clampCallTimeout,
  type AgingConfig,
} from "./hydrogen/aging.js";
import {
  ApiError,
  type Incoming,
  type Outgoing,
  asRecord,
  callerKey,
  catchApi,
  cleanText,
  fail,
  limitFromEnv,
  ok,
  requireAdmin,
} from "./wire.js";

const KEY = "deerage:remote-config";

export const FLAG_NAMES = [
  "feed",
  "polls",
  "pushPrompt",
  "emailPrompt",
  "legacyCard",
  "harvestCheck",
  "ratingPrompt",
  "shootOrPass",
  "preShotRecord",
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

export interface RemoteConfig {
  minSupportedVersion: string;
  recommendedVersion: string;
  minVersion: string;
  latestVersion: string;
  flags: Record<FlagName, boolean>;
  copy: {
    paywallHeadline: string;
    paywallSubhead: string;
    homeTips: string[];
    seasonalBanner: string;
    regionHeadsUp: string;
    leaseManagerText: string;
    leaseManagerButton: string;
    /** Empty means the app uses its built-in verdict words. */
    verdictTake: string;
    verdictWalk: string;
    verdictLook: string;
    verdictNote: string;
    setMinimumPrompt: string;
  };
  products: {
    offeringId: string;
    seasonPassId: string;
    monthlyId: string;
    winBackOfferId: string;
  };
  aging: AgingConfig;
}

function productId(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : fallback;
}

export function defaultProducts(): RemoteConfig["products"] {
  return {
    offeringId: productId("PAYWALL_OFFERING_ID", "default"),
    seasonPassId: productId("SEASON_PASS_PRODUCT_ID", "deerage_season"),
    monthlyId: productId("MONTHLY_PRODUCT_ID", "deerage_monthly"),
    winBackOfferId: productId("WIN_BACK_OFFER_ID", ""),
  };
}

function versionOr(value: string | undefined, fallback: string): string {
  const text = value?.trim() ?? "";
  return /^\d+\.\d+\.\d+$/.test(text) ? text : fallback;
}

export function defaultRemoteConfig(): RemoteConfig {
  const flags = {} as Record<FlagName, boolean>;
  for (const name of FLAG_NAMES) flags[name] = true;
  return {
    minSupportedVersion: versionOr(process.env.MIN_SUPPORTED_VERSION, "1.0.0"),
    recommendedVersion: versionOr(process.env.LATEST_APP_VERSION, "1.0.9"),
    minVersion: versionOr(process.env.MIN_APP_VERSION, "1.0.8"),
    latestVersion: versionOr(process.env.LATEST_APP_VERSION, "1.0.9"),
    flags,
    copy: {
      paywallHeadline: "",
      paywallSubhead: "",
      homeTips: [],
      seasonalBanner: "",
      regionHeadsUp: "",
      leaseManagerText: "",
      leaseManagerButton: "",
      verdictTake: "",
      verdictWalk: "",
      verdictLook: "",
      verdictNote: "",
      setMinimumPrompt: "",
    },
    products: defaultProducts(),
    aging: defaultAgingConfig(),
  };
}

function mergeConfig(stored: unknown): RemoteConfig {
  const base = defaultRemoteConfig();
  if (!stored || typeof stored !== "object") return base;
  const row = stored as Partial<RemoteConfig>;
  const flags = { ...base.flags };
  if (row.flags && typeof row.flags === "object") {
    for (const name of FLAG_NAMES) {
      const value = (row.flags as Record<string, unknown>)[name];
      if (typeof value === "boolean") flags[name] = value;
    }
  }
  const copy = { ...base.copy };
  if (row.copy && typeof row.copy === "object") {
    const incoming = row.copy as Record<string, unknown>;
    if (typeof incoming.paywallHeadline === "string") copy.paywallHeadline = incoming.paywallHeadline.slice(0, 80);
    if (typeof incoming.paywallSubhead === "string") copy.paywallSubhead = incoming.paywallSubhead.slice(0, 180);
    if (typeof incoming.seasonalBanner === "string") copy.seasonalBanner = incoming.seasonalBanner.slice(0, 80);
    if (typeof incoming.regionHeadsUp === "string") copy.regionHeadsUp = incoming.regionHeadsUp.slice(0, 280);
    if (typeof incoming.leaseManagerText === "string") copy.leaseManagerText = incoming.leaseManagerText.slice(0, 500);
    if (typeof incoming.leaseManagerButton === "string") copy.leaseManagerButton = incoming.leaseManagerButton.slice(0, 80);
    if (typeof incoming.verdictTake === "string") copy.verdictTake = incoming.verdictTake.slice(0, 24);
    if (typeof incoming.verdictWalk === "string") copy.verdictWalk = incoming.verdictWalk.slice(0, 24);
    if (typeof incoming.verdictLook === "string") copy.verdictLook = incoming.verdictLook.slice(0, 32);
    if (typeof incoming.verdictNote === "string") copy.verdictNote = incoming.verdictNote.slice(0, 160);
    if (typeof incoming.setMinimumPrompt === "string") copy.setMinimumPrompt = incoming.setMinimumPrompt.slice(0, 120);
    if (Array.isArray(incoming.homeTips)) {
      copy.homeTips = incoming.homeTips.filter((tip): tip is string => typeof tip === "string" && tip.trim().length > 0).slice(0, 4).map((tip) => tip.slice(0, 120));
    }
  }
  const products = { ...base.products };
  const incomingProducts = row.products && typeof row.products === "object" ? row.products as Record<string, unknown> : {};
  for (const name of ["offeringId", "seasonPassId", "monthlyId", "winBackOfferId"] as const) {
    const value = incomingProducts[name];
    if (typeof value === "string" && (value === "" || /^[A-Za-z0-9._-]{1,80}$/.test(value))) products[name] = value;
  }
  return {
    minSupportedVersion: versionOr(row.minSupportedVersion, base.minSupportedVersion),
    recommendedVersion: versionOr(row.recommendedVersion, base.recommendedVersion),
    minVersion: versionOr(row.minVersion, base.minVersion),
    latestVersion: versionOr(row.latestVersion, base.latestVersion),
    flags,
    copy,
    products,
    aging: normalizeAging(row.aging),
  };
}

export async function loadRemoteConfig(): Promise<RemoteConfig> {
  try {
    ensureRedis();
    return mergeConfig(await readJson<unknown>(KEY, null));
  } catch {
    return defaultRemoteConfig();
  }
}

export async function publicConfigPayload() {
  const config = await loadRemoteConfig();
  return {
    ok: true,
    minVersion: config.minVersion,
    latestVersion: config.latestVersion,
    minSupportedVersion: config.minSupportedVersion,
    recommendedVersion: config.recommendedVersion,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-sol",
    freeLifetimeAnalyses: FREE_LIFETIME_ANALYSES,
    fairUsePerDay: fairUsePerDay(),
    fairUsePerMonth: fairUsePerMonth(),
    flags: config.flags,
    copy: config.copy,
    products: config.products,
  };
}

function boolOf(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function patchText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new ApiError(400, "invalid_request", `${label} must be text.`);
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (text.length > max) throw new ApiError(400, "invalid_request", `${label} is too long.`);
  return text;
}

/** Applies an admin aging patch. Empty prompt strings clear back to the bundled files. */
export function patchAging(current: AgingConfig, incoming: unknown): AgingConfig {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    throw new ApiError(400, "invalid_request", "aging must be an object.");
  }
  const row = incoming as Record<string, unknown>;
  const next: AgingConfig = { ...current };
  if (row.router != null) {
    if (row.router !== "c4nr" && row.router !== "off") {
      throw new ApiError(400, "invalid_request", "aging.router must be c4nr or off.");
    }
    next.router = row.router;
  }
  if (row.crossCheck != null) {
    const value = boolOf(row.crossCheck);
    if (value == null) throw new ApiError(400, "invalid_request", "aging.crossCheck must be true or false.");
    next.crossCheck = value;
  }
  if (row.plainPrompt != null) next.plainPrompt = patchText(row.plainPrompt, PLAIN_PROMPT_MAX, "aging.plainPrompt");
  if (row.crossCheckPrompt != null) {
    next.crossCheckPrompt = patchText(row.crossCheckPrompt, CROSSCHECK_PROMPT_MAX, "aging.crossCheckPrompt");
  }
  if (row.callTimeoutMs != null) next.callTimeoutMs = clampCallTimeout(row.callTimeoutMs);
  if (row.rangeNote != null) {
    const note = patchText(row.rangeNote, RANGE_NOTE_MAX, "aging.rangeNote");
    if (note && !note.includes("{label}")) {
      throw new ApiError(400, "invalid_request", "aging.rangeNote must include {label}.");
    }
    next.rangeNote = note || defaultAgingConfig().rangeNote;
  }
  return next;
}

export async function handleAdminConfigRequest(req: Incoming): Promise<Outgoing> {
  try {
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
    if (req.method === "GET") return ok({ config: await loadRemoteConfig() });
    if (req.method !== "PATCH" && req.method !== "POST") return fail(405, "invalid_request", "Use GET or PATCH.");
    const body = asRecord(req.body);
    const current = await loadRemoteConfig();
    if (body.minSupportedVersion != null) current.minSupportedVersion = versionOr(cleanText(body.minSupportedVersion, 20), current.minSupportedVersion);
    if (body.recommendedVersion != null) current.recommendedVersion = versionOr(cleanText(body.recommendedVersion, 20), current.recommendedVersion);
    if (body.minVersion != null) current.minVersion = versionOr(cleanText(body.minVersion, 20), current.minVersion);
    if (body.latestVersion != null) current.latestVersion = versionOr(cleanText(body.latestVersion, 20), current.latestVersion);
    if (body.flags && typeof body.flags === "object") {
      for (const name of FLAG_NAMES) {
        const value = boolOf((body.flags as Record<string, unknown>)[name]);
        if (value != null) current.flags[name] = value;
      }
    }
    if (body.paywallHeadline != null) current.copy.paywallHeadline = body.paywallHeadline === "" ? "" : cleanText(body.paywallHeadline, 80);
    if (body.paywallSubhead != null) current.copy.paywallSubhead = body.paywallSubhead === "" ? "" : cleanText(body.paywallSubhead, 180);
    if (body.seasonalBanner != null) current.copy.seasonalBanner = body.seasonalBanner === "" ? "" : cleanText(body.seasonalBanner, 80);
    if (body.regionHeadsUp != null) current.copy.regionHeadsUp = body.regionHeadsUp === "" ? "" : cleanText(body.regionHeadsUp, 280);
    if (body.leaseManagerText != null) current.copy.leaseManagerText = body.leaseManagerText === "" ? "" : cleanText(body.leaseManagerText, 500);
    if (body.leaseManagerButton != null) current.copy.leaseManagerButton = body.leaseManagerButton === "" ? "" : cleanText(body.leaseManagerButton, 80);
    if (body.verdictTake != null) current.copy.verdictTake = body.verdictTake === "" ? "" : cleanText(body.verdictTake, 24);
    if (body.verdictWalk != null) current.copy.verdictWalk = body.verdictWalk === "" ? "" : cleanText(body.verdictWalk, 24);
    if (body.verdictLook != null) current.copy.verdictLook = body.verdictLook === "" ? "" : cleanText(body.verdictLook, 32);
    if (body.verdictNote != null) current.copy.verdictNote = body.verdictNote === "" ? "" : cleanText(body.verdictNote, 160);
    if (body.setMinimumPrompt != null) current.copy.setMinimumPrompt = body.setMinimumPrompt === "" ? "" : cleanText(body.setMinimumPrompt, 120);
    if (body.products && typeof body.products === "object") {
      const incoming = body.products as Record<string, unknown>;
      for (const name of ["offeringId", "seasonPassId", "monthlyId", "winBackOfferId"] as const) {
        if (typeof incoming[name] !== "string") continue;
        const value = incoming[name] as string;
        if (value === "" || /^[A-Za-z0-9._-]{1,80}$/.test(value)) current.products[name] = value;
      }
    }
    if (Array.isArray(body.homeTips)) {
      current.copy.homeTips = body.homeTips.filter((tip): tip is string => typeof tip === "string").map((tip) => tip.trim()).filter(Boolean).slice(0, 4);
    }
    if (body.aging != null) current.aging = patchAging(current.aging, body.aging);
    await redisSet(KEY, JSON.stringify(current));
    return ok({ config: current });
  } catch (error) {
    if (error instanceof ApiError && error.code === "invalid_request") return catchApi(error, "Couldn't save that config.");
    return catchApi(error, "Couldn't save that config.");
  }
}
