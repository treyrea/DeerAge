/**
 * Quick Check one-read engine: deer line, lease hand-off, range display, live config.
 * No photos and no network. Model replies are scripted.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { defaultAgingConfig } from "./hydrogen/aging.js";
import { ageWithRouter } from "./hydrogen/age-with-router.js";
import type { AgeResolution } from "./hydrogen/failover.js";
import { hydrogenAgeBody } from "./hydrogen/result.js";
import type { ModelCaller, WalkResult } from "./hydrogen/pipeline.js";
import { setKvForTests, type Kv } from "./kv.js";
import { handleAdminConfigRequest, loadRemoteConfig } from "./remote-config.js";
import {
  deerLine,
  deerLargeLine,
  defaultQuickConfig,
  leaseRulesOf,
  normalizeQuick,
  patchQuick,
  plainReasons,
  quickClassFor,
  quickReserveUsd,
  runQuickHydrogen,
  shouldEscalate,
  toQuickShape,
  type QuickOutcome,
} from "./quick-engine.js";

const quiet = () => undefined;

function caller(text: string | Error, seen: string[] = []): ModelCaller {
  return async (prompt) => {
    seen.push(prompt);
    if (text instanceof Error) throw text;
    return { text };
  };
}

function fullAge(low: number, high: number): AgeResolution {
  const label = low === high ? String(low) : `${low}\u2013${high >= 5.5 ? "5.5+" : high}`;
  return { kind: "age", backup: false, result: hydrogenAgeBody({ low, high, label, isRange: low !== high, hunterCue: "", reason: "Deep chest.", minimum: 4.5 }) };
}

async function quick(text: string | Error, options: {
  leaseRules?: boolean;
  engine?: "plain" | "plain_escalate" | "age";
  full?: AgeResolution;
  minimum?: number;
  leaseUnknown?: "plain" | "escalate";
} = {}): Promise<{ outcome: QuickOutcome; fullCalls: Array<[number, number] | undefined> }> {
  const fullCalls: Array<[number, number] | undefined> = [];
  const outcome = await runQuickHydrogen({
    engine: options.engine ?? "plain_escalate",
    call: caller(text),
    minimum: options.minimum ?? 4.5,
    leaseRules: options.leaseRules,
    config: { ...defaultQuickConfig(), leaseUnknown: options.leaseUnknown ?? "escalate" },
    resolveFull: async (plain) => {
      fullCalls.push(plain);
      return options.full ?? fullAge(3.5, 4.5);
    },
    log: quiet,
  });
  return { outcome, fullCalls };
}

const BUCK_15 = "This whitetail buck is in the **1.5-year-old (yearling)** age class.\n\n* **Body:** Long legs and a shallow chest.\n\nDEER_PRESENT: YES";
const BUCK_45 = "He is most likely **4.5 years old**.\n\n- **Neck:** Thick neck blending into the shoulders.\n- **Belly:** Belly starting to sag.\n\nDEER_PRESENT: YES";
const CAR = "There is no whitetail buck in this image. It is a car at night.\n\nDEER_PRESENT: NO";

test("the deer line: only an explicit NO is no deer, and the last line wins", () => {
  assert.equal(deerLine(CAR), "absent");
  assert.equal(deerLine(BUCK_15), "present");
  assert.equal(deerLine("DEER_PRESENT: **CANT_TELL**"), "present");
  assert.equal(deerLine("no line at all, 2.5 years old"), "unknown");
  assert.equal(deerLine("DEER_PRESENT: NO\n...\nDEER_PRESENT: YES"), "present");
});

test("a car or a person is no deer, with no age and no hand-off", async () => {
  const { outcome, fullCalls } = await quick(CAR, { leaseRules: true });
  assert.equal(outcome.kind, "no_deer");
  assert.equal(fullCalls.length, 0);
});

test("a curious user gets the one plain read, even for an old buck", async () => {
  const { outcome, fullCalls } = await quick(BUCK_45, { leaseRules: false });
  assert.equal(fullCalls.length, 0);
  assert.equal(outcome.kind, "age");
  if (outcome.kind !== "age") return;
  assert.equal(outcome.escalated, false);
  assert.equal(outcome.result.ageYears, 4.5);
  assert.equal(outcome.result.pipeline, "plain");
  assert.deepEqual(outcome.result.topCues, ["Neck: Thick neck blending into the shoulders.", "Belly: Belly starting to sag."]);
});

test("a lease user with a young plain read stays on the one read", async () => {
  const { outcome, fullCalls } = await quick(BUCK_15, { leaseRules: true });
  assert.equal(fullCalls.length, 0);
  assert.equal(outcome.kind === "age" && outcome.result.fieldCall, "LET WALK");
});

test("a lease user with a 3.5+ plain read goes to the full pipeline, which reuses the plain answer", async () => {
  const { outcome, fullCalls } = await quick(BUCK_45, { leaseRules: true });
  assert.deepEqual(fullCalls, [[4.5, 4.5]]);
  assert.equal(outcome.kind, "age");
  if (outcome.kind !== "age") return;
  assert.equal(outcome.escalated, true);
  assert.equal(outcome.plainAge, 4.5);
  // A 3.5–4.5 range shows the younger end and is BORDERLINE at a 4.5 line.
  assert.equal(outcome.result.ageYears, 3.5);
  assert.equal(outcome.result.highYears, 4.5);
  assert.equal(outcome.result.fieldCall, "BORDERLINE");
  const shaped = toQuickShape(outcome.result, { engine: "plain_escalate", escalated: true, plainAge: 4.5 });
  assert.equal(shaped.estimatedAgeClass, "3.5-4.5");
  assert.equal(shaped.quickEngine, "plain_escalate");
});

test("build 18 sends no lease switch: leaseUnknown decides", async () => {
  assert.equal((await quick(BUCK_45, { leaseUnknown: "escalate" })).fullCalls.length, 1);
  assert.equal((await quick(BUCK_45, { leaseUnknown: "plain" })).fullCalls.length, 0);
});

test("a plain read that would already be a shooter at a low minimum gets the deeper check", () => {
  const base = { engine: "plain_escalate" as const, leaseRules: true, leaseUnknown: "escalate" as const, escalateAt: 3.5 };
  assert.equal(shouldEscalate({ ...base, plainLow: 2.5, minimum: 2.5 }), true);
  assert.equal(shouldEscalate({ ...base, plainLow: 2.5, minimum: 4.5 }), false);
  assert.equal(shouldEscalate({ ...base, plainLow: 3.5, minimum: 4.5 }), true);
  assert.equal(shouldEscalate({ ...base, engine: "plain", plainLow: 5.5, minimum: 4.5 }), false);
  assert.equal(shouldEscalate({ ...base, leaseRules: false, plainLow: 5.5, minimum: 4.5 }), false);
});

test("quick check stops a mount and a head-only photo before the age, and does not hand them to the full pipeline", async () => {
  const mount = await quick(`${BUCK_45}\nPOSTURE: CANT_TELL\nANTLERS: YES\nSCENE: MOUNT\nBODY_VISIBLE: NECK`, { leaseRules: true });
  assert.equal(mount.fullCalls.length, 0);
  assert.equal(mount.outcome.kind, "not_live");
  if (mount.outcome.kind === "not_live") assert.match(mount.outcome.message, /looks like a mount/);
  const head = await quick(`${BUCK_15}\nPOSTURE: STANDING\nANTLERS: YES\nSCENE: LIVE\nBODY_VISIBLE: HEAD`);
  assert.equal(head.fullCalls.length, 0);
  assert.equal(head.outcome.kind, "no_body");
});

test("a full-walk mount or head-only stop is not replaced by the plain age", async () => {
  const mount = await quick(BUCK_45, {
    leaseRules: true,
    full: { kind: "not_live", message: "This looks like a mount, not a live deer. Point DeerAge at a live buck standing broadside." },
  });
  assert.equal(mount.outcome.kind, "not_live");
  const head = await quick(BUCK_45, {
    leaseRules: true,
    full: { kind: "no_body", message: "Wait for him to stand broadside. A head-only or neck-only photo does not get an age." },
  });
  assert.equal(head.outcome.kind, "no_body");
});

test("when the full pipeline cannot finish, the plain read shows as a range ending at it, never a shooter", async () => {
  for (const full of [{ kind: "fail" } as AgeResolution, { kind: "stop" } as AgeResolution, { kind: "retake", message: "Head up, please." } as AgeResolution, { kind: "no_deer" } as AgeResolution]) {
    const { outcome } = await quick(BUCK_45, { leaseRules: true, full });
    assert.equal(outcome.kind, "age", full.kind);
    if (outcome.kind !== "age") continue;
    assert.equal(outcome.backup, true);
    assert.equal(outcome.result.ageYears, 3.5);
    assert.notEqual(outcome.result.fieldCall, "SHOOTER");
  }
});

test("no age and no NO line is an upstream failure, never a made-up age", async () => {
  const { outcome } = await quick("I can't tell from this photo.\n\nDEER_PRESENT: YES");
  assert.deepEqual(outcome, { kind: "fail", reason: "no_age" });
  const down = await quick(new Error("Gemini 503"));
  assert.deepEqual(down.outcome, { kind: "fail", reason: "plain_call_failed" });
});

test("engine age always runs the full pipeline with its own plain call", async () => {
  const { outcome, fullCalls } = await quick(BUCK_15, { engine: "age", leaseRules: false });
  assert.deepEqual(fullCalls, [undefined]);
  assert.equal(outcome.kind === "age" && outcome.escalated, false);
});

test("the router reuses a plain answer it is given and skips the second plain call", async () => {
  const prompts: string[] = [];
  const walk: WalkResult = { kind: "age", label: "4.5", low: 4.5, high: 4.5, isRange: false, hunterCue: "", reason: "" };
  const result = await ageWithRouter({
    call: caller("{}", prompts),
    settings: { ...defaultAgingConfig(), plainPrompt: "PLAIN", crossCheckPrompt: "CROSS" },
    walk: async () => walk,
    plain: [4.5, 4.5],
    log: quiet,
  });
  assert.equal(result.kind, "age");
  assert.ok(!prompts.includes("PLAIN"));
});

test("range display classes the app knows", () => {
  assert.equal(quickClassFor(3.5, 4.5), "3.5-4.5");
  assert.equal(quickClassFor(4.5, 6.5), "4.5-5.5");
  assert.equal(quickClassFor(5.5, 6.5), "5.5+");
  assert.equal(quickClassFor(2.5, 2.5), undefined);
});

test("plain reasons come from the bullet list, short and clean", () => {
  assert.deepEqual(plainReasons("Intro.\n* **Neck:** Thin neck.\n1. Long legs for the body.\nDEER_PRESENT: YES"), ["Neck: Thin neck.", "Long legs for the body."]);
});

test("the lease switch is read from the body or the context", () => {
  assert.equal(leaseRulesOf({ leaseRules: true }), true);
  assert.equal(leaseRulesOf({ context: { leaseRules: false } }), false);
  assert.equal(leaseRulesOf({}), undefined);
  assert.equal(leaseRulesOf({ leaseRules: "yes" }), undefined);
});

test("spend holds: one read is a few cents, a possible hand-off holds the full pipeline", () => {
  const base = { hydrogenReserve: 0.4, plainReserve: 0.05 };
  assert.equal(quickReserveUsd({ ...base, engine: "plain", mayEscalate: true }), 0.05);
  assert.equal(quickReserveUsd({ ...base, engine: "plain_escalate", mayEscalate: false }), 0.05);
  assert.equal(quickReserveUsd({ ...base, engine: "plain_escalate", mayEscalate: true }), 0.4);
  assert.equal(quickReserveUsd({ ...base, engine: "age", mayEscalate: false }), 0.4);
  assert.equal(quickReserveUsd({ ...base, engine: "gateway", mayEscalate: false }), 0.3);
});

test("quick config: defaults, bad values keep defaults, and the admin route switches the engine live", async () => {
  assert.deepEqual(defaultQuickConfig(), { engine: "plain_escalate", leaseUnknown: "escalate", escalateAt: 3.5, prompt: "" });
  assert.equal(normalizeQuick({ engine: "turbo" }).engine, "plain_escalate");
  assert.equal(normalizeQuick({ engine: "gateway", escalateAt: 4.7 }).escalateAt, 4.5);
  assert.throws(() => patchQuick(defaultQuickConfig(), { engine: "turbo" }), /gateway, plain, plain_escalate, age/);
  assert.throws(() => patchQuick(defaultQuickConfig(), { leaseUnknown: "maybe" }), /plain or escalate/);
  assert.throws(() => patchQuick(defaultQuickConfig(), { escalateAt: 9 }), /1.5 to 6.5/);

  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "admin-test-token";
  setKvForTests(new MemoryKv());
  try {
    assert.equal((await loadRemoteConfig()).quick.engine, "plain_escalate");
    const saved = await handleAdminConfigRequest({
      method: "PATCH",
      headers: { authorization: "Bearer admin-test-token" },
      body: { quick: { engine: "gateway", leaseUnknown: "plain" } },
    });
    assert.equal(saved.status, 200);
    const now = await loadRemoteConfig();
    assert.equal(now.quick.engine, "gateway");
    assert.equal(now.quick.leaseUnknown, "plain");
    const rejected = await handleAdminConfigRequest({
      method: "PATCH",
      headers: { authorization: "Bearer admin-test-token" },
      body: { quick: { engine: "turbo" } },
    });
    assert.equal(rejected.status, 400);
    assert.equal((await loadRemoteConfig()).quick.engine, "gateway");
  } finally {
    setKvForTests(null);
    if (previous == null) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
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
    if (op === "EXPIRE") return 1;
    return null;
  }

  async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const command of commands) results.push(await this.command(command));
    return results;
  }
}

test("deerLargeLine retakes only on an explicit NO", () => {
  assert.equal(deerLargeLine("DEER_LARGE_ENOUGH: NO"), "too_small");
  assert.equal(deerLargeLine("DEER_LARGE_ENOUGH: YES"), "ok");
  assert.equal(deerLargeLine("DEER_LARGE_ENOUGH: CANT_TELL"), "ok");
  assert.equal(deerLargeLine("no line"), "unknown");
  assert.equal(deerLargeLine("DEER_LARGE_ENOUGH: YES\nDEER_LARGE_ENOUGH: NO"), "too_small");
});

test("a tiny deer on the plain read is a retake, not an age", async () => {
  const outcome = await runQuickHydrogen({
    engine: "plain",
    call: async () => ({ text: "AGE: 2.5\nDEER_PRESENT: YES\nDEER_LARGE_ENOUGH: NO" }),
    minimum: 3.5,
    leaseRules: false,
    config: { engine: "plain", leaseUnknown: "plain", escalateAt: 3.5, prompt: "" },
    resolveFull: async () => { throw new Error("plain read should not escalate"); },
  });
  assert.equal(outcome.kind, "retake");
  if (outcome.kind === "retake") assert.match(outcome.message, /Get closer or zoom in/);
});
