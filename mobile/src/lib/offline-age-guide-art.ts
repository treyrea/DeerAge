/**
 * Raster drawings for the offline aging guide.
 * Static requires so the pictures ship in the app bundle and work offline.
 * neutral.webp is the same deer with no orange highlight.
 */

import type { ScoreValue } from "./offline-age-guide";

/** Baked into the WebP files. The picture well uses this so contain does not show a box. */
export const PICTURE_WELL = "#193723";

export type IllustratedTraitId = "neck" | "chest" | "belly" | "legs" | "build";

const NEUTRAL = require("../../assets/offline-age-guide/neutral.webp") as number;

const LEVELS = {
  neck: {
    1: require("../../assets/offline-age-guide/neck-1.webp") as number,
    2: require("../../assets/offline-age-guide/neck-2.webp") as number,
    3: require("../../assets/offline-age-guide/neck-3.webp") as number,
    4: require("../../assets/offline-age-guide/neck-4.webp") as number,
    5: require("../../assets/offline-age-guide/neck-5.webp") as number,
  },
  chest: {
    1: require("../../assets/offline-age-guide/chest-1.webp") as number,
    2: require("../../assets/offline-age-guide/chest-2.webp") as number,
    3: require("../../assets/offline-age-guide/chest-3.webp") as number,
    4: require("../../assets/offline-age-guide/chest-4.webp") as number,
    5: require("../../assets/offline-age-guide/chest-5.webp") as number,
  },
  belly: {
    1: require("../../assets/offline-age-guide/belly-1.webp") as number,
    2: require("../../assets/offline-age-guide/belly-2.webp") as number,
    3: require("../../assets/offline-age-guide/belly-3.webp") as number,
    4: require("../../assets/offline-age-guide/belly-4.webp") as number,
    5: require("../../assets/offline-age-guide/belly-5.webp") as number,
  },
  legs: {
    1: require("../../assets/offline-age-guide/legs-1.webp") as number,
    2: require("../../assets/offline-age-guide/legs-2.webp") as number,
    3: require("../../assets/offline-age-guide/legs-3.webp") as number,
    4: require("../../assets/offline-age-guide/legs-4.webp") as number,
    5: require("../../assets/offline-age-guide/legs-5.webp") as number,
  },
  build: {
    1: require("../../assets/offline-age-guide/build-1.webp") as number,
    2: require("../../assets/offline-age-guide/build-2.webp") as number,
    3: require("../../assets/offline-age-guide/build-3.webp") as number,
    4: require("../../assets/offline-age-guide/build-4.webp") as number,
    5: require("../../assets/offline-age-guide/build-5.webp") as number,
  },
} as const;

export const PICTURE_CAPTIONS: Record<IllustratedTraitId, Record<1 | 2 | 3 | 4 | 5, string>> = {
  neck: {
    1: "Thin, clear dip",
    2: "Slight fullness at base",
    3: "Swollen, still distinct",
    4: "Blends into shoulders",
    5: "Neck & brisket as one",
  },
  chest: {
    1: "Shallow chest, long legs",
    2: "Chest deepening",
    3: "Chest as deep as legs are long",
    4: "Deep chest, brisket at elbow",
    5: "Brisket hangs low, legs look short",
  },
  belly: {
    1: "High, tucked-up flank",
    2: "Flank filling in",
    3: "Belly near level",
    4: "Belly near level",
    5: "Belly often sags",
  },
  legs: {
    1: "Legs look long",
    2: "Legs still look long",
    3: "Legs in proportion",
    4: "Legs in proportion",
    5: "Legs look short for body",
  },
  build: {
    1: "Slim, leggy body",
    2: "Lanky; chest filling in",
    3: "Racehorse: deep chest, lean waist",
    4: "Filled out, muscled throughout",
    5: "Heavy front half; belly sags",
  },
};

export function guidePicture(traitId: IllustratedTraitId, value: ScoreValue | undefined): number {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return LEVELS[traitId][value];
  }
  return NEUTRAL;
}

export function pictureCaption(traitId: IllustratedTraitId, value: ScoreValue | undefined): string | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return PICTURE_CAPTIONS[traitId][value];
  }
  return null;
}
