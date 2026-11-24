/**
 * The parallel walk must give exactly the sequential walk's answer for the same model outputs.
 * Every combination of photo check, gate, Step A and closer answers (including garbage, empty
 * and failed calls) is run through all four schedules and compared. No network, no photos.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { SEQUENTIAL_WALK, walkHydrogen, type ModelCaller, type WalkSchedule } from "./pipeline.js";
import { activeQualityPrompt, buildCloserPrompt, hydrogenPrompts } from "./prompts.js";
import { PAIRS } from "./rules.js";
import { ageWithRouter } from "./age-with-router.js";
import { defaultAgingConfig, normalizeAging } from "./aging.js";

const GOOD_QUALITY = JSON.stringify({
  view_angle: "BROADSIDE", standing_upright: "YES", head_position: "UP", belly_waist_visible: "YES",
  neck_chest_visible: "YES", legs_judgeable: "YES", subject_separable: "YES", deer_large_enough: "YES",
  contour_readable: "YES", lighting: "DAY",
});
const QUALITY = {
  ok: GOOD_QUALITY,
  retake: GOOD_QUALITY.replace("BROADSIDE", "HEAD_ON"),
  absent: JSON.stringify({ deer_present: "NO" }),
  garbage: "I am not sure.",
  fail: null,
} as const;
const GATE = {
  baby: JSON.stringify({ thin_body: "YES", baby_face: "YES", gate: "BABY" }),
  adult: JSON.stringify({ thin_body: "NO", baby_face: "NO", gate: "NOT_BABY" }),
  garbage: "maybe",
  fail: null,
} as const;
const STEP_A = { text: "Deep chest, belly level with the chest.", empty: "   ", fail: null } as const;
const closer = (value: string) => JSON.stringify({ closer: value, reason: `${value} because`, hunter_cue: value === "RANGE" ? "Cue." : "" });
const CLOSER = { Y: closer("YOUNGER"), O: closer("OLDER"), R: closer("RANGE"), G: "no idea", F: null } as const;

type Reply = string | null;

/** Answers by prompt, so call order does not matter. null = the call fails. Records cancelled calls. */
function byPrompt(answers: Map<string, Reply>, delays?: Map<string, number>) {
  const calls: string[] = [];
  const cancelled: string[] = [];
  const call: ModelCaller = async (prompt, _accept, signal) => {
    calls.push(prompt);
    const wait = delays?.get(prompt) ?? 0;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (signal?.aborted) {
      cancelled.push(prompt);
      throw new Error("cancelled");
    }
    if (!answers.has(prompt)) throw new Error("unexpected prompt");
    const reply = answers.get(prompt);
    if (reply == null) throw new Error("model call failed");
    return { text: reply };
  };
  return { call, calls, cancelled };
}

const SCHEDULES: WalkSchedule[] = [
  SEQUENTIAL_WALK,
  { parallelStart: true, parallelClosers: false },
  { parallelStart: false, parallelClosers: true },
  { parallelStart: true, parallelClosers: true },
];

async function outcome(schedule: WalkSchedule, answers: Map<string, Reply>) {
  const { call } = byPrompt(answers);
  try {
    return { ok: true, value: await walkHydrogen(call, undefined, schedule) };
  } catch (error) {
    return { ok: false, value: error instanceof Error ? error.message : String(error) };
  }
}

test("every schedule gives the sequential walk's answer, for every combination of model outputs", async () => {
  const prompts = hydrogenPrompts();
  let cases = 0;
  const closerKeys = Object.keys(CLOSER) as Array<keyof typeof CLOSER>;
  const closerCombos: Array<Array<keyof typeof CLOSER>> = [];
  for (const a of closerKeys) for (const b of closerKeys) for (const c of closerKeys) for (const d of closerKeys) closerCombos.push([a, b, c, d]);
  for (const [qKey, q] of Object.entries(QUALITY)) {
    for (const [gKey, g] of Object.entries(GATE)) {
      for (const [sKey, s] of Object.entries(STEP_A)) {
        // Closers only matter when the walk reaches them; skip the full set otherwise.
        const reaches = qKey === "ok" && gKey === "adult" && sKey === "text";
        for (const combo of reaches ? closerCombos : [["Y", "Y", "Y", "Y"] as Array<keyof typeof CLOSER>]) {
          const answers = new Map<string, Reply>([[prompts.quality, q], [prompts.babyGate, g], [prompts.stepA, s]]);
          PAIRS.forEach(([older, younger], i) => answers.set(buildCloserPrompt(younger, older, STEP_A.text), CLOSER[combo[i]]));
          const expected = await outcome(SEQUENTIAL_WALK, answers);
          for (const schedule of SCHEDULES.slice(1)) {
            assert.deepEqual(await outcome(schedule, answers), expected, `${qKey}/${gKey}/${sKey}/${combo.join("")} ${JSON.stringify(schedule)}`);
          }
          cases += 1;
        }
      }
    }
  }
  assert.ok(cases > 600, `cases ${cases}`);
});

test("parallel start runs the three first calls together; unused calls are cancelled", async () => {
  const prompts = hydrogenPrompts();
  const answers = new Map<string, Reply>([[prompts.quality, QUALITY.retake], [prompts.babyGate, GATE.adult], [prompts.stepA, STEP_A.text]]);
  const slow = new Map([[prompts.babyGate, 20], [prompts.stepA, 20]]);
  const run = byPrompt(answers, slow);
  const result = await walkHydrogen(run.call, undefined, { parallelStart: true, parallelClosers: true });
  assert.equal(result.kind, "retake");
  assert.deepEqual(run.calls.slice(0, 3), [prompts.quality, prompts.babyGate, prompts.stepA]);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(run.cancelled.sort(), [prompts.babyGate, prompts.stepA].sort());
});

test("parallel closers start every pair after Step A and cancel the ones not needed", async () => {
  const prompts = hydrogenPrompts();
  const answers = new Map<string, Reply>([[prompts.quality, QUALITY.ok], [prompts.babyGate, GATE.adult], [prompts.stepA, STEP_A.text]]);
  const closerPrompts = PAIRS.map(([older, younger]) => buildCloserPrompt(younger, older, STEP_A.text));
  closerPrompts.forEach((prompt) => answers.set(prompt, CLOSER.O));
  const slow = new Map(closerPrompts.slice(1).map((prompt) => [prompt, 20] as [string, number]));
  const run = byPrompt(answers, slow);
  const result = await walkHydrogen(run.call, undefined, { parallelStart: true, parallelClosers: true });
  assert.equal(result.kind === "age" && result.label, "5.5+");
  assert.equal(run.calls.filter((prompt) => closerPrompts.includes(prompt)).length, 4);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(run.cancelled.length, 3);
});

test("no deer: the router answers at once and cancels the plain read and cross-check (no retries)", async () => {
  const prompts = hydrogenPrompts();
  // Default walk uses the live quality prompt (bundled file plus the ignore-reticle sentence).
  const qualityPrompt = activeQualityPrompt(defaultAgingConfig().ignoreReticle);
  const answers = new Map<string, Reply>([[qualityPrompt, QUALITY.absent], [prompts.babyGate, GATE.adult], [prompts.stepA, STEP_A.text]]);
  const seen: string[] = [];
  let sideCalls = 0;
  let sideCancelled = 0;
  const call: ModelCaller = async (prompt, accept, signal) => {
    seen.push(prompt);
    if (answers.has(prompt)) return { text: answers.get(prompt) as string };
    // Plain read and cross-check: slow, and would be retried by the real caller if unparsed.
    sideCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (signal?.aborted) {
      sideCancelled += 1;
      throw new Error("cancelled");
    }
    return { text: "There is no deer in this photo." };
  };
  const started = Date.now();
  const logs: Array<{ branch: string; early?: boolean }> = [];
  const result = await ageWithRouter({ call, settings: defaultAgingConfig(), log: (event) => logs.push(event) });
  assert.equal(result.kind, "no_deer");
  assert.ok(Date.now() - started < 150, "did not wait for the side calls");
  assert.equal(logs[0]?.branch, "no_deer");
  assert.equal(logs[0]?.early, true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  // Plain, cross-check, and the subject check. All three are cancelled. Quality, gate, and Step A are answered from the map.
  assert.equal(sideCalls, 3);
  assert.equal(sideCancelled, 3);
});

test("the live switches default on and can be turned off", () => {
  const config = defaultAgingConfig();
  assert.equal(config.parallelStart, true);
  assert.equal(config.parallelClosers, true);
  const off = normalizeAging({ parallelStart: false, parallelClosers: false });
  assert.equal(off.parallelStart, false);
  assert.equal(off.parallelClosers, false);
  assert.equal(normalizeAging({ parallelStart: "no" }).parallelStart, true);
});
