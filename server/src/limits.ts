/**
 * Durable counters on Upstash Redis (the Vercel Marketplace integration).
 * Nothing here is kept in process memory, so a new instance sees the same totals.
 */

const DAY_TTL_SECONDS = 3 * 24 * 60 * 60;
const MONTH_TTL_SECONDS = 40 * 24 * 60 * 60;

export class LimitStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitStoreError";
  }
}

function upstashRestConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

function kvRestConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

export function redisConfigured(): boolean {
  return upstashRestConfigured() || kvRestConfigured();
}

function redisUrl(): string {
  const raw = upstashRestConfigured() ? process.env.UPSTASH_REDIS_REST_URL : process.env.KV_REST_API_URL;
  return (raw ?? "").replace(/\/$/, "");
}

function redisToken(): string {
  const raw = upstashRestConfigured() ? process.env.UPSTASH_REDIS_REST_TOKEN : process.env.KV_REST_API_TOKEN;
  return raw ?? "";
}

function intEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function fairUsePerDay(): number {
  return intEnv("FAIR_USE_DAILY", 10);
}

export function fairUsePerMonth(): number {
  return intEnv("FAIR_USE_MONTHLY", 40);
}

export function rateLimitPerMinute(isEval: boolean): number {
  return isEval ? intEnv("EVAL_RATE_LIMIT_PER_MINUTE", 120) : intEnv("RATE_LIMIT_PER_MINUTE", 8);
}

export function dailySpendCapUsd(): number {
  const parsed = Number(process.env.DAILY_SPEND_CAP_USD);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

function timeZone(): string {
  return process.env.FAIR_USE_TIMEZONE?.trim() || "America/Chicago";
}

/** "Central" from America/Chicago. An unknown zone stays Central, the documented default. */
export function fairUseZoneName(zone = timeZone()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longGeneric",
    }).formatToParts(new Date());
    const name = parts.find((part) => part.type === "timeZoneName")?.value?.trim() ?? "";
    const short = name.replace(/\s+Time$/, "").trim();
    if (short) return short;
  } catch {
    // Intl rejects a timezone the server does not know.
  }
  return "Central";
}

/** The sentence on a fair-use limit. The app shows this text as the server sent it. */
export function fairUseLimitMessage(kind: "daily" | "monthly", zoneName = fairUseZoneName()): string {
  if (kind === "monthly") {
    return `You've reached this month's limit. It resets at the start of next month, at midnight ${zoneName}.`;
  }
  return `You've reached today's limit. It resets at midnight ${zoneName}.`;
}

function zonedParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

export function dayStamp(date = new Date()): string {
  const parts = zonedParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function monthStamp(date = new Date()): string {
  const parts = zonedParts(date);
  return `${parts.year}-${parts.month}`;
}

function userKey(appUserId: string): string {
  return encodeURIComponent(appUserId).slice(0, 180);
}

async function command(args: (string | number)[]): Promise<unknown> {
  if (!redisConfigured()) throw new LimitStoreError("Usage counters are not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(redisUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${redisToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new LimitStoreError("Usage counters could not be reached.");
    const body = (await response.json()) as { result?: unknown; error?: string };
    if (body.error) throw new LimitStoreError("Usage counters could not be reached.");
    return body.result;
  } catch (error) {
    if (error instanceof LimitStoreError) throw error;
    throw new LimitStoreError("Usage counters could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
  if (!redisConfigured()) throw new LimitStoreError("Usage counters are not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${redisUrl()}/pipeline`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${redisToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!response.ok) throw new LimitStoreError("Usage counters could not be reached.");
    const body = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(body) || body.some((item) => item.error)) {
      throw new LimitStoreError("Usage counters could not be reached.");
    }
    return body.map((item) => item.result);
  } catch (error) {
    if (error instanceof LimitStoreError) throw error;
    throw new LimitStoreError("Usage counters could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

export function redisCommand(args: (string | number)[]): Promise<unknown> {
  return command(args);
}

export function redisPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  return pipeline(commands);
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

type RedisPipeline = (commands: (string | number)[][]) => Promise<unknown[]>;

/**
 * One Redis touch per key per process. A flood of requests from one client
 * must not keep writing INCR+EXPIRE after the counter is known.
 * The first touch is a single pipeline (INCR, then EXPIRE only for that key).
 * Later requests in this process are decided from memory.
 */
const REDIS_SYNCS_PER_SECOND = 200;
const RATE_DOWN_MS = 15_000;

interface RateGate {
  used: number;
  synced: boolean;
  downUntil: number;
  touched: number;
}

const rateGates = new Map<string, RateGate>();
let rateBudgetSecond = -1;
let rateBudgetUsed = 0;

export function resetRateGatesForTests(): void {
  rateGates.clear();
  rateBudgetSecond = -1;
  rateBudgetUsed = 0;
}

function sweepRateGates(now: number): void {
  if (rateGates.size < 1500) return;
  for (const [key, gate] of rateGates) {
    if (now - gate.touched > 180_000) rateGates.delete(key);
  }
}

export async function consumeRate(key: string, limit: number, ttlSeconds: number, run: RedisPipeline, now = Date.now()): Promise<boolean> {
  sweepRateGates(now);
  let gate = rateGates.get(key);
  if (!gate) {
    gate = { used: 0, synced: false, downUntil: 0, touched: now };
    rateGates.set(key, gate);
  }
  gate.touched = now;
  if (gate.downUntil > now) throw new LimitStoreError("Usage counters could not be reached.");
  if (gate.used >= limit) return false;
  if (gate.synced) {
    gate.used += 1;
    return gate.used <= limit;
  }
  const second = Math.floor(now / 1000);
  if (second !== rateBudgetSecond) {
    rateBudgetSecond = second;
    rateBudgetUsed = 0;
  }
  if (rateBudgetUsed >= REDIS_SYNCS_PER_SECOND) return false;
  rateBudgetUsed += 1;
  gate.synced = true;
  try {
    const [countRaw] = await run([
      ["INCR", key],
      ["EXPIRE", key, ttlSeconds],
    ]);
    const count = asNumber(countRaw);
    if (count <= 0) throw new LimitStoreError("Usage counters could not be reached.");
    gate.used = Math.max(gate.used, count);
    return gate.used <= limit;
  } catch (error) {
    gate.synced = false;
    gate.downUntil = now + RATE_DOWN_MS;
    rateBudgetUsed = Math.max(0, rateBudgetUsed - 1);
    if (error instanceof LimitStoreError) throw error;
    throw new LimitStoreError("Usage counters could not be reached.");
  }
}

/** Fixed one-minute bucket shared by every instance. Returns true when the call may proceed. */
export async function allowRate(appUserId: string, limit: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `deerage:rate:${userKey(appUserId)}:${bucket}`;
  return consumeRate(key, limit, 120, (commands) => pipeline(commands));
}

export type FairUseResult = "ok" | "daily" | "monthly";

/** Reserves one subscriber analysis. Call releaseFairUse if OpenAI is never billed. */
export async function reserveFairUse(appUserId: string, now = new Date()): Promise<FairUseResult> {
  const user = userKey(appUserId);
  const dayKey = `deerage:fair:${user}:d:${dayStamp(now)}`;
  const monthKey = `deerage:fair:${user}:m:${monthStamp(now)}`;
  const [dayCount, , monthCount] = await pipeline([
    ["INCR", dayKey],
    ["EXPIRE", dayKey, DAY_TTL_SECONDS],
    ["INCR", monthKey],
    ["EXPIRE", monthKey, MONTH_TTL_SECONDS],
  ]);
  const day = asNumber(dayCount);
  const month = asNumber(monthCount);
  if (day > fairUsePerDay()) {
    await pipeline([
      ["DECR", dayKey],
      ["DECR", monthKey],
    ]);
    return "daily";
  }
  if (month > fairUsePerMonth()) {
    await pipeline([
      ["DECR", dayKey],
      ["DECR", monthKey],
    ]);
    return "monthly";
  }
  return "ok";
}

export async function releaseFairUse(appUserId: string, now = new Date()): Promise<void> {
  const user = userKey(appUserId);
  await pipeline([
    ["DECR", `deerage:fair:${user}:d:${dayStamp(now)}`],
    ["DECR", `deerage:fair:${user}:m:${monthStamp(now)}`],
  ]);
}

/**
 * Adds reserveUsd to today's global spend. If the total was already at the cap,
 * the reserve is removed and the call must not reach OpenAI.
 */
export async function reserveSpend(reserveUsd: number, now = new Date()): Promise<boolean> {
  const key = `deerage:spend:${dayStamp(now)}`;
  const amount = reserveUsd.toFixed(6);
  const [afterRaw] = await pipeline([
    ["INCRBYFLOAT", key, amount],
    ["EXPIRE", key, DAY_TTL_SECONDS],
  ]);
  const after = asNumber(afterRaw);
  const before = after - reserveUsd;
  if (before >= dailySpendCapUsd()) {
    await command(["INCRBYFLOAT", key, (-reserveUsd).toFixed(6)]);
    return false;
  }
  return true;
}

/** Replaces the pre-call reserve with the cost OpenAI actually reported. */
export async function reconcileSpend(reserveUsd: number, actualUsd: number, now = new Date()): Promise<void> {
  const delta = actualUsd - reserveUsd;
  if (Math.abs(delta) < 0.0000001) return;
  const key = `deerage:spend:${dayStamp(now)}`;
  await command(["INCRBYFLOAT", key, delta.toFixed(6)]);
}
