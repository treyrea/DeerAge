import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldBundle, fieldRead } from "./field-call.js";

test("a clear 5.5 reads Shooter and mature", () => {
  const read = fieldRead(5.5, 80, 0);
  assert.equal(read.fieldCall, "Shooter");
  assert.equal(read.maturity, "mature");
  assert.match(read.fieldCallNote, /not a known age/);
});

test("a clear 2.5 reads Pass and young", () => {
  const read = fieldRead(2.5, 75, 0);
  assert.equal(read.fieldCall, "Pass");
  assert.equal(read.maturity, "young");
});

test("the 3.5 to 4.5 line is Borderline", () => {
  const read = fieldRead(3.5, 80, 0);
  assert.equal(read.fieldCall, "Borderline");
  assert.match(read.fieldCallNote, /closer look/);
});

test("low confidence stays Borderline even when the midpoint is old", () => {
  assert.equal(fieldRead(5.5, 40, 0).fieldCall, "Borderline");
});

test("cue bullets keep old topCues and name the body part", () => {
  const bundle = fieldBundle(4.5, 80, [{ name: "neck_thickness", pattern: "Blends into the chest" }], ["Deep chest"]);
  assert.equal(bundle.cueBullets[0]?.area, "Neck");
  assert.equal(bundle.cueBullets[0]?.text, "Blends into the chest");
  const fromTips = fieldBundle(2.5, 70, [], ["Legs still look long"]);
  assert.equal(fromTips.cueBullets[0]?.text, "Legs still look long");
});
