import { TRAITS } from "./offline-age-guide";
import {
  ANTLER_PATH,
  HEAD,
  NEUTRAL_LEVEL,
  VIEWBOX,
  buckPoints,
  buckSvg,
  drawingLevels,
  shapeFor,
  snoutLength,
} from "./trait-drawings";

const TRAIT_IDS = TRAITS.map((trait) => trait.id);

describe("trait drawings", () => {
  it("has one drawing for every option, and a neutral level that is one of them", () => {
    for (const trait of TRAITS) {
      const drawn = drawingLevels(trait.id).map(String).sort();
      const scored = trait.scores.map((row) => String(row.value)).sort();
      expect(drawn).toEqual(scored);
      expect(drawn).toContain(String(NEUTRAL_LEVEL[trait.id]));
    }
  });

  it("keeps the antlers, nose, and eye center identical on every level", () => {
    for (const traitId of TRAIT_IDS) {
      for (const value of drawingLevels(traitId)) {
        const points = buckPoints(shapeFor(traitId, value));
        expect(points.nose).toEqual(HEAD.nose);
        expect(points.eye).toEqual(HEAD.eye);
        const svg = buckSvg(traitId, value);
        expect(svg).toContain(ANTLER_PATH);
        expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
      }
    }
    expect(snoutLength()).toBeGreaterThan(40);
  });

  it("does not give the yearling face a shorter snout than the adult face", () => {
    const baby = shapeFor("face", 1);
    const adult = shapeFor("face", 2);
    const babyPoints = buckPoints(baby);
    const adultPoints = buckPoints(adult);
    expect(babyPoints.nose).toEqual(adultPoints.nose);
    expect(babyPoints.eye).toEqual(adultPoints.eye);
    expect(adultPoints.jaw[1]).toBeGreaterThan(babyPoints.jaw[1]);
    expect(baby.eyeRadius).toBeGreaterThan(adult.eyeRadius);
  });

  it("leaves the jaw alone on every trait except the face", () => {
    const jaws = new Set<string>();
    for (const traitId of TRAIT_IDS.filter((id) => id !== "face")) {
      for (const value of drawingLevels(traitId)) {
        const points = buckPoints(shapeFor(traitId, value));
        jaws.add(`${points.jaw[0]},${points.jaw[1]},${points.chin[1]}`);
      }
    }
    expect(jaws.size).toBe(1);
  });

  it("exaggerates each trait in one direction and keeps every hoof inside the picture", () => {
    const girth = (value: number) => shapeFor("neck", value).neckGirth;
    expect(girth(1)).toBeLessThan(girth(2));
    expect(girth(2)).toBeLessThan(girth(3));
    expect(girth(3)).toBeLessThan(girth(4));
    expect(girth(4)).toBeLessThan(girth(5));
    expect(shapeFor("neck", 1).shoulderBreak).toBeGreaterThan(shapeFor("neck", 4).shoulderBreak);
    expect(shapeFor("neck", 5).brisketJoin).toBe(1);

    const belly = (value: number) => shapeFor("belly", value).bellyDrop;
    expect(belly(1)).toBeLessThan(belly(3));
    expect(belly(3)).toBeLessThan(belly(5));

    const sag = (value: number) => shapeFor("backline", value).backSag;
    expect(sag(1)).toBeLessThan(sag(2));
    expect(sag(2)).toBeLessThan(sag(3));

    const length = (value: number) => shapeFor("legs", value).legLength;
    expect(length(1)).toBeGreaterThan(length(3));
    expect(length(3)).toBeGreaterThan(length(5));

    for (const traitId of TRAIT_IDS) {
      for (const value of drawingLevels(traitId)) {
        const points = buckPoints(shapeFor(traitId, value));
        expect(points.hoofY).toBeLessThan(VIEWBOX.height - 4);
        expect(points.hoofY).toBeGreaterThan(points.frontTop);
      }
    }
  });

  it("keeps the leg stance angle the same when the legs get shorter", () => {
    const young = buckPoints(shapeFor("legs", 1));
    const old = buckPoints(shapeFor("legs", 5));
    expect(young.frontX).toBe(old.frontX);
    expect(young.hindX).toBe(old.hindX);
    expect(young.frontLean / shapeFor("legs", 1).legLength).toBeCloseTo(old.frontLean / shapeFor("legs", 5).legLength);
  });

  it("draws the shoulder line on a thin neck and leaves it off once the neck blends", () => {
    expect(buckSvg("neck", 1)).toContain('id="shoulder-seam"');
    expect(buckSvg("neck", 3)).toContain('id="shoulder-seam"');
    expect(buckSvg("neck", 4)).not.toContain("shoulder-seam");
    expect(buckSvg("neck", 5)).not.toContain("shoulder-seam");
  });

  it("highlights the body part, and hides the lower legs without a highlight when skipped", () => {
    for (const traitId of TRAIT_IDS) {
      for (const value of drawingLevels(traitId)) {
        const svg = buckSvg(traitId, value);
        if (traitId === "legs" && value === "skip") {
          expect(svg).not.toContain("#FF6A00");
          expect(svg).toContain("stroke-dasharray");
        } else {
          expect(svg).toContain("#FF6A00");
        }
      }
    }
  });

  it("makes neighboring levels look different", () => {
    for (const traitId of TRAIT_IDS) {
      const levels = drawingLevels(traitId);
      const svgs = levels.map((value) => buckSvg(traitId, value));
      const unique = new Set(svgs);
      expect(unique.size).toBe(levels.length);
    }
  });

  it("uses the neutral drawing before a level is chosen", () => {
    expect(buckSvg("neck", undefined)).toBe(buckSvg("neck", NEUTRAL_LEVEL.neck));
    expect(buckSvg("face", undefined)).toBe(buckSvg("face", NEUTRAL_LEVEL.face));
    expect(buckSvg("backline", undefined)).toBe(buckSvg("backline", NEUTRAL_LEVEL.backline));
  });
});
