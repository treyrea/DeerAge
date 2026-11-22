/**
 * No-deer answers on the C4nr age path. No photos and no network.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { ageWithRouter } from "./age-with-router.js";
import { defaultAgingConfig } from "./aging.js";
import { resolveHydrogenAge } from "./failover.js";
import { hydrogenFinishPlan, NO_DEER_TITLE, noDeerCopy, noDeerJobError } from "./no-deer.js";
import { walkHydrogen, type ModelCaller } from "./pipeline.js";
import { consumeCredit, readCredits, returnCredit } from "../scan-credits.js";
import { setKvForTests, type Kv } from "../kv.js";

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
    if (op === "EXPIRE") return 1;
    return null;
  }

  async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const command of commands) results.push(await this.command(command));
    return results;
  }
}

function quality(extra: Record<string, string> = {}): string {
  return JSON.stringify({
    deer_present: "YES",
    view_angle: "BROADSIDE",
    standing_upright: "YES",
    head_position: "UP",
    belly_waist_visible: "YES",
    neck_chest_visible: "YES",
    legs_judgeable: "YES",
    subject_separable: "YES",
    deer_large_enough: "YES",
    contour_readable: "YES",
    lighting: "DAY",
    ...extra,
  });
}

function scripted(replies: string[]): { call: ModelCaller; prompts: string[] } {
  const prompts: string[] = [];
  const call: ModelCaller = async (prompt) => {
    const next = replies[prompts.length];
    prompts.push(prompt);
    if (next === undefined) throw new Error(`unexpected call ${prompts.length}`);
    return { text: next };
  };
  return { call, prompts };
}

beforeEach(() => {
  setKvForTests(new MemoryKv());
});

test("a no-deer response has no age, verdict, or confidence and does not keep a credit", async () => {
  const store = new MemoryKv();
  setKvForTests(store);
  await store.command(["SET", "deerage:scancredit:hunter", "3"]);
  assert.equal(await consumeCredit("hunter"), true);
  assert.equal(await readCredits("hunter"), 2);

  const plan = hydrogenFinishPlan("no_deer");
  assert.equal(plan.charge, false);
  assert.equal(plan.saveRecord, false);
  if (!plan.charge) await returnCredit("hunter");
  assert.equal(await readCredits("hunter"), 3);

  const error = noDeerJobError(noDeerCopy()) as Record<string, unknown>;
  assert.equal(error.kind, "no_deer");
  assert.equal(error.code, "retake");
  assert.equal(error.message, "No deer found");
  assert.equal(error.tip, "Get the whole deer in frame, broadside if you can, and try again.");
  for (const key of ["ageYears", "estimatedAgeYears", "ageClass", "ageLabel", "fieldCall", "confidence", "overallConfidence", "verdict", "decision"]) {
    assert.equal(key in error, false, key);
  }
  assert.equal(hydrogenFinishPlan("age").charge, true);
  assert.equal(hydrogenFinishPlan("age").saveRecord, true);
});

test("a deer that is present still ages, including a dark or cropped one", async () => {
  const present = scripted([
    quality(),
    JSON.stringify({ thin_body: "NO", baby_face: "NO" }),
    "Deep chest.",
    JSON.stringify({ closer: "OLDER", reason: "chest", hunter_cue: "Look at the chest." }),
  ]);
  const aged = await walkHydrogen(present.call);
  assert.equal(aged.kind, "age");
  if (aged.kind === "age") assert.equal(aged.label, "5.5+");

  const night = scripted([quality({ deer_present: "YES", lighting: "NIGHT_IR", deer_large_enough: "NO" })]);
  const hard = await walkHydrogen(night.call);
  assert.notEqual(hard.kind, "no_deer");

  const unsure = scripted([
    quality({ deer_present: "CANT_TELL" }),
    JSON.stringify({ thin_body: "NO", baby_face: "NO" }),
    "Deep chest.",
    JSON.stringify({ closer: "OLDER", reason: "chest", hunter_cue: "" }),
  ]);
  assert.equal((await walkHydrogen(unsure.call)).kind, "age");

  const omitted = scripted([
    quality({ deer_present: "" }).replace('"deer_present":"",', ""),
    JSON.stringify({ thin_body: "NO", baby_face: "NO" }),
    "Deep chest.",
    JSON.stringify({ closer: "OLDER", reason: "chest", hunter_cue: "" }),
  ]);
  assert.equal((await walkHydrogen(omitted.call)).kind, "age");
});

test("no deer stops before an age, even when another call names one", async () => {
  const car = scripted([JSON.stringify({ deer_present: "NO", deer_present_reason: "A car through a windshield." })]);
  const none = await walkHydrogen(car.call);
  assert.equal(none.kind, "no_deer");
  assert.equal(car.prompts.length, 1);

  const partial = scripted([JSON.stringify({ deer_present: "NO" })]);
  assert.equal((await walkHydrogen(partial.call)).kind, "no_deer");

  const routed = await ageWithRouter({
    call: async () => ({ text: "Best placed in the **4.5-year-old** age class." }),
    settings: { ...defaultAgingConfig(), plainPrompt: "PLAIN", crossCheckPrompt: "CROSS" },
    walk: async () => ({ kind: "no_deer" }),
    log: () => undefined,
  });
  assert.equal(routed.kind, "no_deer");
  assert.equal("low" in routed, false);
  assert.equal("label" in routed, false);

  let backup = 0;
  const resolution = await resolveHydrogenAge({
    minimum: 4.5,
    primary: async () => ({ kind: "no_deer" }),
    backup: async () => {
      backup += 1;
      return { estimatedAgeYears: 4.5 };
    },
    circuitOpen: async () => false,
    note: async () => undefined,
    log: () => undefined,
    backupOnStop: true,
  });
  assert.equal(resolution.kind, "no_deer");
  assert.equal(backup, 0);
});

test("remote copy replaces the no-deer lines and a blank copy uses the built-in words", () => {
  const custom = noDeerCopy({ noDeerTitle: "Nothing there", noDeerTip: "Frame the deer and try again." });
  assert.equal(custom.message, "Nothing there");
  assert.equal(noDeerJobError(custom).tip, "Frame the deer and try again.");
  assert.equal(noDeerCopy({ noDeerTitle: "  ", noDeerTip: "" }).message, NO_DEER_TITLE);
});
