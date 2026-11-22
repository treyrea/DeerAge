/**
 * Quick Check, Score, and the gateway age path reject a person, a room, or a car.
 * Deer photos still age. No photos and no network.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readingFrom, runAgeCall, setAgeCallerForTests } from "./age-pipeline.js";
import type { ModelCall } from "./gateway.js";
import { resolveHydrogenAge } from "./hydrogen/failover.js";
import { groupIsNoDeer, NO_DEER_TIP, NO_DEER_TITLE, noDeerCopy, noDeerJobForMode } from "./hydrogen/no-deer.js";
import { bodyFirstAgePrompt, fastAgePrompt, maskedAgePrompt, scorePromptPlain } from "./prompts.js";
import { runScoreCall, scoreFrom, setScoreCallerForTests } from "./score-pipeline.js";

const AGE_KEYS = ["ageYears", "estimatedAgeYears", "ageClass", "ageLabel", "fieldCall", "confidence", "overallConfidence", "verdict", "decision", "grossScore", "gross"];

function call(text: string): ModelCall {
  return { role: "test", model: "test", text, usd: 0.001, ms: 1, promptTokens: 12, completionTokens: 8 };
}

function deer(age: number, present = "YES", stop: string | null = null): string {
  return `FINAL {"deer_present":"${present}","age":${age},"confidence":70,"visibleParts":["neck","chest"],"betterAngle":"","cues":[{"area":"neck","text":"Neck meets the chest"}],"stop":${stop === null ? "null" : `"${stop}"`}}`;
}

afterEach(() => {
  setAgeCallerForTests(null);
  setScoreCallerForTests(null);
});

test("the quick and score prompts name a person, a room, and a car as no deer, and keep a hard deer", () => {
  for (const prompt of [bodyFirstAgePrompt(4.5), fastAgePrompt(4.5), maskedAgePrompt(), scorePromptPlain()]) {
    assert.match(prompt, /deer_present/);
    assert.match(prompt, /person/i);
    assert.match(prompt, /living room/i);
    assert.match(prompt, /car/i);
    assert.match(prompt, /trail camera/i);
    assert.match(prompt, /partly hidden/i);
    assert.match(prompt, /If you are unsure, answer YES/);
  }
  const body = bodyFirstAgePrompt(4.5);
  assert.match(body, /partial photo of a deer/);
  assert.equal(/Do not refuse a partial photo\./.test(body), false);
  assert.match(body, /A person's neck, chest, or legs are not a deer's/);
  assert.match(scorePromptPlain(), /FINAL \{"deer_present":"NO"\}/);
});

test("an explicit NO is no deer even with an age beside it, and YES or a missing field is not", () => {
  const person = readingFrom(`FINAL {"deer_present":"NO","age":4.5,"confidence":50,"stop":null}`);
  assert.equal(person.deerPresent, "absent");
  assert.equal(person.age, 4.5);
  assert.equal(readingFrom(deer(5.5, "YES")).deerPresent, "present");
  assert.equal(readingFrom(deer(3.5, "CANT_TELL")).deerPresent, "present");
  assert.equal(readingFrom(`FINAL {"age":4.5,"confidence":60,"stop":null}`).deerPresent, "unknown");
  assert.equal(readingFrom(`FINAL {"age":4.5,"stop":"not_deer"}`).deerPresent, "unknown");
  assert.equal(readingFrom(`FINAL {"age":4.5,"stop":"not_deer"}`).stop, "not_deer");

  assert.equal(groupIsNoDeer([{ deerPresent: "absent", stop: null }, { deerPresent: "present", stop: null }]), false);
  assert.equal(groupIsNoDeer([{ deerPresent: "absent", stop: null }]), true);
  assert.equal(groupIsNoDeer([{ deerPresent: "unknown", stop: "not_deer" }]), true);
  assert.equal(groupIsNoDeer([{ deerPresent: "unknown", stop: null }]), false);
  assert.equal(groupIsNoDeer([]), false);
});

test("a person, a room, or a car in quick or gateway age returns no age, and a deer still does", async () => {
  const roles: string[] = [];
  const run = async (main: string, fast = deer(2.5)) => {
    roles.length = 0;
    setAgeCallerForTests(async (options) => {
      roles.push(options.role);
      if (options.role === "boxes") return call(`{"boxes":[]}`);
      if (options.role === "fast") return call(fast);
      return call(main);
    });
    return runAgeCall("jpeg", 4.5);
  };

  const person = await run(deer(4.5, "NO"));
  assert.equal(person.stop, "not_deer");
  assert.equal(person.result, null);
  assert.equal(roles.includes("ageFallback"), false);

  const room = await run(`FINAL {"deer_present":"NO","age":null,"confidence":0,"visibleParts":[],"cues":[],"stop":"not_deer"}`);
  assert.equal(room.stop, "not_deer");
  assert.equal(room.result, null);

  const car = await run(`FINAL {"age":4.5,"confidence":50,"visibleParts":["neck"],"cues":[{"area":"neck","text":"Looks thick"}],"stop":"not_deer"}`);
  assert.equal(car.stop, "not_deer");
  assert.equal(car.result, null);

  const buck = await run(deer(4.5, "YES"));
  assert.equal(buck.stop, null);
  assert.equal(buck.result?.ageYears, 4.5);
  assert.equal(buck.result?.isValidImage, true);
  assert.equal(typeof buck.result?.fieldCall, "string");

  const night = await run(deer(5.5, "YES"));
  assert.equal(night.stop, null);
  assert.equal(night.result?.ageYears, 5.5);

  const unsure = await run(deer(3.5, "CANT_TELL"));
  assert.equal(unsure.result?.ageYears, 3.5);

  const omitted = await run(`FINAL {"age":4.5,"confidence":70,"visibleParts":["neck"],"cues":[{"area":"neck","text":"Neck meets the chest"}],"stop":null}`);
  assert.equal(omitted.stop, null);
  assert.equal(omitted.result?.ageYears, 4.5);

  const fastMistake = await run(deer(4.5, "YES"), deer(2.5, "NO"));
  assert.equal(fastMistake.stop, null);
  assert.equal(fastMistake.result?.ageYears, 4.5);
});

test("a score call that says NO returns no score, even with a gross, and a deer still scores", async () => {
  let fallbacks = 0;
  setScoreCallerForTests(async (options) => {
    if (options.role === "scoreFallback") fallbacks += 1;
    return call(`FINAL {"deer_present":"NO","gross":150,"spread":16}`);
  });
  const person = await runScoreCall(["jpeg"]);
  assert.equal(person.noDeer, true);
  assert.equal(person.result, null);
  assert.equal(fallbacks, 0);
  assert.equal(scoreFrom(`FINAL {"deer_present":"NO","gross":140}`, false), "no_deer");

  setScoreCallerForTests(async () => call(`FINAL {"deer_present":"YES","gross":150,"spread":16,"beams":{"left":22,"right":21},"tines":{"left":{"g1":4},"right":{"g1":4}},"mass":{"left":{"h1":4},"right":{"h1":4}}}`));
  const buck = await runScoreCall(["jpeg"]);
  assert.equal(buck.noDeer, false);
  assert.equal(buck.result?.grossScore, 150);

  setScoreCallerForTests(async () => call(`FINAL {"gross":128,"spread":15,"beams":{"left":20,"right":20},"tines":{"left":{"g1":3},"right":{"g1":3}},"mass":{"left":{"h1":4},"right":{"h1":4}}}`));
  const omitted = await runScoreCall(["jpeg"]);
  assert.equal(omitted.noDeer, false);
  assert.equal(omitted.result?.grossScore, 128);

  const cantTell = scoreFrom(`FINAL {"deer_present":"CANT_TELL","gross":110,"spread":14,"beams":{"left":18,"right":18},"tines":{"left":{},"right":{}},"mass":{"left":{},"right":{}}}`, false);
  assert.notEqual(cantTell, "no_deer");
  assert.equal(cantTell && typeof cantTell === "object" ? cantTell.grossScore : null, 110);
});

test("quick, age, and score no-deer jobs carry the remote copy and no age", () => {
  const custom = noDeerCopy({ noDeerTitle: "Nothing there", noDeerTip: "Frame the deer and try again." });
  const quick = noDeerJobForMode("quick", custom) as Record<string, unknown>;
  assert.equal(quick.code, "not_deer");
  assert.equal("kind" in quick, false);
  assert.equal(quick.message, "Nothing there\nFrame the deer and try again.");
  assert.equal(quick.tip, "Frame the deer and try again.");

  const plain = noDeerJobForMode("quick", noDeerCopy()) as Record<string, unknown>;
  assert.equal(plain.message, `${NO_DEER_TITLE}\n${NO_DEER_TIP}`);

  for (const mode of ["age", "score"] as const) {
    const error = noDeerJobForMode(mode, custom) as Record<string, unknown>;
    assert.equal(error.kind, "no_deer");
    assert.equal(error.code, "retake");
    assert.equal(error.message, "Nothing there");
    assert.equal(error.tip, "Frame the deer and try again.");
    for (const key of AGE_KEYS) assert.equal(key in error, false, `${mode} ${key}`);
  }
  for (const key of AGE_KEYS) assert.equal(key in quick, false, key);
});

test("a gateway backup that finds no deer does not come back as an age", async () => {
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    primary: async () => ({ kind: "stop", reason: "unparsed quality" }),
    backup: async () => ({ kind: "no_deer" }),
    circuitOpen: async () => false,
    note: async () => undefined,
    log: () => undefined,
    backupOnStop: true,
  });
  assert.equal(resolved.kind, "no_deer");
  assert.equal("result" in resolved, false);
});

test("the deer check rides the call quick and score already make and stays under a cent", () => {
  const body = bodyFirstAgePrompt(4.5);
  const instructions = body.slice(body.indexOf("First, is a deer"), body.indexOf("You are aging"));
  const inputTokens = Math.ceil(instructions.length / 4);
  const outputTokens = 8;
  const perCall = (inputTokens * 4 + outputTokens * 20) / 1_000_000;
  const quick = perCall * 2;
  assert.ok(instructions.length > 200);
  assert.ok(quick < 0.01, `quick extra about $${quick.toFixed(4)} from ${inputTokens} input tokens`);
});
