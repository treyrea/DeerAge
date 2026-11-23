import { PICTURE_CAPTIONS, guidePicture, pictureCaption } from "./offline-age-guide-art";
import type { IllustratedTraitId } from "./offline-age-guide-art";

const TRAITS: IllustratedTraitId[] = ["neck", "chest", "belly", "legs", "build"];

describe("offline age guide pictures", () => {
  it("uses a level image for 1 through 5 and the neutral image otherwise", () => {
    for (const traitId of TRAITS) {
      const neutral = guidePicture(traitId, undefined);
      expect(guidePicture(traitId, "skip")).toBe(neutral);
      for (const value of [1, 2, 3, 4, 5] as const) {
        expect(guidePicture(traitId, value)).toBeTruthy();
        expect(pictureCaption(traitId, value)).toBe(PICTURE_CAPTIONS[traitId][value]);
      }
      expect(pictureCaption(traitId, undefined)).toBeNull();
      expect(pictureCaption(traitId, "skip")).toBeNull();
    }
  });

  it("uses the approved picture captions", () => {
    expect(PICTURE_CAPTIONS.neck).toEqual({
      1: "Thin, clear dip",
      2: "Slight fullness at base",
      3: "Swollen, still distinct",
      4: "Blends into shoulders",
      5: "Neck & brisket as one",
    });
    expect(PICTURE_CAPTIONS.chest[3]).toBe("Chest as deep as legs are long");
    expect(PICTURE_CAPTIONS.belly[3]).toBe("Belly near level");
    expect(PICTURE_CAPTIONS.belly[4]).toBe("Belly near level");
    expect(PICTURE_CAPTIONS.legs[4]).toBe("Legs in proportion");
    expect(PICTURE_CAPTIONS.build[5]).toBe("Heavy front half; belly sags");
  });
});
