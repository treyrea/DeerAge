/**
 * Mocked walk of the Hydrogen chain. No photos, no network, no API key.
 *
 *   cd server && npm test
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { agingEngineFor } from "../aging-switch.js";
import { hydrogenAgeBody } from "./result.js";
import { geminiRequestBody, extractGeminiText, GEMINI_MAX_OUTPUT_TOKENS } from "./gemini.js";
import { walkHydrogen, type ModelCaller } from "./pipeline.js";
import { buildCloserPrompt, hydrogenPromptDirectory } from "./prompts.js";
import { RETAKE_MESSAGE_DEFAULT, RETAKE_MESSAGES, decideQuality, parseCloser, parseQuality } from "./rules.js";

const HASHES: Record<string, string> = {
  "quality_v4.txt": "7c16307eccfd0554e0327f31f90e99b8511bca66800e28b6521d38cc9c5b7223",
  "baby_gate.txt": "2bd846f8788edec7f99577652f5f2bff5910c9547bbf99d9a73bead99d4b70a1",
  "step_a.txt": "9edaf7fd58ffd9754ec963415326bbc1d0ef96eb9d7f96ac92cc4417eaae7e3d",
  "closer.txt": "d811bd60ee6c15bce26329d73ac6300f25dc3065ca000862705b69b91a35f31a",
  "range_55_v3.txt": "e9763be207d6e5ae29ff83e558b24ffa8828df169e68bb324f2e26d806422ae1",
  "range_45_v12.txt": "a98c339dbcd5b1281b4737f128d008aaefac298dc9c12239f40ed1b873ef1489",
  "range_25_v4.txt": "c68c783970f80bea55da54e84fa264fb2167b6b8c4cc646f0c08829c4f886ec4",
  "bind.txt": "7f9a59f5bcc0b833d0a0cbafc6bd25d718bd1c6017f1786764dd917119e872fe",
  "season.txt": "96eaeeb5eae05b375c4b294952317d7cd69a1e973a4a605cd08e7c1ab1e9a388",
};

function sha(name: string): string {
  return createHash("sha256").update(readFileSync(resolve(hydrogenPromptDirectory(), name))).digest("hex");
}

function quality(overrides: Record<string, string> = {}): string {
  const fields = {
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
    ...overrides,
  };
  return JSON.stringify(fields);
}

function gate(thin: "YES" | "NO", face: "YES" | "NO"): string {
  const decision = thin === "YES" && face === "YES" ? "BABY" : "NOT_BABY";
  return JSON.stringify({ thin_body: thin, baby_face: face, gate: decision });
}

function closer(value: "YOUNGER" | "OLDER" | "RANGE", cue = ""): string {
  return JSON.stringify({ closer: value, reason: `${value} because the body says so`, hunter_cue: cue });
}

function scripted(replies: string[]): { call: ModelCaller; prompts: string[] } {
  const prompts: string[] = [];
  const call: ModelCaller = async (prompt: string) => {
    const next = replies[prompts.length];
    prompts.push(prompt);
    if (next === undefined) throw new Error(`unexpected call ${prompts.length}`);
    return { text: next };
  };
  return { call, prompts };
}

test("prompt files match the tested hashes", () => {
  for (const [name, expect] of Object.entries(HASHES)) {
    assert.equal(sha(name), expect, name);
  }
});

test("quality v5: legs and CANT_TELL do not retake; one fail uses its message", () => {
  assert.equal(decideQuality(parseQuality(quality({ legs_judgeable: "NO" }))!).decision, "AGEABLE");
  assert.equal(decideQuality(parseQuality(quality({ belly_waist_visible: "CANT_TELL", contour_readable: "CANT_TELL" }))!).decision, "AGEABLE");
  const headOn = decideQuality(parseQuality(quality({ view_angle: "HEAD_ON" }))!);
  assert.equal(headOn.decision, "RETAKE");
  assert.equal(headOn.retake_message, RETAKE_MESSAGES.view_angle);
  assert.equal(decideQuality(parseQuality(quality({ view_angle: "REAR" }))!).retake_message, RETAKE_MESSAGES.view_angle);
  assert.equal(decideQuality(parseQuality(quality({ standing_upright: "NO" }))!).retake_message, RETAKE_MESSAGES.standing_upright);
  assert.equal(decideQuality(parseQuality(quality({ head_position: "DOWN_FEEDING" }))!).retake_message, RETAKE_MESSAGES.head_position);
  assert.equal(decideQuality(parseQuality(quality({ neck_chest_visible: "NO" }))!).retake_message, RETAKE_MESSAGES.neck_chest_visible);
  const both = decideQuality(parseQuality(quality({ view_angle: "HEAD_ON", standing_upright: "NO" }))!);
  assert.deepEqual(both.fails, ["view_angle", "standing_upright"]);
  assert.equal(both.retake_message, RETAKE_MESSAGE_DEFAULT);
});

test("closer parser accepts fenced JSON, loose JSON, and rejects RANGE when it is not allowed", () => {
  const fenced = parseCloser("```json\n{\"closer\":\"RANGE\",\"reason\":\"mixed\",\"hunter_cue\":\"A sag would age it up.\"}\n```", true);
  assert.equal(fenced.ok, true);
  assert.equal(fenced.closer, "RANGE");
  assert.equal(fenced.hunterCue, "A sag would age it up.");
  const loose = parseCloser("Note:\n{closer: OLDER, reason: \"chest is deep\"}", true);
  assert.equal(loose.closer, "OLDER");
  assert.equal(loose.ok, true);
  const blocked = parseCloser("{\"closer\":\"RANGE\",\"reason\":\"no\"}", false);
  assert.equal(blocked.closer, "RANGE");
  assert.equal(blocked.ok, false);
});

test("Gemini request uses the tested model settings and skips thought text", () => {
  const body = geminiRequestBody("prompt text", "data:image/jpeg;base64,QUJD");
  assert.equal((body.generationConfig as { maxOutputTokens: number }).maxOutputTokens, GEMINI_MAX_OUTPUT_TOKENS);
  const parts = (body.contents as Array<{ parts: Array<Record<string, unknown>> }>)[0].parts;
  assert.deepEqual(parts[0], { inline_data: { mime_type: "image/jpeg", data: "QUJD" } });
  assert.equal(parts[1].text, "prompt text");
  const text = extractGeminiText({
    candidates: [{ content: { parts: [{ thought: true, text: "hidden" }, { text: "{\"closer\":\"OLDER\"}" }] } }],
  });
  assert.equal(text, "{\"closer\":\"OLDER\"}");
});

test("closer prompts are the tested files, with bind, season, and chart", () => {
  const description = "Waist tucked. Neck thick. Legs look long.";
  const top = buildCloserPrompt(4.5, 5.5, description);
  assert.match(top, /SHORT-LEG RANGE RULE/);
  const middle = buildCloserPrompt(3.5, 4.5, description);
  assert.match(middle, /MATURE-BODY RULE/);
  assert.match(middle, /CHEST CHECK FOR THIS RULE/);
  const low = buildCloserPrompt(2.5, 3.5, description);
  assert.match(low, /HIDDEN-LEGS RANGE RULE/);
  assert.match(low, /MEDIUM-NECK RANGE RULE/);
  const yearling = buildCloserPrompt(1.5, 2.5, description);
  assert.match(yearling, /^Look at the body only/);
  assert.doesNotMatch(yearling, /RANGE RULE/);
  for (const prompt of [top, middle, low, yearling]) {
    assert.match(prompt, /You must judge from the recorded body observations/);
    assert.match(prompt, /Recorded body observations:\nWaist tucked/);
    assert.match(prompt, /Season and condition \(applies to both ages\):/);
    assert.match(prompt, /YOUNGER description \(/);
    assert.match(prompt, /OLDER description \(/);
  }
  assert.match(yearling, /YOUNGER description \(1\.5-year-old\):/);
  assert.match(yearling, /Looks like a doe with antlers/);
  assert.match(top, /OLDER description \(5\.5-year-old or older\):/);
});

test("retake stops before the gate and shows the single-fail message", async () => {
  const script = scripted([quality({ view_angle: "HEAD_ON" })]);
  const result = await walkHydrogen(script.call);
  assert.equal(result.kind, "retake");
  if (result.kind === "retake") assert.equal(result.message, RETAKE_MESSAGES.view_angle);
  assert.equal(script.prompts.length, 1);
});

test("baby gate stops at 1.5 and does not describe or compare", async () => {
  const script = scripted([quality(), gate("YES", "YES")]);
  const result = await walkHydrogen(script.call);
  assert.deepEqual(result, { kind: "age", label: "1.5", low: 1.5, high: 1.5, isRange: false, hunterCue: "", reason: "" });
  assert.equal(script.prompts.length, 2);
});

test("a gate field of BABY does not override a NO check", async () => {
  const script = scripted([
    quality(),
    JSON.stringify({ thin_body: "NO", baby_face: "YES", gate: "BABY" }),
    "Neck blends. Belly is level with the chest.",
    closer("OLDER"),
  ]);
  const result = await walkHydrogen(script.call);
  assert.equal(result.kind, "age");
  if (result.kind === "age") assert.equal(result.label, "5.5+");
  assert.match(script.prompts[3], /SAG RULE/);
});

test("top closer OLDER is 5.5+ and does not call the lower pairs", async () => {
  const script = scripted([quality(), gate("NO", "NO"), "Deep chest.", closer("OLDER")]);
  const result = await walkHydrogen(script.call);
  assert.equal(result.kind, "age");
  if (result.kind === "age") {
    assert.equal(result.label, "5.5+");
    assert.equal(result.isRange, false);
  }
  assert.equal(script.prompts.length, 4);
});

test("RANGE at 4.5 vs 3.5 keeps the cue and stops the walk", async () => {
  const script = scripted([
    quality({ legs_judgeable: "NO" }),
    gate("NO", "YES"),
    "Belly nearly at the chest, with a slight tuck.",
    closer("YOUNGER"),
    closer("RANGE", "A deeper chest would age it up toward 4.5."),
  ]);
  const result = await walkHydrogen(script.call);
  assert.equal(result.kind, "age");
  if (result.kind === "age") {
    assert.equal(result.label, "3.5–4.5");
    assert.equal(result.isRange, true);
    assert.equal(result.low, 3.5);
    assert.equal(result.high, 4.5);
    assert.match(result.hunterCue, /toward 4\.5/);
  }
  assert.match(script.prompts[3], /SHORT-LEG RANGE RULE/);
  assert.match(script.prompts[4], /MATURE-BODY RULE/);
  assert.equal(script.prompts.length, 5);
});

test("RANGE at the top and at 2.5 vs 3.5 format with the tested labels", async () => {
  const top = scripted([quality(), gate("NO", "NO"), "Short legs.", closer("RANGE", "A sag would age it up.")]);
  const topResult = await walkHydrogen(top.call);
  assert.equal(topResult.kind, "age");
  if (topResult.kind === "age") assert.equal(topResult.label, "4.5–5.5+");

  const low = scripted([
    quality(),
    gate("NO", "NO"),
    "Long legs, tucked belly, medium neck.",
    closer("YOUNGER"),
    closer("YOUNGER"),
    closer("RANGE", "A thicker neck would age it up toward 3.5."),
  ]);
  const lowResult = await walkHydrogen(low.call);
  assert.equal(lowResult.kind, "age");
  if (lowResult.kind === "age") {
    assert.equal(lowResult.label, "2.5–3.5");
    assert.match(lowResult.hunterCue, /3\.5/);
  }
  assert.match(low.prompts[5], /HIDDEN-LEGS RANGE RULE/);
});

test("walking all the way down lands on 1.5, and an illegal RANGE there does too", async () => {
  const down = scripted([
    quality(),
    gate("NO", "NO"),
    "Slim body.",
    closer("YOUNGER"),
    closer("YOUNGER"),
    closer("YOUNGER"),
    closer("YOUNGER"),
  ]);
  const exact = await walkHydrogen(down.call);
  assert.equal(exact.kind, "age");
  if (exact.kind === "age") assert.equal(exact.label, "1.5");
  assert.match(down.prompts[6], /^Look at the body only/);

  const illegal = scripted([
    quality(),
    gate("NO", "NO"),
    "Slim body.",
    closer("YOUNGER"),
    closer("YOUNGER"),
    closer("YOUNGER"),
    closer("RANGE"),
  ]);
  const fell = await walkHydrogen(illegal.call);
  assert.equal(fell.kind, "age");
  if (fell.kind === "age") assert.equal(fell.label, "1.5");
});

test("an unparsed range closer stops instead of inventing an age", async () => {
  const script = scripted([quality(), gate("NO", "NO"), "Body notes.", "I cannot tell."]);
  const result = await walkHydrogen(script.call);
  assert.deepEqual(result, { kind: "stop", reason: "unparsed 4.5 vs 5.5" });
});

test("a Hydrogen age becomes the 1.0.9 field call, and a straddling range stays borderline", () => {
  const shooter = hydrogenAgeBody({ low: 4.5, high: 4.5, label: "4.5", isRange: false, hunterCue: "", reason: "Chest is deep.", minimum: 4.5 });
  assert.equal(shooter.fieldCall, "SHOOTER");
  assert.equal(shooter.ageLabel, "4.5");
  assert.equal(shooter.meetsMinimumAge, true);
  const range = hydrogenAgeBody({ low: 4.5, high: 5.5, label: "4.5–5.5+", isRange: true, hunterCue: "A sag would age it up.", reason: "Short legs and a tight belly.", minimum: 4.5 });
  assert.equal(range.fieldCall, "SHOOTER");
  assert.equal(range.hunterCue, "A sag would age it up.");
  const split = hydrogenAgeBody({ low: 3.5, high: 4.5, label: "3.5–4.5", isRange: true, hunterCue: "", reason: "", minimum: 4.5 });
  assert.equal(split.fieldCall, "BORDERLINE");
  assert.equal(split.shooterPassLabel, "LET WALK");
  const young = hydrogenAgeBody({ low: 2.5, high: 3.5, label: "2.5–3.5", isRange: true, hunterCue: "", reason: "", minimum: 4.5 });
  assert.equal(young.fieldCall, "LET WALK");
  const baby = hydrogenAgeBody({ low: 1.5, high: 1.5, label: "1.5", isRange: false, hunterCue: "", reason: "", minimum: 3.5 });
  assert.equal(baby.fieldCall, "LET WALK");
  assert.equal(baby.ageClass, "1.5");
});

test("clients older than 1.0.9 stay on the existing age path", () => {
  assert.equal(agingEngineFor(undefined, "hydrogen"), "current");
  assert.equal(agingEngineFor("", "hydrogen"), "current");
  assert.equal(agingEngineFor("1.0.7", "hydrogen"), "current");
  assert.equal(agingEngineFor("1.0.8", "hydrogen"), "current");
  assert.equal(agingEngineFor("1.0.9", undefined), "hydrogen");
  assert.equal(agingEngineFor("1.0.9", "hydrogen"), "hydrogen");
  assert.equal(agingEngineFor("1.0.9", "openai"), "sol");
  assert.equal(agingEngineFor("1.0.10", "sol"), "sol");
  assert.equal(agingEngineFor("1.0.9", "gpt-5.6-sol"), "sol");
});
