import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyOverlays, findBodyBoxes, installedCue, parseBodyBoxes, withOverlays } from "./body-boxes.js";
import { normalizeAging } from "./hydrogen/aging.js";
import { hydrogenAgeBody } from "./hydrogen/result.js";
import { patchAging } from "./remote-config.js";

/** The describe-once note from the 1.0.9 result screen, plus the three lines that screen had folded into the wrong dots. */
const DESCRIBE_ONCE = [
  "- **Waist/belly depth vs chest depth:** The chest is slightly deeper than the rear flank, though the midsection is fairly full and only tapers modestly toward the waist.",
  "- **Belly line (tucked, straight, or sagging):** The belly line is tucked slightly but the midsection stays fairly full.",
  "- **Back line:** The back line is level from the withers to the hips.",
  "- **Neck vs shoulder junction, and neck thickness:** The neck meets the shoulder at a visible junction and is not swollen.",
  "- **Shoulders vs hindquarters mass:** Well-balanced overall; both the shoulders and hindquarters appear solid and filled out, with the hindquarters looking slightly fuller from this rear-quartering angle.",
  "- **Leg length vs body depth:** Tall grass hides the lower legs, so full length is not visible, but the exposed upper legs look proportionate to the depth of the torso.",
  "- **Overall build:** Sturdy, compact, and well-filled-out with smooth contours rather than sharp bony angles.",
  "- **Season cues (velvet, rut, vegetation):** Full velvet on the antlers, no extreme rut neck swelling, and green leafy foliage and tall weeds surrounding the deer.",
].join("\n");

const ALL_PARTS = `{"neck":[0.30,0.20,0.42,0.40],"chest":[0.35,0.35,0.55,0.62],"belly":[0.5,0.5,0.75,0.66],"back":[0.4,0.25,0.8,0.35],"legs":[0.35,0.62,0.8,0.95],"face":[0.32,0.10,0.48,0.28]}`;

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

test("a paragraph is one sentence per part, and the installed cue is not cut mid-sentence", () => {
  const paragraph = "Legs look longer than the chest. The belly line is straight. The back line is level.";
  const overlays = bodyOverlays(parseBodyBoxes(reply), [paragraph]);
  const chest = overlays.find((overlay) => overlay.featureId === "chest");
  const belly = overlays.find((overlay) => overlay.featureId === "belly");
  const back = overlays.find((overlay) => overlay.featureId === "back");
  assert.equal(chest?.detail, "Legs look longer than the chest.");
  assert.equal(chest?.shortCue, "Legs look longer than the chest");
  assert.equal(chest?.shortCue?.split(" ").length, 6);
  assert.equal(chest?.shortCue?.includes("The belly"), false);
  assert.equal(belly?.shortCue, "The belly line is straight");
  assert.equal(back?.shortCue, "The back line is level");
  assert.equal(installedCue(paragraph), "Legs look longer than the chest");
});

test("describe-once headings map to their own trait, without markdown or a cut parenthesis", () => {
  const overlays = bodyOverlays(parseBodyBoxes(ALL_PARTS), [DESCRIBE_ONCE]);
  const cue = (id: string) => overlays.find((overlay) => overlay.featureId === id);
  assert.deepEqual(overlays.map((overlay) => overlay.featureId), ["neck", "chest", "belly", "back", "legs"]);
  assert.match(cue("neck")?.shortCue ?? "", /neck meets the shoulder/);
  assert.equal(cue("chest")?.shortCue, "Well-balanced overall");
  assert.match(cue("belly")?.shortCue ?? "", /tucked slightly/);
  assert.match(cue("back")?.shortCue ?? "", /back line is level/);
  assert.match(cue("legs")?.shortCue ?? "", /Tall grass hides the lower legs/);
  assert.equal(cue("face"), undefined);
  assert.notEqual(cue("legs")?.shortCue, cue("belly")?.shortCue);
  assert.notEqual(cue("chest")?.shortCue, cue("back")?.shortCue);
  for (const overlay of overlays) {
    assert.equal(overlay.shortCue?.includes("**"), false);
    assert.equal(overlay.detail?.includes("**"), false);
    assert.equal(overlay.label.includes("**"), false);
    const open = (overlay.shortCue?.match(/\(/g) ?? []).length;
    const close = (overlay.shortCue?.match(/\)/g) ?? []).length;
    assert.equal(open, close);
  }
});

test("a trait the note does not mention is left off instead of borrowing another line", () => {
  const withoutNeck = DESCRIBE_ONCE.replace(/- \*\*Neck vs shoulder[\s\S]*?\n/, "");
  const overlays = bodyOverlays(parseBodyBoxes(ALL_PARTS), [withoutNeck]);
  assert.equal(overlays.some((overlay) => overlay.featureId === "neck"), false);
  assert.match(overlays.find((overlay) => overlay.featureId === "belly")?.shortCue ?? "", /tucked slightly/);
});

test("the same note is shown to the hunter without bold markers", () => {
  const body = hydrogenAgeBody({
    low: 3.5,
    high: 3.5,
    label: "3.5",
    isRange: false,
    hunterCue: "",
    reason: DESCRIBE_ONCE,
    minimum: 4.5,
  });
  const shown = [body.lookFor, ...(body.reasons as string[])].join(" ");
  assert.equal(shown.includes("**"), false);
  assert.match(String(body.lookFor), /The chest is slightly deeper than the rear flank/);
  assert.match(shown, /Well-balanced overall/);
  assert.match(shown, /Tall grass hides the lower legs/);
  assert.match(shown, /Full velvet on the antlers/);
});

test("a parenthetical heading is not the cue when the observation follows it", () => {
  assert.equal(
    installedCue("**Belly line (tucked, straight, or sagging):** The belly stays tucked."),
    "The belly stays tucked",
  );
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
