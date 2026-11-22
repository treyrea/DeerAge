/**
 * A subscriber who has hit the fair-use cap and buys a scan pack must get the next scan.
 * That scan spends a credit and does not count against the daily or monthly cap.
 * No photos and no network: Redis and RevenueCat are scripted, Gemini replies from a list.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { handleJobStatus, runAnalysis } from "./analyze.js";
import { setKvForTests, type Kv } from "./kv.js";
import { dayStamp, fairUsePerDay, fairUsePerMonth, fairUseLimitMessage, fairUseZoneName, monthStamp, resetRateGatesForTests } from "./limits.js";
import { readCredits } from "./scan-credits.js";

const IMAGE = "a".repeat(200);
const USER = "hunter-1";
const ENV = {
  UPSTASH_REDIS_REST_URL: "https://redis.test",
  UPSTASH_REDIS_REST_TOKEN: "test",
  GEMINI_API_KEY: "test-gemini",
  REVENUECAT_SECRET_API_KEY: "test-rc",
  FAIR_USE_TIMEZONE: "America/Chicago",
  FAIR_USE_DAILY: "10",
  FAIR_USE_MONTHLY: "40",
  DEERAGE_EVAL_TOKEN: "",
  OPENAI_API_KEY: "",
  AI_GATEWAY_API_KEY: "",
};
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
const counters = new Map<string, number>();
let gemini: Array<string | number> = [];
let entitled = true;
let store: MemoryKv;

function redis(args: (string | number)[]): unknown {
  const [op, key, value] = args.map(String);
  if (op === "INCR") {
    counters.set(key, (counters.get(key) ?? 0) + 1);
    return counters.get(key);
  }
  if (op === "DECR") {
    counters.set(key, (counters.get(key) ?? 0) - 1);
    return counters.get(key);
  }
  if (op === "INCRBYFLOAT") {
    counters.set(key, (counters.get(key) ?? 0) + Number(value));
    return String(counters.get(key));
  }
  if (op === "GET") return counters.has(key) ? String(counters.get(key)) : null;
  return 1;
}

function fairCount(part: ":d:" | ":m:"): number {
  for (const [key, value] of counters) {
    if (key.startsWith("deerage:fair:") && key.includes(part)) return value;
  }
  return 0;
}

function seedFair(day: number, month: number): void {
  counters.set(`deerage:fair:${USER}:d:${dayStamp()}`, day);
  counters.set(`deerage:fair:${USER}:m:${monthStamp()}`, month);
}

class MemoryKv implements Kv {
  private strings = new Map<string, string>();

  async command(args: (string | number)[]): Promise<unknown> {
    const [opRaw, ...rest] = args;
    const op = String(opRaw).toUpperCase();
    const key = String(rest[0] ?? "");
    if (op === "GET") return this.strings.get(key) ?? null;
    if (op === "SET") {
      this.strings.set(key, String(rest[1] ?? ""));
      return "OK";
    }
    if (op === "INCRBY") {
      const next = (Number(this.strings.get(key) ?? 0) || 0) + Number(rest[1] ?? 0);
      this.strings.set(key, String(next));
      return next;
    }
    if (op === "INCR") {
      const next = (Number(this.strings.get(key) ?? 0) || 0) + 1;
      this.strings.set(key, String(next));
      return next;
    }
    return 1;
  }

  async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const command of commands) results.push(await this.command(command));
    return results;
  }
}

beforeEach(() => {
  for (const [name, value] of Object.entries(ENV)) {
    saved[name] = process.env[name];
    if (value) process.env[name] = value;
    else delete process.env[name];
  }
  counters.clear();
  gemini = [];
  entitled = true;
  resetRateGatesForTests();
  store = new MemoryKv();
  setKvForTests(store);
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const target = String(url);
    if (target.startsWith("https://redis.test")) {
      const body = JSON.parse(String(init?.body ?? "[]")) as (string | number)[][] | (string | number)[];
      if (target.endsWith("/pipeline")) {
        return new Response(JSON.stringify((body as (string | number)[][]).map((cmd) => ({ result: redis(cmd) }))));
      }
      return new Response(JSON.stringify({ result: redis(body as (string | number)[]) }));
    }
    if (target.includes("api.revenuecat.com")) {
      return new Response(JSON.stringify({
        subscriber: {
          entitlements: entitled ? { deerage_pro: { expires_date: "2099-01-01T00:00:00Z" } } : {},
          subscriber_attributes: {},
        },
      }));
    }
    if (target.includes("generativelanguage")) {
      const next = gemini.shift();
      if (typeof next === "number" || next === undefined) return new Response("{}", { status: typeof next === "number" ? next : 500 });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: next }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 0 },
      }));
    }
    throw new Error(`unexpected fetch ${target}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setKvForTests(null);
  resetRateGatesForTests();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function giveCredits(count: number): Promise<void> {
  await store.command(["SET", `deerage:scancredit:${USER}`, String(count)]);
}

function analyze() {
  return runAnalysis({ mode: "quick", appUserId: USER, images: [IMAGE] }, { evalToken: "" });
}

async function finishedJob(jobId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 100; i += 1) {
    const status = await handleJobStatus(jobId);
    const job = status.body as Record<string, unknown>;
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job did not finish");
}

const BUCK = "This buck is **2.5 years old**.\n\n* **Neck:** Slim neck.\n\nDEER_PRESENT: YES";

describe("fair-use credits", { concurrency: 1 }, () => {
test("the fair-use sentence names midnight in the server timezone", () => {
  assert.equal(fairUseZoneName("America/Chicago"), "Central");
  assert.equal(fairUseZoneName("America/New_York"), "Eastern");
  assert.equal(fairUseZoneName("Not/AZone"), "Central");
  assert.match(fairUseLimitMessage("daily", "Central"), /today's limit/);
  assert.match(fairUseLimitMessage("daily", "Central"), /midnight Central/);
  assert.match(fairUseLimitMessage("monthly", "Central"), /this month's limit/);
  assert.match(fairUseLimitMessage("monthly", "Central"), /start of next month/);
  assert.doesNotMatch(fairUseLimitMessage("daily", "Central"), /fail/i);
});

test("a subscriber under the cap does not spend a pack credit", async () => {
  gemini = [BUCK];
  await giveCredits(3);
  seedFair(2, 4);
  const started = await analyze();
  assert.equal(started.status, 202, JSON.stringify(started.body));
  const job = await finishedJob((started.body as { jobId: string }).jobId);
  assert.equal(job.status, "done");
  assert.equal(await readCredits(USER), 3);
  assert.equal(fairCount(":d:"), 3);
  assert.equal(fairCount(":m:"), 5);
});

test("a pack credit lets a subscriber past the daily cap and is not counted", async () => {
  gemini = [BUCK];
  await giveCredits(3);
  seedFair(fairUsePerDay(), 4);
  const started = await analyze();
  assert.equal(started.status, 202, JSON.stringify(started.body));
  const job = await finishedJob((started.body as { jobId: string }).jobId);
  assert.equal(job.status, "done");
  assert.equal(await readCredits(USER), 2);
  assert.equal(fairCount(":d:"), fairUsePerDay());
  assert.equal(fairCount(":m:"), 4);
});

test("a pack credit lets a subscriber past the monthly cap and is not counted", async () => {
  gemini = [BUCK];
  await giveCredits(1);
  seedFair(2, fairUsePerMonth());
  const started = await analyze();
  assert.equal(started.status, 202, JSON.stringify(started.body));
  const job = await finishedJob((started.body as { jobId: string }).jobId);
  assert.equal(job.status, "done");
  assert.equal(await readCredits(USER), 0);
  assert.equal(fairCount(":d:"), 2);
  assert.equal(fairCount(":m:"), fairUsePerMonth());
});

test("the daily cap with no credit is a limit, and the counters stay put", async () => {
  seedFair(fairUsePerDay(), 4);
  const started = await analyze();
  assert.equal(started.status, 429);
  const body = started.body as unknown as { code: string; limit: string; message: string; creditsBypass: string };
  assert.equal(body.code, "fair_use");
  assert.equal(body.limit, "daily");
  assert.equal(body.creditsBypass, "pack");
  assert.match(body.message, /midnight Central/);
  assert.doesNotMatch(body.message, /fail/i);
  assert.equal(await readCredits(USER), 0);
  assert.equal(fairCount(":d:"), fairUsePerDay());
  assert.equal(fairCount(":m:"), 4);
});

test("the monthly cap with no credit names the month and does not count the refusal", async () => {
  seedFair(2, fairUsePerMonth());
  const started = await analyze();
  assert.equal(started.status, 429);
  const body = started.body as unknown as { code: string; limit: string; message: string; creditsBypass: string };
  assert.equal(body.code, "fair_use");
  assert.equal(body.limit, "monthly");
  assert.equal(body.creditsBypass, "pack");
  assert.match(body.message, /this month's limit/);
  assert.match(body.message, /midnight Central/);
  assert.equal(fairCount(":d:"), 2);
  assert.equal(fairCount(":m:"), fairUsePerMonth());
});

test("a credit spent past the cap is returned when the scan fails", async () => {
  gemini = [500, 500];
  await giveCredits(3);
  seedFair(fairUsePerDay(), 1);
  const started = await analyze();
  assert.equal(started.status, 202, JSON.stringify(started.body));
  const job = await finishedJob((started.body as { jobId: string }).jobId);
  assert.equal(job.status, "error");
  assert.equal(await readCredits(USER), 3);
  assert.equal(fairCount(":d:"), fairUsePerDay());
  assert.equal(fairCount(":m:"), 1);
});

test("a credit held past the cap is returned when the spend cap refuses the scan", async () => {
  await giveCredits(1);
  seedFair(fairUsePerDay(), 1);
  counters.set(`deerage:spend:${dayStamp()}`, 100);
  const started = await analyze();
  assert.equal(started.status, 503);
  assert.equal((started.body as { code: string }).code, "busy");
  assert.equal(await readCredits(USER), 1);
  assert.equal(fairCount(":d:"), fairUsePerDay());
});

test("a hunter who is not subscribed still spends a credit and does not touch fair use", async () => {
  entitled = false;
  gemini = [BUCK];
  await giveCredits(2);
  const started = await analyze();
  assert.equal(started.status, 202, JSON.stringify(started.body));
  const job = await finishedJob((started.body as { jobId: string }).jobId);
  assert.equal(job.status, "done");
  assert.equal(await readCredits(USER), 1);
  assert.equal(fairCount(":d:"), 0);
  assert.equal(fairCount(":m:"), 0);
});
});
