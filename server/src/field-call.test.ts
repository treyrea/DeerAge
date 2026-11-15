import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldBundle, fieldRead, finalCall } from "./field-call.js";

test("a clear 5.5 is a shooter when the lease minimum is 4.5", () => {
  const read = fieldRead(5.5, 80, 4.5, 0);
  assert.equal(read.fieldCall, "SHOOTER");
  assert.equal(read.ageClass, "5.5");
  assert.match(read.fieldCallNote, /lease minimum of 4.5/);
  assert.doesNotMatch(read.fieldCallNote, /mature/i);
});

test("a clear 2.5 is let walk under a 4.5 minimum", () => {
  const read = fieldRead(2.5, 80, 4.5, 0);
  assert.equal(read.fieldCall, "LET WALK");
  assert.match(read.fieldCallNote, /under your lease minimum of 4.5/);
});

test("a clear 3.5 meets a 3.5 lease minimum", () => {
  const read = fieldRead(3.5, 80, 3.5, 0);
  assert.equal(read.fieldCall, "SHOOTER");
  assert.equal(read.ageClass, "3.5");
});

test("a 3.5 point read under a 4.5 minimum is let walk", () => {
  const read = fieldRead(3.5, 60, 4.5, 0);
  assert.equal(read.fieldCall, "LET WALK");
});

test("a missing body check cannot be a shooter", () => {
  const read = finalCall({ mainYears: 5.5, bodyYears: null, minimum: 4.5, confirmed: true, bodyMissing: true });
  assert.equal(read.fieldCall, "BORDERLINE");
  assert.match(read.fieldCallNote, /body check didn't come back/);
});

test("a shooter with a 1.5 body is borderline", () => {
  const read = finalCall({ mainYears: 5.5, bodyYears: 1.5, minimum: 4.5, confirmed: true });
  assert.equal(read.fieldCall, "BORDERLINE");
  assert.match(read.fieldCallNote, /Big rack, young body/);
  assert.match(read.fieldCallNote, /1\.5/);
  assert.match(read.fieldCallNote, /4\.5/);
});

test("the same 4.5 buck is let walk when the lease minimum is 5.5", () => {
  assert.equal(fieldRead(4.5, 85, 5.5, 0).fieldCall, "LET WALK");
});

test("cue bullets keep the body part that explains the class", () => {
  const bundle = fieldBundle(4.5, 80, [{ name: "neck_thickness", pattern: "Blends into the chest" }], ["Deep chest"], 4.5);
  assert.equal(bundle.cueBullets[0]?.area, "Neck");
  assert.equal(bundle.fieldCall, "SHOOTER");
});
