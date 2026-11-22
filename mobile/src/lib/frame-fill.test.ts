import {
  DEFAULT_FRAME_BODY_GOOD_HINT,
  DEFAULT_FRAME_BODY_HINT,
  FILL_MIN,
  anySubjectFillsGuide,
  bestCoverage,
  boxArea,
  coverageOfGuide,
  frameBodyGoodHintFromCopy,
  frameBodyHintFromCopy,
  guideInPreview,
  intersectionArea,
  mapImageBoxToPreview,
  subjectFillsGuide,
} from "./frame-fill";

const guide = { x: 0.1, y: 0.3, width: 0.8, height: 0.4 };

describe("frame fill geometry", () => {
  it("returns 0 intersection when boxes miss", () => {
    expect(intersectionArea(guide, { x: 0, y: 0, width: 0.05, height: 0.05 })).toBe(0);
    expect(coverageOfGuide({ x: 0, y: 0, width: 0.05, height: 0.05 }, guide)).toBe(0);
  });

  it("is green when the subject covers at least 60% of the guide", () => {
    // 80% of the guide, fully inside
    const filled = { x: 0.1, y: 0.3, width: 0.8, height: 0.32 };
    expect(coverageOfGuide(filled, guide)).toBeCloseTo(0.8);
    expect(subjectFillsGuide(filled, guide)).toBe(true);
  });

  it("stays gold when the subject is too small", () => {
    const small = { x: 0.4, y: 0.4, width: 0.2, height: 0.15 };
    expect(coverageOfGuide(small, guide)).toBeLessThan(FILL_MIN);
    expect(subjectFillsGuide(small, guide)).toBe(false);
  });

  it("stays green when the subject covers the whole guide (over 90%)", () => {
    const overflowing = { x: 0.05, y: 0.25, width: 0.9, height: 0.5 };
    expect(coverageOfGuide(overflowing, guide)).toBeCloseTo(1);
    expect(subjectFillsGuide(overflowing, guide)).toBe(true);
  });

  it("ignores a subject that sits beside the guide", () => {
    const beside = { x: 0.1, y: 0.0, width: 0.8, height: 0.2 };
    expect(subjectFillsGuide(beside, guide)).toBe(false);
  });

  it("picks the best of several subjects", () => {
    const small = { x: 0.4, y: 0.4, width: 0.1, height: 0.1 };
    const filled = { x: 0.1, y: 0.3, width: 0.8, height: 0.4 };
    expect(bestCoverage([small, filled], guide)).toBeCloseTo(1);
    expect(anySubjectFillsGuide([small], guide)).toBe(false);
    expect(anySubjectFillsGuide([small, filled], guide)).toBe(true);
  });

  it("treats empty or inverted boxes as empty", () => {
    expect(boxArea({ x: 0, y: 0, width: 0, height: 1 })).toBe(0);
    expect(coverageOfGuide({ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 0 })).toBe(0);
  });
});

describe("aspect-fill mapping", () => {
  it("is a no-op when the image already matches the preview", () => {
    const box = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
    expect(mapImageBoxToPreview(box, 1000, 1000, 1000, 1000)).toEqual(box);
  });

  it("center-crops a taller image into a wide preview", () => {
    // Image 100x200, preview 100x100: scale=1, y offset = (100-200)/2 = -50
    // A box at the vertical center of the image (y=0.25, h=0.5) → 50–150 in image px
    // after offset: 0–100 in preview, i.e. y=0, h=1
    const box = { x: 0, y: 0.25, width: 1, height: 0.5 };
    const mapped = mapImageBoxToPreview(box, 100, 200, 100, 100);
    expect(mapped.x).toBeCloseTo(0);
    expect(mapped.y).toBeCloseTo(0);
    expect(mapped.width).toBeCloseTo(1);
    expect(mapped.height).toBeCloseTo(1);
  });
});

describe("guideInPreview", () => {
  it("normalizes a window-space guide against the preview", () => {
    const preview = { x: 0, y: 0, width: 400, height: 800 };
    const guideBox = { x: 40, y: 200, width: 320, height: 280 };
    expect(guideInPreview(guideBox, preview)).toEqual({
      x: 0.1,
      y: 0.25,
      width: 0.8,
      height: 0.35,
    });
  });

  it("returns null for a zero-size preview", () => {
    expect(guideInPreview(guide, { x: 0, y: 0, width: 0, height: 10 })).toBeNull();
  });
});

describe("frame hint copy", () => {
  it("uses the built-in line when remote copy is empty", () => {
    expect(frameBodyHintFromCopy("")).toBe(DEFAULT_FRAME_BODY_HINT);
    expect(frameBodyHintFromCopy("   ")).toBe(DEFAULT_FRAME_BODY_HINT);
    expect(frameBodyHintFromCopy(undefined)).toBe(DEFAULT_FRAME_BODY_HINT);
    expect(frameBodyGoodHintFromCopy("")).toBe(DEFAULT_FRAME_BODY_GOOD_HINT);
  });

  it("uses a live remote line when one is set", () => {
    expect(frameBodyHintFromCopy("Fill the box with the deer")).toBe("Fill the box with the deer");
    expect(frameBodyGoodHintFromCopy("Nice — stay still")).toBe("Nice — stay still");
  });
});

describe("body guide box size", () => {
  it("is about 90% of screen width with a 3:2 wide shape", () => {
    const { BODY_BOX_WIDTH, BODY_BOX_ASPECT, BODY_BOX_LIFT } = require("./frame-fill");
    expect(BODY_BOX_WIDTH).toBeCloseTo(0.9);
    expect(BODY_BOX_ASPECT).toBeCloseTo(1.5);
    expect(BODY_BOX_LIFT).toBeGreaterThan(0);
    expect(BODY_BOX_LIFT).toBeLessThan(0.15);
  });
});
