import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyOverlays, findBodyBoxes, parseBodyBoxes, withOverlays } from "./body-boxes.js";
import { normalizeAging } from "./hydrogen/aging.js";
import { patchAging } from "./remote-config.js";

const reply = `Here you go:
{"neck":[0.30,0.20,0.42,0.40],"chest":[0.35,0.35,0.55,0.62],"belly":[0.5,0.5,0.75,0.66],"back":[0.4,0.25,0.8,0.35],"legs":[0.35,0.62,0.8,0.95],"face":null}`;

test("body boxes parse as fractions, drop nulls, and fix swapped corners", () => {
  const boxes = parseBodyBoxes(reply);
  assert.deepEqual(Object.keys(boxes).sort(), ["back", "belly", "chest", "legs", "neck"]);
  assert.deepEqual(parseBodyBoxes('{"neck":[0.42,0.40,0.30,0.20]}').neck, [0.3, 0.2, 0.42, 0.4]);
});

test("0 to 1000 boxes are scaled; junk, tiny and whole-photo boxes are dropped", () => {
  assert.deepEqual(parseBodyBoxes('{"chest":[350,350,550,620]}').chest, [0.35, 0.35, 0.55, 0.62]);
  assert.deepEqual(parseBodyBoxes('{"neck":[0.3,0.3,0.305,0.5],"chest":[0,0,1,1],"belly":"x","legs":[1,2,3]}'), {});
  assert.deepEqual(parseBodyBoxes("no json here"), {});
  assert.deepEqual(parseBodyBoxes("{bad json}"), {});
});

test("only the parts the reasons name are outlined, each with its reason", () => {
  const overlays = bodyOverlays(parseBodyBoxes(reply), [
    "The chest is deep and heavy.",
    "The belly sits level with the chest line with no tuck.",
  ]);
  assert.deepEqual(overlays.map((o) => o.featureId), ["chest", "belly"]);
  assert.equal(overlays[0].label, "Chest & brisket: The chest is deep and heavy");
  assert.deepEqual(overlays[0].boundingBox, { x: 35, y: 35, width: 20, height: 27 });
  assert.equal(overlays[0].confidence, 0);
});

test("when no reason names a part, every found part is outlined with its plain name", () => {
  const overlays = bodyOverlays(parseBodyBoxes(reply), ["Overall build reads mature."]);
  assert.equal(overlays.length, 5);
  assert.equal(overlays.find((o) => o.featureId === "neck")?.label, "Neck");
  assert.equal(overlays.find((o) => o.featureId === "neck")?.detail, undefined);
});

test("detail keeps the full reason when the on-photo label is shortened", () => {
  const long = "The recorded belly line is described as sagging well below the chest and nearly level with the back on a mature buck.";
  const belly = bodyOverlays(parseBodyBoxes(reply), [long]).find((overlay) => overlay.featureId === "belly");
  assert.ok(belly);
  assert.equal(belly.detail, long);
  assert.match(belly.label, /^Belly & waist: /);
  assert.ok(belly.label.endsWith("…"));
  assert.ok(belly.detail.length > belly.label.length);
});

test("withOverlays adds overlays only when there is something to draw", () => {
  const result = { ageLabel: "4.5", reasons: ["Legs look short for the deep body."] };
  const drawn = withOverlays(result, parseBodyBoxes(reply));
  assert.ok(Array.isArray(drawn.overlays));
  assert.deepEqual((drawn.overlays as Array<{ featureId: string }>).map((o) => o.featureId), ["legs"]);
  assert.equal(withOverlays(result, {}), result);
  assert.equal(drawn.ageLabel, "4.5");
});

test("a failed or throwing box call leaves no boxes and never throws", async () => {
  assert.deepEqual(await findBodyBoxes("img", async () => null), { boxes: {}, usd: 0 });
  assert.deepEqual(await findBodyBoxes("img", async () => { throw new Error("402"); }), { boxes: {}, usd: 0 });
  const found = await findBodyBoxes("img", async () => ({ role: "boxes", model: "m", text: reply, usd: 0.0017, ms: 1, promptTokens: 1, completionTokens: 1 }));
  assert.equal(found.usd, 0.0017);
  assert.equal(Object.keys(found.boxes).length, 5);
});

test("aging.bodyBoxes defaults on and can be turned off live", () => {
  assert.equal(normalizeAging(undefined).bodyBoxes, true);
  assert.equal(normalizeAging({ bodyBoxes: false }).bodyBoxes, false);
  assert.equal(patchAging(normalizeAging(undefined), { bodyBoxes: false }).bodyBoxes, false);
  assert.throws(() => patchAging(normalizeAging(undefined), { bodyBoxes: "maybe" }));
});
