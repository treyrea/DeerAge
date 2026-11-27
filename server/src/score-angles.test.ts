import assert from "node:assert/strict";
import test from "node:test";
import { angleNamesFor, cleanAngleName, distinctAngleCount, nextExtraAngle, offerRackScore, scoreSetFromFrames, withExtraAngle } from "../../shared/score-angles.js";
import { scorePromptPlain } from "./prompts.js";
import { runScoreCall, setScoreCallerForTests } from "./score-pipeline.js";
import { scorePromptForAngles, scorePromptForRequest } from "./score-angles.js";

const FINAL = `FINAL {"deer_present":"YES","gross":150,"spread":16,"beams":{"left":22,"right":21},"tines":{"left":{"g1":4},"right":{"g1":4}},"mass":{"left":{"h1":4},"right":{"h1":4}}}`;

test("a single image keeps the original score prompt byte for byte", () => {
  const plain = scorePromptPlain();
  assert.equal(scorePromptForRequest(1, undefined), plain);
  assert.equal(scorePromptForRequest(1, ["First angle"]), plain);
  assert.equal(scorePromptForAngles(["First angle"]), plain);
  assert.equal(scorePromptForRequest(4, undefined), plain);
  assert.match(plain, /First, is a deer in this photo\?/);
});

test("named angles say they are one rack and label each image", () => {
  const names = angleNamesFor(3, ["First angle", "Other side", "Front (facing you)"]);
  assert.deepEqual(names, ["First angle", "Other side", "Front (facing you)"]);
  const prompt = scorePromptForRequest(3, names);
  assert.notEqual(prompt, scorePromptPlain());
  assert.match(prompt, /These photos are different angles of the same rack/);
  assert.doesNotMatch(prompt, /First, is a deer in this photo\?/);
  assert.match(prompt, /Image 1: First angle\nImage 2: Other side\nImage 3: Front \(facing you\)/);
  assert.match(prompt, /FINAL \{"deer_present":"YES"/);
});

test("angle labels are trimmed and a burst without labels is still one viewpoint", () => {
  assert.equal(cleanAngleName("  Other side \n", 1), "Other side");
  assert.equal(cleanAngleName("", 2), "Front (facing you)");
  assert.equal(angleNamesFor(3, ["Only one"]), null);
  assert.equal(distinctAngleCount([undefined, undefined]), 1);
  assert.equal(distinctAngleCount(["First angle", "First angle", "Other side"]), 2);
  assert.equal(nextExtraAngle(["First angle"]), "Other side");
  assert.equal(nextExtraAngle(["First angle", "Other side", "Front (facing you)", "Three-quarter view"]), null);
});

test("a burst collapses to one angle and extra stills stay within four photos", () => {
  const burst = scoreSetFromFrames([
    { imageUri: "file://a" },
    { imageUri: "file://b" },
    { imageUri: "file://c" },
  ]);
  assert.deepEqual(burst, [{ imageUri: "file://a", angleLabel: "First angle" }]);
  const added = withExtraAngle(burst, "file://side", "Other side");
  assert.equal(added.length, 2);
  assert.equal(nextExtraAngle(added.map((shot) => shot.angleLabel)), "Front (facing you)");
  const full = withExtraAngle(
    withExtraAngle(added, "file://front", "Front (facing you)"),
    "file://quarter",
    "Three-quarter view",
  );
  assert.equal(full.length, 4);
  assert.equal(withExtraAngle(full, "file://extra", "Other side").length, 4);
});

test("a rack score is offered for a finished age and hidden for a doe, a mount, or no antlers", () => {
  assert.equal(offerRackScore({}), true);
  assert.equal(offerRackScore({ antlers: "YES" }), true);
  assert.equal(offerRackScore({ antlers: "NO" }), false);
  assert.equal(offerRackScore({ stop: "no_antlers" }), false);
  assert.equal(offerRackScore({ stop: "not_live" }), false);
  assert.equal(offerRackScore({ stop: "harvested" }), false);
  assert.equal(offerRackScore(null), false);
});

test("the score call uses the multi prompt only when angles were named", async () => {
  const seen: string[] = [];
  setScoreCallerForTests(async (options) => {
    seen.push(options.prompt);
    return {
      role: options.role,
      model: "test",
      text: FINAL,
      usd: 0,
      ms: 1,
      promptTokens: 1,
      completionTokens: 1,
    };
  });
  try {
    await runScoreCall(["a", "b", "c"]);
    await runScoreCall(["a", "b"], ["First angle", "Other side"]);
  } finally {
    setScoreCallerForTests(null);
  }
  assert.equal(seen[0], scorePromptPlain());
  assert.match(seen[1] ?? "", /different angles of the same rack/);
  assert.match(seen[1] ?? "", /Image 2: Other side/);
});
