/**
 * C4nr, the plain parser, and R1–R5.
 * The fixture is the anonymized 51-photo set: no file names, no true ages, no photos.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultAgingConfig, normalizeAging } from "./aging.js";
import { ageWithRouter, type AgeRouterLog } from "./age-with-router.js";
import { ScanDeadlineError } from "./budget.js";
import {
  RETAKE_CONFLICT_OLD,
  RETAKE_CONFLICT_YOUNG,
  applyRules,
  parseCc,
  type CrossCheck,
} from "./crosscheck.js";
import { setKvForTests, type Kv } from "../kv.js";
import { handleAdminConfigRequest, loadRemoteConfig, patchAging, publicConfigPayload } from "../remote-config.js";
import { parseAge } from "./plain.js";
import type { ModelCaller, WalkResult } from "./pipeline.js";
import { cls, isSingleOrOneYear, route, type Ours } from "./router.js";

const RAW = readFileSync(new URL("./fixtures/router_cases.json", import.meta.url), "utf8");
const FIXTURE = JSON.parse(RAW) as {
  cases: Array<{
    id: string;
    ours_1_0_10: ["age", number, number] | ["retake"];
    ours_walk_only_no_R1_R5: ["age", number, number] | ["retake"];
    plain_r1: PlainSide;
    plain_r2: PlainSide;
    expected_if_plain_failed: string;
  }>;
};

interface PlainSide {
  text_excerpt: string;
  parsed: [number, number];
  expected: { label: string; lo: number; hi: number; is_range: boolean; branch: string };
  expected_if_crosscheck_failed: { label: string; branch: string };
}

const BRANCHES: Record<"plain_r1" | "plain_r2", Record<string, number>> = {
  plain_r1: {
    A1_plain_inside_ours: 27,
    M1_ours_mature_plain_young: 8,
    M2_both_mature: 7,
    R1_ours_retake_use_plain: 5,
    D1_one_class_apart_range: 3,
    D2_far_apart_use_ours: 1,
  },
  plain_r2: {
    A1_plain_inside_ours: 26,
    M1_ours_mature_plain_young: 8,
    M2_both_mature: 7,
    R1_ours_retake_use_plain: 5,
    D1_one_class_apart_range: 4,
    D2_far_apart_use_ours: 1,
  },
};

function asOurs(value: ["age", number, number] | ["retake"]): Ours {
  if (value[0] === "retake") return ["retake"];
  return ["age", value[1], value[2]];
}

function cc(partial: Partial<CrossCheck> = {}): CrossCheck {
  return {
    legs_vs_chest: "CANT_TELL",
    belly_line: "CANT_TELL",
    back_line: "CANT_TELL",
    front_vs_rear: "CANT_TELL",
    brisket: "CANT_TELL",
    face_to_camera: "CANT_TELL",
    object_in_front: "CANT_TELL",
    object_on_head_neck: "CANT_TELL",
    spread_vs_ears: "CANT_TELL",
    beam_mass: "CANT_TELL",
    tines_vs_ears: "CANT_TELL",
    points_one_side: null,
    object_in_front_part: "",
    ...partial,
  };
}

test("the plain parser matches every stored excerpt and the reference samples", () => {
  assert.equal(FIXTURE.cases.length, 51);
  assert.doesNotMatch(RAW, /\.(jpe?g|png|heic)\b/i);
  assert.doesNotMatch(RAW, /true_?age/i);
  let excerpts = 0;
  for (const row of FIXTURE.cases) {
    for (const side of [row.plain_r1, row.plain_r2]) {
      excerpts += 1;
      assert.deepEqual(parseAge(side.text_excerpt), side.parsed, row.id);
    }
  }
  assert.equal(excerpts, 102);
  assert.deepEqual(parseAge("**Estimated age class: 3½ years old.**"), [3.5, 3.5]);
  assert.deepEqual(parseAge("This buck looks like a **1½-year-old (yearling)**"), [1.5, 1.5]);
  assert.deepEqual(parseAge("falls into the **3.5-year-old** age class"), [3.5, 3.5]);
  assert.deepEqual(parseAge("likely 3.5 to 4.5 years"), [3.5, 4.5]);
  assert.deepEqual(parseAge("I'd put him at 4 1/2 years"), [4.5, 4.5]);
  assert.deepEqual(parseAge("mature, 5½+ years"), [5.5, 5.5]);
  assert.deepEqual(parseAge("**2.5–3.5 years old**"), [2.5, 3.5]);
  assert.deepEqual(parseAge("Age class: 4.5 years (mature)"), [4.5, 4.5]);
  assert.equal(parseAge(""), null);
  assert.equal(parseAge("no age here"), null);
  assert.equal(cls(4), 4.5);
  assert.equal(cls(6), 5.5);
  assert.equal(cls(1), 0.5);
  assert.equal(cls(2.5), 2.5);
});

test("C4nr matches every reference output, including both fallbacks", () => {
  for (const sideName of ["plain_r1", "plain_r2"] as const) {
    const counts: Record<string, number> = {};
    for (const row of FIXTURE.cases) {
      const side = row[sideName];
      const main = route(side.parsed, asOurs(row.ours_1_0_10));
      assert.equal(main.label, side.expected.label, `${row.id} ${sideName} label`);
      assert.equal(main.lo, side.expected.lo, `${row.id} ${sideName} lo`);
      assert.equal(main.hi, side.expected.hi, `${row.id} ${sideName} hi`);
      assert.equal(main.is_range, side.expected.is_range, `${row.id} ${sideName} range`);
      assert.equal(main.branch, side.expected.branch, `${row.id} ${sideName} branch`);
      assert.equal(isSingleOrOneYear(main), true, `${row.id} ${sideName}`);
      counts[main.branch] = (counts[main.branch] ?? 0) + 1;

      const withoutRules = route(side.parsed, asOurs(row.ours_walk_only_no_R1_R5));
      assert.equal(withoutRules.label, side.expected_if_crosscheck_failed.label, `${row.id} ${sideName} cc`);
      assert.equal(withoutRules.branch, side.expected_if_crosscheck_failed.branch, `${row.id} ${sideName} cc branch`);
      assert.equal(isSingleOrOneYear(withoutRules), true);

      const plainFailed = route(null, asOurs(row.ours_1_0_10));
      assert.equal(plainFailed.label, row.expected_if_plain_failed, `${row.id} plain failed`);
      assert.equal(isSingleOrOneYear(plainFailed), true);
    }
    assert.deepEqual(counts, BRANCHES[sideName]);
  }
});

test("every router branch resolves to one class or a 1-year range", () => {
  const none = route(null, null);
  assert.equal(none.branch, "F0_no_answer");
  assert.equal(none.label, "");
  const retake = route(null, ["retake"]);
  assert.equal(retake.branch, "F0_retake_plain_failed");
  assert.equal(retake.label, "RETAKE");
  const failed = route([3.5, 3.5], null);
  assert.equal(failed.branch, "F2_ours_failed_use_plain");
  assert.equal(failed.label, "3.5");
  const fawn = route([1, 1], null);
  assert.equal(fawn.label, "1.5");
  assert.equal(fawn.is_range, false);
  const wide = route([3.5, 5.5], null);
  assert.equal(wide.label, "3.5");
  const ownRange = route([3.5, 4.5], null);
  assert.equal(ownRange.label, "3.5\u20134.5");
  assert.equal(ownRange.is_range, true);
  const insideRange = route([2.5, 3.5], ["age", 2.5, 3.5]);
  assert.equal(insideRange.branch, "A1_plain_inside_ours");
  assert.equal(insideRange.label, "2.5\u20133.5");
  const apart = route([1.5, 1.5], ["age", 2.5, 2.5]);
  assert.equal(apart.branch, "D1_one_class_apart_range");
  assert.equal(apart.label, "1.5\u20132.5");
  assert.equal(apart.source, "both");
  const far = route([4.5, 4.5], ["age", 1.5, 1.5]);
  assert.equal(far.branch, "D2_far_apart_use_ours");
  assert.equal(far.label, "1.5");
  const mature = route([5.5, 5.5], ["age", 4.5, 5.5]);
  assert.equal(mature.branch, "M2_both_mature");
  assert.equal(mature.label, "4.5\u20135.5+");
  const young = route([2.5, 2.5], ["age", 4.5, 4.5]);
  assert.equal(young.branch, "M1_ours_mature_plain_young");
  const plainInstead = route([2.5, 2.5], ["retake"]);
  assert.equal(plainInstead.branch, "R1_ours_retake_use_plain");
  assert.equal(plainInstead.label, "2.5");
  const oursOnly = route(null, ["age", 2.5, 3.5]);
  assert.equal(oursOnly.branch, "F1_plain_failed_use_ours");
  assert.equal(oursOnly.label, "2.5\u20133.5");
  for (const result of [none, retake, failed, fawn, wide, ownRange, insideRange, apart, far, mature, young, plainInstead, oursOnly]) {
    assert.equal(isSingleOrOneYear(result), true);
  }
});

test("R1 through R5 fire in order and a missing cross-check leaves the walk", () => {
  assert.equal(applyRules(4.5, 4.5, null, false).rule, "none_no_crosscheck");
  const babyConflict = applyRules(4.5, 4.5, cc({ spread_vs_ears: "OUTSIDE", beam_mass: "HEAVY", points_one_side: 5, belly_line: "SAG" }), true);
  assert.equal(babyConflict.rule, "R4a_baby_needs_agreement");
  assert.deepEqual([babyConflict.lo, babyConflict.hi], [1.5, 2.5]);
  assert.match(babyConflict.reason, /belly not tucked, 5 points on one side, spread outside the ears, antler mass heavy/);
  const babyAgrees = applyRules(5.5, 5.5, cc({ spread_vs_ears: "INSIDE", beam_mass: "THIN" }), true);
  assert.equal(babyAgrees.rule, "none");
  assert.deepEqual([babyAgrees.lo, babyAgrees.hi], [1.5, 1.5]);

  const oldRack = applyRules(4.5, 5.5, cc({ spread_vs_ears: "INSIDE", beam_mass: "MEDIUM", tines_vs_ears: "NO" }), false);
  assert.equal(oldRack.kind, "retake");
  assert.equal(oldRack.rule, "R1_old_call_young_rack");
  assert.equal(oldRack.reason, RETAKE_CONFLICT_OLD);

  const wideRack = applyRules(4.5, 4.5, cc({ spread_vs_ears: "OUTSIDE", points_one_side: 4 }), false);
  assert.equal(wideRack.rule, "R3_single45_wide_rack");
  assert.deepEqual([wideRack.lo, wideRack.hi], [4.5, 5.5]);
  assert.equal(applyRules(4.5, 4.5, cc({ spread_vs_ears: "OUTSIDE", points_one_side: 3 }), false).rule, "none");

  const strong = cc({ spread_vs_ears: "OUTSIDE", points_one_side: 5, beam_mass: "HEAVY", tines_vs_ears: "YES" });
  const widened = applyRules(2.5, 2.5, strong, false);
  assert.equal(widened.rule, "R5_young_call_strong_rack");
  assert.deepEqual([widened.lo, widened.hi], [2.5, 3.5]);
  const conflict = applyRules(2.5, 3.5, strong, false);
  assert.equal(conflict.kind, "retake");
  assert.equal(conflict.rule, "R5_young_range_strong_rack");
  assert.equal(conflict.reason, RETAKE_CONFLICT_YOUNG);
  assert.equal(applyRules(2.5, 2.5, cc({ spread_vs_ears: "OUTSIDE", points_one_side: 5 }), false).rule, "none");

  const yearlingRack = applyRules(2.5, 2.5, cc({ spread_vs_ears: "INSIDE", beam_mass: "THIN" }), false);
  assert.equal(yearlingRack.rule, "R4b_single25_yearling_rack");
  assert.deepEqual([yearlingRack.lo, yearlingRack.hi], [1.5, 2.5]);
  assert.equal(applyRules(2.5, 2.5, cc({ spread_vs_ears: "INSIDE", beam_mass: "MEDIUM" }), false).rule, "none");
});

test("the cross-check parser keeps known labels and drops a bad body", () => {
  const fenced = parseCc("```json\n{\"spread_vs_ears\":\"inside\",\"beam_mass\":\"nope\",\"points_one_side\":\"6\",\"object_in_front_part\":\"chest\"}\n```");
  assert.ok(fenced);
  assert.equal(fenced?.spread_vs_ears, "INSIDE");
  assert.equal(fenced?.beam_mass, "CANT_TELL");
  assert.equal(fenced?.legs_vs_chest, "CANT_TELL");
  assert.equal(fenced?.points_one_side, 6);
  assert.equal(fenced?.object_in_front_part, "chest");
  assert.equal(parseCc("note {\"tines_vs_ears\":\"YES\",\"points_one_side\":\"CANT_TELL\"} trailing")?.tines_vs_ears, "YES");
  assert.equal(parseCc("note {\"tines_vs_ears\":\"YES\",\"points_one_side\":\"CANT_TELL\"} trailing")?.points_one_side, null);
  assert.equal(parseCc("not json"), null);
  assert.equal(parseCc("[1, 2]"), null);
});

function settings(overrides: Partial<ReturnType<typeof defaultAgingConfig>> = {}) {
  return { ...defaultAgingConfig(), plainPrompt: "PLAIN", crossCheckPrompt: "CROSS", ...overrides };
}

function age(low: number, high = low, extra: Partial<Extract<WalkResult, { kind: "age" }>> = {}): WalkResult {
  const label = low === high ? (low >= 5.5 ? "5.5+" : String(low)) : `${low}\u2013${high >= 5.5 ? "5.5+" : high}`;
  return { kind: "age", label, low, high, isRange: low !== high, hunterCue: "cue", reason: "body", ...extra };
}

async function run(input: {
  walk: WalkResult | Error;
  plain?: string | Error;
  cross?: string | Error;
  settings?: ReturnType<typeof settings>;
}): Promise<{ result: WalkResult; log: AgeRouterLog; prompts: string[] }> {
  const prompts: string[] = [];
  const logs: AgeRouterLog[] = [];
  const call: ModelCaller = async (prompt) => {
    prompts.push(prompt);
    const source = prompt === "PLAIN" ? input.plain : input.cross;
    if (source instanceof Error) throw source;
    return { text: source ?? "" };
  };
  const result = await ageWithRouter({
    call,
    settings: input.settings ?? settings(),
    log: (event) => logs.push(event),
    walk: async () => {
      if (input.walk instanceof Error) throw input.walk;
      return input.walk;
    },
  });
  assert.equal(logs.length, 1);
  return { result, log: logs[0], prompts };
}

test("the scan uses the plain age for a quality retake and for a rules retake", async () => {
  const quality = await run({
    walk: { kind: "retake", message: "Try again when the deer's head is up, so the neck and back line are easy to see.", fails: ["head_position"] },
    plain: "Best placed in the **2.5-year-old** age class.",
    cross: "{\"spread_vs_ears\":\"INSIDE\"}",
  });
  assert.equal(quality.result.kind, "age");
  if (quality.result.kind === "age") assert.equal(quality.result.label, "2.5");
  assert.equal(quality.log.branch, "R1_ours_retake_use_plain");
  assert.match(quality.log.retakeReason ?? "", /head is up/);
  assert.equal(quality.log.plainOk, true);
  assert.equal(quality.log.plainPromptSha, createHash("sha256").update("PLAIN").digest("hex"));
  assert.equal(quality.log.crossCheckPromptSha, createHash("sha256").update("CROSS").digest("hex"));

  const ruled = await run({
    walk: age(4.5),
    plain: "the **2.5-year-old** class",
    cross: JSON.stringify({ spread_vs_ears: "INSIDE", beam_mass: "THIN" }),
  });
  assert.equal(ruled.log.branch, "R1_ours_retake_use_plain");
  assert.equal(ruled.log.rule, "R1_old_call_young_rack");
  if (ruled.result.kind === "age") assert.equal(ruled.result.label, "2.5");
  assert.equal(ruled.log.retakeReason, RETAKE_CONFLICT_OLD);
});

test("router off keeps a retake, and cross-check off skips R1", async () => {
  const off = await run({
    walk: { kind: "retake", message: "head down", fails: ["head_position"] },
    plain: "**2.5-year-old**",
    settings: settings({ router: "off" }),
  });
  assert.equal(off.result.kind, "retake");
  assert.equal(off.log.branch, "router_off");
  assert.deepEqual(off.prompts, ["CROSS"]);

  const noCheck = await run({
    walk: age(4.5),
    plain: "**2.5-year-old**",
    settings: settings({ crossCheck: false }),
  });
  assert.equal(noCheck.log.branch, "M1_ours_mature_plain_young");
  if (noCheck.result.kind === "age") assert.equal(noCheck.result.label, "4.5");
  assert.deepEqual(noCheck.prompts, ["PLAIN"]);
  assert.equal(noCheck.log.ccOk, false);

  const ruledOff = await run({
    walk: age(4.5),
    plain: "**2.5-year-old**",
    cross: JSON.stringify({ spread_vs_ears: "INSIDE", beam_mass: "THIN" }),
    settings: settings({ router: "off" }),
  });
  assert.equal(ruledOff.result.kind, "retake");
  if (ruledOff.result.kind === "retake") assert.equal(ruledOff.result.message, RETAKE_CONFLICT_OLD);

  const widenedOff = await run({
    walk: age(4.5),
    plain: "**2.5-year-old**",
    cross: JSON.stringify({ spread_vs_ears: "OUTSIDE", points_one_side: "6" }),
    settings: settings({ router: "off" }),
  });
  assert.equal(widenedOff.log.branch, "router_off");
  if (widenedOff.result.kind === "age") assert.equal(widenedOff.result.label, "4.5\u20135.5+");
});

test("a failed plain call keeps 1.0.10, and a failed cross-check keeps the walk", async () => {
  const plainDown = await run({
    walk: age(2.5, 3.5),
    plain: new Error("timeout"),
    cross: "{}",
  });
  assert.equal(plainDown.log.branch, "F1_plain_failed_use_ours");
  assert.equal(plainDown.log.plainOk, false);
  if (plainDown.result.kind === "age") {
    assert.equal(plainDown.result.label, "2.5\u20133.5");
    assert.equal(plainDown.result.isRange, true);
  }

  const widened = await run({
    walk: age(4.5),
    plain: "**4.5-year-old**",
    cross: JSON.stringify({ spread_vs_ears: "OUTSIDE", points_one_side: "5" }),
  });
  assert.equal(widened.log.rule, "R3_single45_wide_rack");
  if (widened.result.kind === "age") assert.equal(widened.result.label, "4.5\u20135.5+");

  const checkDown = await run({
    walk: age(4.5),
    plain: "**3.5-year-old**",
    cross: new Error("empty"),
  });
  assert.equal(checkDown.log.ccOk, false);
  assert.equal(checkDown.log.branch, "M1_ours_mature_plain_young");
  if (checkDown.result.kind === "age") assert.equal(checkDown.result.label, "4.5");
});

test("a baby-gate yearling widens when the cross-check disagrees", async () => {
  const opened = await run({
    walk: age(1.5, 1.5, { viaBabyGate: true, hunterCue: "", reason: "" }),
    plain: "a **3.5-year-old**",
    cross: JSON.stringify({ spread_vs_ears: "OUTSIDE", beam_mass: "HEAVY" }),
  });
  assert.equal(opened.log.rule, "R4a_baby_needs_agreement");
  assert.equal(opened.log.oursLabel, "1.5\u20132.5");
  assert.equal(opened.log.branch, "D1_one_class_apart_range");
  if (opened.result.kind === "age") assert.equal(opened.result.label, "2.5\u20133.5");
});

test("the scan deadline falls back without throwing when the plain age is missing", async () => {
  const missed = await run({
    walk: new ScanDeadlineError(),
    plain: new ScanDeadlineError(),
    cross: new ScanDeadlineError(),
  });
  assert.equal(missed.result.kind, "stop");
  assert.equal(missed.log.branch, "F0_no_answer");

  const plainSaved = await run({
    walk: new ScanDeadlineError(),
    plain: "**4.5-year-old**",
    cross: new ScanDeadlineError(),
  });
  assert.equal(plainSaved.log.branch, "F2_ours_failed_use_plain");
  if (plainSaved.result.kind === "age") assert.equal(plainSaved.result.label, "4.5");
  assert.equal(JSON.stringify(plainSaved.log).includes("test-key"), false);
});

test("a quality retake with no plain age is still a retake", async () => {
  const held = await run({
    walk: { kind: "retake", message: "head down", fails: ["head_position"] },
    plain: "I cannot tell",
    cross: "{}",
  });
  assert.equal(held.result.kind, "retake");
  assert.equal(held.log.branch, "F0_retake_plain_failed");
  if (held.result.kind === "retake") assert.equal(held.result.message, "head down");
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

test("aging config defaults on, and the admin route can turn the router and the cross-check off", async () => {
  assert.equal(defaultAgingConfig().router, "c4nr");
  assert.equal(defaultAgingConfig().crossCheck, true);
  assert.equal(defaultAgingConfig().callTimeoutMs, 120_000);
  assert.equal(defaultAgingConfig().ignoreReticle, true);
  assert.equal(patchAging(defaultAgingConfig(), { ignoreReticle: false }).ignoreReticle, false);
  assert.throws(() => patchAging(defaultAgingConfig(), { ignoreReticle: "maybe" }), /ignoreReticle/);

  assert.match(defaultAgingConfig().rangeNote, /\{label\}/);
  assert.equal(normalizeAging(undefined).router, "c4nr");
  assert.equal(normalizeAging({ router: "off", crossCheck: false, callTimeoutMs: 5000 }).callTimeoutMs, 20_000);
  assert.equal(normalizeAging({ router: "off", crossCheck: false }).router, "off");
  assert.equal(normalizeAging({ router: "sometimes" }).router, "c4nr");
  assert.throws(() => patchAging(defaultAgingConfig(), { router: "sometimes" }), /c4nr or off/);
  assert.throws(() => patchAging(defaultAgingConfig(), { plainPrompt: "x".repeat(2001) }), /too long/);
  assert.throws(() => patchAging(defaultAgingConfig(), { crossCheckPrompt: "x".repeat(8001) }), /too long/);
  assert.throws(() => patchAging(defaultAgingConfig(), { rangeNote: "no placeholder" }), /\{label\}/);
  const cleared = patchAging(defaultAgingConfig(), { plainPrompt: "", rangeNote: "", callTimeoutMs: 150_000 });
  assert.equal(cleared.plainPrompt, "");
  assert.match(cleared.rangeNote, /\{label\}/);
  assert.equal(cleared.callTimeoutMs, 150_000);

  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "admin-test-token";
  setKvForTests(new MemoryKv());
  try {
    const first = await loadRemoteConfig();
    assert.equal(first.aging.router, "c4nr");
    const saved = await handleAdminConfigRequest({
      method: "PATCH",
      headers: { authorization: "Bearer admin-test-token" },
      body: { aging: { router: "off", crossCheck: false, plainPrompt: "Custom plain?", rangeNote: "Range {label}." } },
    });
    assert.equal(saved.status, 200);
    const aging = (saved.body as { config: { aging: { router: string; crossCheck: boolean; plainPrompt: string; rangeNote: string } } }).config.aging;
    assert.equal(aging.router, "off");
    assert.equal(aging.crossCheck, false);
    assert.equal(aging.plainPrompt, "Custom plain?");
    assert.equal(aging.rangeNote, "Range {label}.");
    const again = await loadRemoteConfig();
    assert.equal(again.aging.router, "off");
    assert.equal(again.aging.plainPrompt, "Custom plain?");
    const pub = await publicConfigPayload();
    assert.equal("aging" in pub, false);
    assert.equal(JSON.stringify(pub).includes("Custom plain"), false);
    const rejected = await handleAdminConfigRequest({
      method: "PATCH",
      headers: { authorization: "Bearer admin-test-token" },
      body: { aging: { router: "nope" } },
    });
    assert.equal(rejected.status, 400);
  } finally {
    if (previous == null) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
    setKvForTests(null);
  }
});
