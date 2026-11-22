/**
 * Upstash Redis access for community data.
 * Reads UPSTASH_REDIS_REST_* first, then KV_REST_API_*, same as the usage counters.
 */

import { consumeRate, redisCommand, redisConfigured, redisPipeline } from "./limits.js";
import { ApiError } from "./wire.js";

export interface Kv {
  command(args: (string | number)[]): Promise<unknown>;
  pipeline(commands: (string | number)[][]): Promise<unknown[]>;
}

const upstash: Kv = {
  command: (args) => redisCommand(args),
  pipeline: (commands) => redisPipeline(commands),
};

let active: Kv = upstash;

export function kv(): Kv {
  return active;
}

/** Tests swap in a memory store. Production uses Upstash. */
export function setKvForTests(next: Kv | null): void {
  active = next ?? upstash;
}

export function ensureRedis(): void {
  if (active !== upstash) return;
  if (!redisConfigured()) {
    throw new ApiError(503, "not_configured", "This feature is not available right now.");
  }
}

export async function allowBucket(scope: string, id: string, limit: number): Promise<void> {
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `deerage:rate:${scope}:${encodeURIComponent(id).slice(0, 140)}:${bucket}`;
  const allowed = await consumeRate(key, limit, 120, (commands) => kv().pipeline(commands));
  if (!allowed) {
    throw new ApiError(429, "rate_limited", "Too many requests. Try again in a minute.");
  }
}

export async function redisGet(key: string): Promise<string | null> {
  const value = await kv().command(["GET", key]);
  return typeof value === "string" ? value : null;
}

export async function redisSet(key: string, value: string): Promise<void> {
  await kv().command(["SET", key, value]);
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await redisGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function hashObject(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let i = 0; i < raw.length; i += 2) {
      out[String(raw[i])] = String(raw[i + 1] ?? "0");
    }
    return out;
  }
  if (typeof raw === "object") {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      out[key] = String(value ?? "0");
    }
    return out;
  }
  return {};
}

export async function membersOf(key: string): Promise<string[]> {
  const raw = await kv().command(["SMEMBERS", key]);
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item));
}
