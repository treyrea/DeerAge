/**
 * Antlerless decision. No photos and no network.
 * The notes prompt is the approved wording. Code, not the model, picks sex and age.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { defaultQuickConfig, runQuickHydrogen } from "../quick-engine.js";
import { hydrogenFinishPlan } from "./no-deer.js";
import { walkHydrogen, type ModelCaller } from "./pipeline.js";
import { hydrogenPrompts } from "./prompts.js";
import {
  ANTLERLESS_NOTES_PROMPT,
  antlerlessEligible,
  antlerlessJobError,
  decideAntlerless,
  parseAntlerlessNotes,
  readAntlerless,
  type AntlerlessNotes,
} from "./antlerless.js";
import { NO_ANTLERS_MESSAGE, parseSubject } from "./subject.js";

const NOTES_PROMPT_SHA = "4b117c1ec944678368fcce3bfa7c0a14d7a31ad07d53f1681067a98d8e011ed9";

function notes(overrides: Partial<AntlerlessNotes> = {}): AntlerlessNotes {
  return {
    spots: "NO",
    body_shape: "CANT_TELL",
    snout: "CANT_TELL",
    ear_eye_vs_eye_nose: "CANT_TELL",
    ears_vs_head: "NORMAL",
    belly: "CANT_TELL",
    back: "CANT_TELL",
    loose_skin: "CANT_TELL",
    legs_vs_body: "PROPORTIONAL",
    crown: "CANT_TELL",
    head_bumps: "NO",
    neck: "LONG_SLENDER",
    ...overrides,
  };
}

test("the notes prompt is the approved wording and does not ask for an age or a sex", () => {
  assert.match(ANTLERLESS_NOTES_PROMPT, /^Antlerless deer notes\. Look only at this photo\./);
  assert.match(ANTLERLESS_NOTES_PROMPT, /Do not name an age, an age class, or whether the deer is a buck or a doe\./);
  assert.match(ANTLERLESS_NOTES_PROMPT, /HEAD_BUMPS: YES or NO or CANT_TELL/);
  assert.match(ANTLERLESS_NOTES_PROMPT, /NECK: LONG_SLENDER or SHORT_THICK or CANT_TELL/);
  assert.match(
    ANTLERLESS_NOTES_PROMPT,
    /\{"spots":"","body_shape":"","snout":"","ear_eye_vs_eye_nose":"","ears_vs_head":"","belly":"","back":"","loose_skin":"","legs_vs_body":"","crown":"","head_bumps":"","neck":""\}/,
  );
  assert.equal(ANTLERLESS_NOTES_PROMPT.includes("This is a doe"), false);
  assert.equal(NOTES_PROMPT_SHA, createHash("sha256").update(ANTLERLESS_NOTES_PROMPT).digest("hex"));
});

test("spots are a fawn, three fawn signs are a fawn, and an adult-shaped body is can't tell", () => {
  const spotted = decideAntlerless(notes({ spots: "YES", neck: "SHORT_THICK" }));
  assert.deepEqual(spotted, { sex: "probably_doe", age: "fawn" });

  const young = decideAntlerless(notes({
    body_shape: "SQUARE",
    snout: "SHORT",
    ear_eye_vs_eye_nose: "ABOUT_EQUAL",
    ears_vs_head: "NORMAL",
    belly: "FLAT",
  }));
  assert.deepEqual(young, { sex: "probably_doe", age: "fawn" });

  const grown = decideAntlerless(notes({
    body_shape: "RECTANGLE",
    snout: "LONG",
    ear_eye_vs_eye_nose: "EAR_EYE_SHORTER",
    belly: "SAGGING",
  }));
  assert.deepEqual(grown, { sex: "probably_doe", age: "cant_tell" });
  assert.equal(grown.age === "fawn" || grown.age === "cant_tell", true);
  assert.equal(JSON.stringify(grown).includes("adult"), false);
});

test("head bumps or a thick neck without spots can be a buck, and an unseen head stays unclear", () => {
  assert.deepEqual(
    decideAntlerless(notes({ head_bumps: "YES", spots: "YES", body_shape: "SQUARE", snout: "SHORT", ears_vs_head: "LARGE" })),
    { sex: "buck_possible", age: null },
  );
  assert.deepEqual(
    decideAntlerless(notes({ head_bumps: "CANT_TELL", neck: "SHORT_THICK", spots: "NO" })),
    { sex: "buck_possible", age: null },
  );
  assert.deepEqual(
    decideAntlerless(notes({ head_bumps: "NO", neck: "SHORT_THICK", spots: "NO" })),
    { sex: "buck_possible", age: null },
  );
  assert.deepEqual(
    decideAntlerless(notes({ head_bumps: "CANT_TELL", neck: "CANT_TELL", spots: "CANT_TELL" })),
    { sex: "unclear", age: null },
  );
});

test("a notes reply that is not the JSON does not parse", () => {
  assert.equal(parseAntlerlessNotes("not json"), null);
  assert.equal(parseAntlerlessNotes('{"spots":"MAYBE"}'), null);
  assert.equal(parseAntlerlessNotes(""), null);
  const parsed = parseAntlerlessNotes(JSON.stringify(notes()));
  assert.deepEqual(parsed, notes());
});

test("only a live full-body deer with antlers NO is eligible", () => {
  const row = (antlers: string, scene = "LIVE", body = "FULL", posture = "STANDING") => antlerlessEligible(parseSubject(
    JSON.stringify({ posture, antlers, scene, body }),
  ));
  assert.equal(row("NO"), true);
  assert.equal(row("YES"), false);
  assert.equal(row("CANT_TELL"), false);
  assert.equal(row("NO", "MOUNT"), false);
  assert.equal(row("NO", "DECOY"), false);
  assert.equal(row("NO", "DRAWING"), false);
  assert.equal(row("NO", "LIVE", "FULL", "DEAD"), false);
  assert.equal(row("NO", "LIVE", "FULL", "HANGING"), false);
  assert.equal(row("NO", "LIVE", "HEAD"), false);
  assert.equal(row("NO", "LIVE", "NECK"), false);
  assert.equal(antlerlessEligible(parseSubject('{"posture":"STANDING","antlers":"NO"}')), false);
  assert.equal(antlerlessEligible(null), false);
});

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

function scripted(replies: Record<string, string | Error>): { call: ModelCaller; prompts: string[] } {
  const prompts = hydrogenPrompts();
  const seen: string[] = [];
  const call: ModelCaller = async (prompt) => {
    seen.push(prompt);
    const key = prompt === ANTLERLESS_NOTES_PROMPT
      ? "notes"
      : prompt === prompts.quality
        ? "quality"
        : prompt.startsWith("Subject check")
          ? "subject"
          : prompt === prompts.babyGate
            ? "gate"
            : "other";
    const reply = replies[key];
    if (reply == null) throw new Error(`unexpected ${key}`);
    if (reply instanceof Error) throw reply;
    return { text: reply };
  };
  return { call, prompts: seen };
}

const schedule = { parallelStart: false, parallelClosers: false, subjectCheck: true };

function subjectJson(antlers: string, extra: Record<string, string> = {}) {
  return JSON.stringify({ posture: "STANDING", antlers, scene: "LIVE", body: "FULL", ...extra });
}

test("a live full-body doe gets one notes call, and a bad reply falls back to no antlers", async () => {
  const fawn = scripted({
    subject: subjectJson("NO"),
    quality: quality(),
    notes: JSON.stringify(notes({ spots: "YES" })),
  });
  const decided = await walkHydrogen(fawn.call, undefined, schedule);
  assert.equal(fawn.prompts.filter((prompt) => prompt === ANTLERLESS_NOTES_PROMPT).length, 1);
  assert.equal(decided.kind, "antlerless");
  if (decided.kind === "antlerless") {
    assert.equal(decided.sex, "probably_doe");
    assert.equal(decided.age, "fawn");
    assert.equal(decided.message, NO_ANTLERS_MESSAGE);
    const wire = antlerlessJobError(decided);
    assert.equal(wire.code, "no_antlers");
    assert.equal(wire.message, NO_ANTLERS_MESSAGE);
    assert.equal(wire.kind, "antlerless");
    assert.equal("ageYears" in wire, false);
  }

  const broken = scripted({ subject: subjectJson("NO"), quality: quality(), notes: "not json" });
  const fallback = await walkHydrogen(broken.call, undefined, schedule);
  assert.equal(broken.prompts.filter((prompt) => prompt === ANTLERLESS_NOTES_PROMPT).length, 1);
  assert.equal(fallback.kind, "no_antlers");
  if (fallback.kind === "no_antlers") assert.equal(fallback.message, NO_ANTLERS_MESSAGE);

  const down = scripted({ subject: subjectJson("NO"), quality: quality(), notes: new Error("notes down") });
  const erred = await walkHydrogen(down.call, undefined, schedule);
  assert.equal(erred.kind, "no_antlers");
  assert.equal(down.prompts.filter((prompt) => prompt === ANTLERLESS_NOTES_PROMPT).length, 1);

  const logged: Record<string, unknown>[] = [];
  const read = await readAntlerless(
    async () => ({ text: JSON.stringify(notes({ spots: "YES" })) }),
    (event) => logged.push(event),
  );
  assert.equal(read.kind, "antlerless");
  assert.equal(logged.length, 1);
  assert.equal(logged[0]?.ok, true);
  assert.equal((logged[0]?.decision as { age?: string }).age, "fawn");
  assert.equal("image" in (logged[0] ?? {}), false);
  assert.equal(JSON.stringify(logged[0]).includes("base64"), false);
});

test("antlers yes or can't tell never read notes, and the other stops still win", async () => {
  const buck = scripted({ subject: subjectJson("YES"), quality: quality(), gate: BABY });
  const aged = await walkHydrogen(buck.call, undefined, schedule);
  assert.equal(aged.kind, "age");
  assert.equal(buck.prompts.includes(ANTLERLESS_NOTES_PROMPT), false);

  const hidden = scripted({ subject: subjectJson("CANT_TELL"), quality: quality(), gate: BABY });
  const still = await walkHydrogen(hidden.call, undefined, schedule);
  assert.equal(still.kind, "age");
  assert.equal(hidden.prompts.includes(ANTLERLESS_NOTES_PROMPT), false);

  const mount = scripted({
    subject: subjectJson("NO", { posture: "CANT_TELL", scene: "MOUNT", body: "FULL" }),
    quality: quality(),
  });
  assert.equal((await walkHydrogen(mount.call, undefined, schedule)).kind, "not_live");
  assert.equal(mount.prompts.includes(ANTLERLESS_NOTES_PROMPT), false);

  const dead = scripted({
    subject: subjectJson("NO", { posture: "DEAD" }),
    quality: quality({ standing_upright: "NO" }),
  });
  assert.equal((await walkHydrogen(dead.call, undefined, schedule)).kind, "harvested");
  assert.equal(dead.prompts.includes(ANTLERLESS_NOTES_PROMPT), false);

  const head = scripted({
    subject: subjectJson("YES", { body: "HEAD" }),
    quality: quality({ belly_waist_visible: "NO" }),
  });
  assert.equal((await walkHydrogen(head.call, undefined, schedule)).kind, "no_body");
  assert.equal(head.prompts.includes(ANTLERLESS_NOTES_PROMPT), false);

  const doeHead = scripted({
    subject: subjectJson("NO", { body: "HEAD" }),
    quality: quality(),
  });
  assert.equal((await walkHydrogen(doeHead.call, undefined, schedule)).kind, "no_antlers");
  assert.equal(doeHead.prompts.includes(ANTLERLESS_NOTES_PROMPT), false);
});

test("an antlerless read keeps one credit and does not sign an age record", () => {
  assert.equal(hydrogenFinishPlan("antlerless").charge, true);
  assert.equal(hydrogenFinishPlan("antlerless").saveRecord, false);
  assert.equal(hydrogenFinishPlan("no_antlers").charge, false);
});

test("quick check uses the same notes branch, and a spike does not", async () => {
  const run = async (tail: string, notesReply?: string | Error) => {
    const seen: string[] = [];
    const outcome = await runQuickHydrogen({
      engine: "plain",
      call: async (prompt) => {
        seen.push(prompt);
        if (prompt === ANTLERLESS_NOTES_PROMPT) {
          if (notesReply == null) throw new Error("notes not expected");
          if (notesReply instanceof Error) throw notesReply;
          return { text: notesReply };
        }
        return { text: `This whitetail is in the **1.5-year-old** age class.\nDEER_PRESENT: YES\n${tail}` };
      },
      minimum: 4.5,
      leaseRules: false,
      config: defaultQuickConfig(),
      resolveFull: async () => {
        throw new Error("should not escalate");
      },
      log: () => undefined,
    });
    return { outcome, notes: seen.filter((prompt) => prompt === ANTLERLESS_NOTES_PROMPT).length };
  };

  const doe = await run(
    "POSTURE: STANDING\nANTLERS: NO\nSCENE: LIVE\nBODY_VISIBLE: FULL",
    JSON.stringify(notes({ body_shape: "RECTANGLE", snout: "LONG" })),
  );
  assert.equal(doe.notes, 1);
  assert.equal(doe.outcome.kind, "antlerless");
  if (doe.outcome.kind === "antlerless") {
    assert.equal(doe.outcome.sex, "probably_doe");
    assert.equal(doe.outcome.age, "cant_tell");
  }

  const broken = await run("POSTURE: STANDING\nANTLERS: NO\nSCENE: LIVE\nBODY_VISIBLE: FULL", "nope");
  assert.equal(broken.notes, 1);
  assert.equal(broken.outcome.kind, "no_antlers");

  const spike = await run("POSTURE: STANDING\nANTLERS: YES\nSCENE: LIVE\nBODY_VISIBLE: FULL");
  assert.equal(spike.notes, 0);
  assert.equal(spike.outcome.kind, "age");

  const unsure = await run("POSTURE: STANDING\nANTLERS: CANT_TELL\nSCENE: LIVE\nBODY_VISIBLE: FULL");
  assert.equal(unsure.notes, 0);
  assert.equal(unsure.outcome.kind, "age");

  const mount = await run("POSTURE: CANT_TELL\nANTLERS: NO\nSCENE: MOUNT\nBODY_VISIBLE: FULL");
  assert.equal(mount.notes, 0);
  assert.equal(mount.outcome.kind, "not_live");

  const dead = await run("POSTURE: DEAD\nANTLERS: NO\nSCENE: LIVE\nBODY_VISIBLE: FULL");
  assert.equal(dead.notes, 0);
  assert.equal(dead.outcome.kind, "harvested");

  const head = await run("POSTURE: STANDING\nANTLERS: YES\nSCENE: LIVE\nBODY_VISIBLE: HEAD");
  assert.equal(head.notes, 0);
  assert.equal(head.outcome.kind, "no_body");
});
