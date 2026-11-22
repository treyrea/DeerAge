/**
 * Quick Check end to end through runAnalysis and the job, with fetch scripted:
 * Upstash counters in memory and Gemini replies from a list. No photos, no network.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { handleJobStatus, runAnalysis } from "./analyze.js";
import { setKvForTests, type Kv } from "./kv.js";

const IMAGE = "a".repeat(200);
const ENV = {
  UPSTASH_REDIS_REST_URL: "https://redis.test",
  UPSTASH_REDIS_REST_TOKEN: "test",
  GEMINI_API_KEY: "test-gemini",
  DEERAGE_EVAL_TOKEN: "eval-token",
  AI_GATEWAY_API_KEY: "",
};
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let gemini: Array<string | number> = [];
let geminiPrompts: string[] = [];
const counters = new Map<string, number>();

function redis(args: (string | number)[]): unknown {
  const [op, key, value] = args.map(String);
  if (op === "INCR") { counters.set(key, (counters.get(key) ?? 0) + 1); return counters.get(key); }
  if (op === "INCRBYFLOAT") { counters.set(key, (counters.get(key) ?? 0) + Number(value)); return String(counters.get(key)); }
  if (op === "GET") return counters.has(key) ? String(counters.get(key)) : null;
  return 1;
}

beforeEach(() => {
  for (const [name, value] of Object.entries(ENV)) {
    saved[name] = process.env[name];
    if (value) process.env[name] = value;
    else delete process.env[name];
  }
  counters.clear();
  gemini = [];
  geminiPrompts = [];
  setKvForTests(new MemoryKv());
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const target = String(url);
    if (target.startsWith("https://redis.test")) {
      const body = JSON.parse(String(init?.body ?? "[]")) as (string | number)[][] | (string | number)[];
      if (target.endsWith("/pipeline")) {
        return new Response(JSON.stringify((body as (string | number)[][]).map((cmd) => ({ result: redis(cmd) }))));
      }
      return new Response(JSON.stringify({ result: redis(body as (string | number)[]) }));
    }
    if (target.includes("generativelanguage")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { contents: Array<{ parts: Array<{ text?: string }> }> };
      geminiPrompts.push(request.contents[0].parts.find((part) => part.text)?.text ?? "");
      const next = gemini.shift();
      if (typeof next === "number" || next === undefined) return new Response("{}", { status: typeof next === "number" ? next : 500 });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: next }] } }],
        usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 200, thoughtsTokenCount: 700 },
      }));
    }
    throw new Error(`unexpected fetch ${target}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setKvForTests(null);
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function scan(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const started = await runAnalysis({ mode: "quick", appUserId: "hunter-1", images: [IMAGE], ...body }, { evalToken: "eval-token" });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  const jobId = (started.body as { jobId: string }).jobId;
  for (let i = 0; i < 100; i += 1) {
    const status = await handleJobStatus(jobId);
    const job = status.body as Record<string, unknown>;
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job did not finish");
}

test("Quick Check: a car is not_deer from one Hydrogen read", async () => {
  gemini = ["There is no deer here, just a car.\n\nDEER_PRESENT: NO"];
  const job = await scan({ minimumShooterAge: 4.5 });
  assert.equal(job.status, "error");
  assert.equal((job.error as { code: string }).code, "not_deer");
  assert.equal(geminiPrompts.length, 1);
  assert.match(geminiPrompts[0], /DEER_PRESENT/);
});

test("Quick Check: a curious user's buck is one read at about a cent", async () => {
  gemini = ["This buck is **2.5 years old**.\n\n* **Neck:** Slim neck.\n\nDEER_PRESENT: YES"];
  const job = await scan({ minimumShooterAge: 4.5, leaseRules: false });
  assert.equal(job.status, "done");
  const final = job.final as { estimatedCostUsd: number; quickEngine: string; escalated: boolean; model: string; result: Record<string, unknown> };
  assert.equal(final.quickEngine, "plain_escalate");
  assert.equal(final.escalated, false);
  assert.equal(final.model, "gemini-4-hydrogen");
  assert.equal(final.result.ageYears, 2.5);
  assert.equal(final.result.fieldCall, "LET WALK");
  assert.ok(final.estimatedCostUsd > 0.006 && final.estimatedCostUsd < 0.01, String(final.estimatedCostUsd));
  assert.equal(geminiPrompts.length, 1);
});

test("Quick Check: Gemini down and no gateway key is an upstream error, never an age", async () => {
  gemini = [500, 500];
  const job = await scan({ minimumShooterAge: 4.5, leaseRules: false });
  assert.equal(job.status, "error");
  assert.equal((job.error as { code: string }).code, "upstream");
  assert.equal(job.final, null);
});

test("Quick Check: a reply with no age is an upstream error", async () => {
  gemini = ["Too dark to say.\n\nDEER_PRESENT: YES", "Still too dark.\n\nDEER_PRESENT: YES"];
  const job = await scan({ minimumShooterAge: 4.5, leaseRules: false });
  assert.equal(job.status, "error");
  assert.equal((job.error as { code: string }).code, "upstream");
});

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
