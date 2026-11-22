import assert from "node:assert/strict";
import { test } from "node:test";
import { boxesFrom, maskedVerdict, provisionalFromFast, readingFrom } from "./age-pipeline.js";
import { parseFinal } from "./gateway.js";
import { coverAntlers } from "./mask.js";
import sharp from "sharp";

test("a FINAL line is the only JSON the scan keeps", () => {
  const parsed = parseFinal("The neck is thin.\nFINAL {\"age\":2.5,\"confidence\":40,\"stop\":null}");
  assert.equal(parsed?.age, 2.5);
  const reading = readingFrom("FINAL {\"age\":1.5,\"confidence\":30,\"visibleParts\":[\"neck\"],\"cues\":[\"Thin neck\"],\"stop\":null}");
  assert.equal(reading.age, 1.5);
  assert.deepEqual(reading.visibleParts, ["neck"]);
  assert.deepEqual(boxesFrom("{\"boxes\":[[0.1,0.2,0.4,0.5]]}"), [[0.1, 0.2, 0.4, 0.5]]);
});

test("the first screen holds when the fast read is young, and one young body vetoes a shooter", () => {
  assert.equal(provisionalFromFast().fieldCall, "HOLD");
  assert.equal(provisionalFromFast().ageClass, "");
  const young = maskedVerdict([{ age: 2.5, confidence: 40, visibleParts: [], betterAngle: "", cues: [], labeled: [], stop: null, deerPresent: "unknown", backup: false }, null]);
  assert.equal(young.vetoYoung, true);
  assert.equal(young.missing, false);
  const empty = maskedVerdict([null, { age: null, confidence: 0, visibleParts: [], betterAngle: "", cues: [], labeled: [], stop: null, deerPresent: "unknown", backup: false }]);
  assert.equal(empty.missing, true);
});

test("gray boxes cover the antler area and leave the body", async () => {
  const jpeg = await sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).jpeg().toBuffer();
  const covered = await coverAntlers(jpeg.toString("base64"), [[0, 0, 0.5, 0.5]]);
  const pixel = await sharp(Buffer.from(covered, "base64")).raw().toBuffer();
  assert.ok(pixel[0] > 100);
  assert.ok(pixel[pixel.length - 1] < 50);
});
