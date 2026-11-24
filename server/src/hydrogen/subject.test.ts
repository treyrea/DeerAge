/**
 * Harvested deer and antlerless deer stop before an age.
 * A standing spike still ages. No photos and no network.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { hardStop, readingFrom, runAgeCall, setAgeCallerForTests } from "../age-pipeline.js";
import type { ModelCall } from "../gateway.js";
import { bodyFirstAgePrompt, fastAgePrompt, maskedAgePrompt } from "../prompts.js";
import { defaultQuickConfig, runQuickHydrogen } from "../quick-engine.js";
import { defaultAgingConfig } from "./aging.js";
import { ageWithRouter } from "./age-with-router.js";
import { resolveHydrogenAge } from "./failover.js";
import { walkHydrogen, type ModelCaller } from "./pipeline.js";
import { hydrogenPrompts } from "./prompts.js";
import { RETAKE_MESSAGES } from "./rules.js";
import {
  HARVESTED_MESSAGE,
  NO_ANTLERS_MESSAGE,
  parseSubject,
  subjectJobError,
  subjectPrompt,
  subjectStop,
} from "./subject.js";

function call(text: string): ModelCall {
  return { role: "test", model: "test", text, usd: 0.001, ms: 1, promptTokens: 8, completionTokens: 8 };
}

function final(age: number | null, stop: string | null): string {
  return `FINAL {"deer_present":"YES","age":${age ?? "null"},"confidence":40,"visibleParts":["body"],"betterAngle":"","cues":[],"stop":${stop == null ? "null" : `"${stop}"`}}`;
}

const quality = (overrides: Record<string, string> = {}) => JSON.stringify({
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
  ...overrides,
});

const BABY = JSON.stringify({ thin_body: "YES", baby_face: "YES", gate: "BABY" });

afterEach(() => setAgeCallerForTests(null));

test("subject facts: only a clear carcass or a clearly bare head stops", () => {
  assert.equal(subjectStop(parseSubject('{"posture":"DEAD","antlers":"NO"}')), "harvested");
  assert.equal(subjectStop(parseSubject('{"posture":"HANGING","antlers":"YES"}')), "harvested");
  assert.equal(subjectStop(parseSubject('{"posture":"STANDING","antlers":"NO"}')), "no_antlers");
  assert.equal(subjectStop(parseSubject('{"posture":"STANDING","antlers":"YES"}')), null);
  assert.equal(subjectStop(parseSubject('{"posture":"BEDDED","antlers":"YES"}')), null);
  assert.equal(subjectStop(parseSubject('{"posture":"STANDING","antlers":"CANT_TELL"}')), null);
  assert.equal(subjectStop(parseSubject("not json")), null);
  assert.equal(parseSubject('{"posture":"LYING","antlers":"NO"}'), null);
  assert.equal(subjectJobError("harvested").code, "retake");
  assert.match(subjectJobError("harvested").message, /lower jawbone/);
  assert.equal(subjectJobError("no_antlers").code, "no_antlers");
  assert.match(subjectJobError("no_antlers").message, /live bucks/);
  assert.match(subjectPrompt(), /spikes/i);
  assert.match(subjectPrompt(), /tailgate/i);
});

test("the gateway prompts tell a dead deer and a doe to stop, and still age a spike", () => {
  for (const prompt of [bodyFirstAgePrompt(4.5), fastAgePrompt(4.5)]) {
    assert.match(prompt, /stop to harvested/);
    assert.match(prompt, /Spikes, buttons, velvet/);
    assert.match(prompt, /do not use no_antlers/);
  }
  assert.equal(maskedAgePrompt().includes("stop to harvested"), false);
});

function scripted(replies: Record<string, string | Error>): ModelCaller {
  const prompts = hydrogenPrompts();
  return async (prompt) => {
    const key = prompt === subjectPrompt()
      ? "subject"
      : prompt === prompts.quality
        ? "quality"
        : prompt === prompts.babyGate
          ? "gate"
          : "other";
    const reply = replies[key];
    if (reply == null) throw new Error(`unexpected ${key}`);
    if (reply instanceof Error) throw reply;
    return { text: reply };
  };
}

test("a dead doe stops instead of a standing retake that would become an age", async () => {
  const result = await walkHydrogen(
    scripted({ subject: '{"posture":"DEAD","antlers":"NO"}', quality: quality({ standing_upright: "NO" }) }),
    undefined,
    { parallelStart: false, parallelClosers: false, subjectCheck: true },
  );
  assert.equal(result.kind, "harvested");
  if (result.kind === "harvested") assert.equal(result.message, HARVESTED_MESSAGE);
});

test("a hanging buck stops, and a bedded buck stays a standing retake", async () => {
  const hanging = await walkHydrogen(
    scripted({ subject: '{"posture":"HANGING","antlers":"YES"}', quality: quality() }),
    undefined,
    { parallelStart: false, parallelClosers: false, subjectCheck: true },
  );
  assert.equal(hanging.kind, "harvested");

  const bedded = await walkHydrogen(
    scripted({ subject: '{"posture":"BEDDED","antlers":"YES"}', quality: quality({ standing_upright: "NO" }) }),
    undefined,
    { parallelStart: false, parallelClosers: false, subjectCheck: true },
  );
  assert.equal(bedded.kind, "retake");
  if (bedded.kind === "retake") assert.equal(bedded.message, RETAKE_MESSAGES.standing_upright);
});

test("a standing doe stops, and a standing spike still reaches the yearling age", async () => {
  const doe = await walkHydrogen(
    scripted({ subject: '{"posture":"STANDING","antlers":"NO"}', quality: quality() }),
    undefined,
    { parallelStart: false, parallelClosers: false, subjectCheck: true },
  );
  assert.equal(doe.kind, "no_antlers");
  if (doe.kind === "no_antlers") assert.equal(doe.message, NO_ANTLERS_MESSAGE);

  const spike = await walkHydrogen(
    scripted({
      subject: '{"posture":"STANDING","antlers":"YES"}',
      quality: quality(),
      gate: BABY,
    }),
    undefined,
    { parallelStart: false, parallelClosers: false, subjectCheck: true },
  );
  assert.equal(spike.kind, "age");
  if (spike.kind === "age") assert.equal(spike.label, "1.5");

  const hidden = await walkHydrogen(
    scripted({
      subject: '{"posture":"STANDING","antlers":"CANT_TELL"}',
      quality: quality(),
      gate: BABY,
    }),
    undefined,
    { parallelStart: false, parallelClosers: false, subjectCheck: true },
  );
  assert.equal(hidden.kind, "age");
});

test("a tiny deer stays get-closer, and a failed subject check does not block a buck", async () => {
  const tiny = await walkHydrogen(
    scripted({ subject: '{"posture":"DEAD","antlers":"NO"}', quality: quality({ deer_large_enough: "NO" }) }),
    undefined,
    { parallelStart: false, parallelClosers: false, subjectCheck: true },
  );
  assert.equal(tiny.kind, "retake");
  if (tiny.kind === "retake") assert.match(tiny.message, /Get closer or zoom in/);

  const down = await walkHydrogen(
    scripted({ subject: new Error("subject down"), quality: quality(), gate: BABY }),
    undefined,
    { parallelStart: false, parallelClosers: false, subjectCheck: true },
  );
  assert.equal(down.kind, "age");
  if (down.kind === "age") assert.equal(down.label, "1.5");
});

test("the router does not replace a harvested stop or a doe with the plain age", async () => {
  const settings = { ...defaultAgingConfig(), plainPrompt: "PLAIN", crossCheckPrompt: "CROSS" };
  const harvested = await ageWithRouter({
    call: async () => ({ text: "Best placed in the **1.5-year-old** age class." }),
    settings,
    walk: async () => ({ kind: "harvested", message: HARVESTED_MESSAGE }),
    log: () => undefined,
  });
  assert.equal(harvested.kind, "harvested");

  let backups = 0;
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    primary: async () => ({ kind: "no_antlers", message: NO_ANTLERS_MESSAGE }),
    backup: async () => {
      backups += 1;
      return { estimatedAgeYears: 1.5 };
    },
    circuitOpen: async () => false,
    note: async () => undefined,
    log: () => undefined,
    backupOnStop: true,
  });
  assert.equal(resolved.kind, "no_antlers");
  assert.equal(backups, 0);
});

test("quick check stops a dead deer and a doe from the same read, and a spike still ages", async () => {
  const run = (tail: string) => runQuickHydrogen({
    engine: "plain",
    call: async () => ({
      text: `This whitetail buck is in the **1.5-year-old (yearling)** age class.\nDEER_PRESENT: YES\n${tail}`,
    }),
    minimum: 4.5,
    leaseRules: false,
    config: defaultQuickConfig(),
    resolveFull: async () => {
      throw new Error("should not escalate");
    },
    log: () => undefined,
  });
  assert.equal((await run("POSTURE: DEAD\nANTLERS: NO")).kind, "harvested");
  assert.equal((await run("POSTURE: STANDING\nANTLERS: NO")).kind, "no_antlers");
  const spike = await run("POSTURE: STANDING\nANTLERS: YES");
  assert.equal(spike.kind, "age");
  if (spike.kind === "age") assert.equal(spike.result.ageYears, 1.5);
  const omitted = await run("");
  assert.equal(omitted.kind, "age");
});

test("a young fast age no longer bypasses no_antlers, and a spike with an age still passes", async () => {
  assert.equal(hardStop([
    readingFrom(final(null, "no_antlers")),
  ]), "no_antlers");
  assert.equal(hardStop([
    readingFrom(final(1.5, null)),
  ]), null);
  assert.equal(hardStop([
    readingFrom(final(2.5, "harvested")),
  ]), "harvested");

  const run = async (main: string, fast: string) => {
    setAgeCallerForTests(async (options) => {
      if (options.role === "boxes") return call(`{"boxes":[]}`);
      if (options.role === "fast") return call(fast);
      return call(main);
    });
    return runAgeCall("jpeg", 4.5);
  };

  const doe = await run(final(null, "no_antlers"), final(1.5, null));
  assert.equal(doe.stop, "no_antlers");
  assert.equal(doe.result, null);

  const dead = await run(final(2.5, "harvested"), final(1.5, null));
  assert.equal(dead.stop, "harvested");
  assert.equal(dead.result, null);

  const spike = await run(final(1.5, null), final(1.5, null));
  assert.equal(spike.stop, null);
  assert.equal(spike.result?.ageYears, 1.5);
});
