import { countingBoxSize, fittedPhotoHeight } from "./photo-fit";

describe("fittedPhotoHeight", () => {
  it("uses the photo's own shape for a wide photo", () => {
    expect(fittedPhotoHeight(345, 4 / 3, 440, 250)).toBe(259);
  });

  it("caps a tall photo at the max height", () => {
    expect(fittedPhotoHeight(345, 3 / 4, 440, 250)).toBe(440);
  });

  it("falls back before the photo size or frame width is known", () => {
    expect(fittedPhotoHeight(345, null, 440, 250)).toBe(250);
    expect(fittedPhotoHeight(0, 1.5, 440, 250)).toBe(250);
    expect(fittedPhotoHeight(345, Number.NaN, 440, 250)).toBe(250);
  });
});

describe("countingBoxSize", () => {
  it("shrinks to fit a narrow screen so no edge is clipped", () => {
    expect(countingBoxSize(327, 350)).toBe(327);
  });

  it("never grows past the max", () => {
    expect(countingBoxSize(400, 350)).toBe(350);
    expect(countingBoxSize(0, 350)).toBe(350);
  });
});
