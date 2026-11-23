import assert from "node:assert/strict";
import test from "node:test";
import { SIDE_ON_TIP } from "./crosscheck.js";
import { applySideOnTip, crossCheckCues, observationCues, poseNeedsSideOn, showSideOnTip } from "./cues.js";
import { hydrogenAgeBody } from "./result.js";
import type { CrossCheck } from "./crosscheck.js";

test("recorded observations become a few short body cues", () => {
  const cues = observationCues("- Belly tucks up\n- Legs look long\n* Belly tucks up\n\nThe back line is level. The neck is still thin.");
  assert.deepEqual(cues, [
    "Belly tucks up.",
    "Legs look long.",
    "The back line is level.",
    "The neck is still thin.",
  ]);
  assert.equal(observationCues("   ").length, 0);
});

test("cross-check body facts become cues and skip a cant-tell", () => {
  const text = crossCheckCues({
    legs_vs_chest: "LEGS_LONGER",
    belly_line: "SAG",
    back_line: "CANT_TELL",
    front_vs_rear: "CANT_TELL",
    brisket: "YES",
    face_to_camera: "YES",
    object_in_front: "NO",
    object_on_head_neck: "NO",
    spread_vs_ears: "OUTSIDE",
    beam_mass: "HEAVY",
    tines_vs_ears: "YES",
    points_one_side: 5,
    object_in_front_part: "",
  } as CrossCheck);
  assert.match(text, /Legs look longer than the chest/);
  assert.match(text, /The belly sags/);
  assert.match(text, /A brisket shows under the chest/);
  assert.equal(text.includes("cant"), false);
  assert.equal(text.toLowerCase().includes("heavy"), false);
});

test("the side-on tip is added only when the pose check said not broadside", () => {
  assert.equal(poseNeedsSideOn("BROADSIDE"), false);
  assert.equal(poseNeedsSideOn("CANT_TELL"), false);
  assert.equal(poseNeedsSideOn("QUARTERING"), true);
  assert.equal(poseNeedsSideOn("HEAD_ON"), true);
  assert.equal(showSideOnTip("R1_old_call_young_rack", "BROADSIDE"), false);
  assert.equal(showSideOnTip("R1_old_call_young_rack", "QUARTERING"), true);
  assert.equal(showSideOnTip("none", "HEAD_ON"), false);
  const note = "The body and the rack disagree.";
  assert.equal(applySideOnTip(`${note} ${SIDE_ON_TIP}`, false), note);
  assert.equal(applySideOnTip(note, true), `${note} ${SIDE_ON_TIP}`);
});

test("a successful age with no model sentence still shows a body cue from the notes", () => {
  const body = hydrogenAgeBody({
    low: 2.5,
    high: 2.5,
    label: "2.5",
    isRange: false,
    hunterCue: "",
    reason: "",
    observations: "Belly tucks up.\nLegs look long.",
    minimum: 4.5,
  });
  assert.equal(body.ageYears, 2.5);
  assert.equal(body.lookFor, "Belly tucks up.");
  assert.deepEqual(body.reasons, ["Legs look long."]);
  assert.equal(String(body.hunterCue).includes(SIDE_ON_TIP), false);
  assert.equal(JSON.stringify(body.reasons).includes(SIDE_ON_TIP), false);
});

test("a model body sentence with no look-for line is shown on the card", () => {
  const body = hydrogenAgeBody({
    low: 3.5,
    high: 3.5,
    label: "3.5",
    isRange: false,
    hunterCue: "",
    reason: "The chest is deep and the belly is close.",
    minimum: 4.5,
  });
  assert.equal(body.ageYears, 3.5);
  assert.equal(body.lookFor, "The chest is deep and the belly is close.");
  assert.deepEqual(body.reasons, []);
});
