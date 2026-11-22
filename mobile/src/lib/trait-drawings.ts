/**
 * Side-view whitetail for the offline aging guide.
 *
 * Change the numbers in TRAIT_LEVELS to tweak a level. The outline is built
 * from those numbers. Do not hand-edit the generated paths.
 *
 * Identical on every level, so age cannot be read from them:
 * - antlers (ANTLER_PATH)
 * - nose, bridge, forehead, poll, and eye center. The face trait may deepen
 *   the jaw only. It never shortens the snout. A short snout is a fawn trait.
 * - leg angles (lean scales with length, so the stance stays the same)
 *
 * Within a trait, only that trait's parameters should change. Overall build
 * is the exception: the torso changes together, and the head and antlers do not.
 */

import type { ScoreValue, TraitId } from "./offline-age-guide";

export const GUIDE_PALETTE = {
  /** Existing screen background. */
  screen: "#2B3420",
  /** Existing trait card. */
  card: "#3D4A2F",
  /** Existing deepest green, used as the picture well. */
  picture: "#1A1F16",
  /** Existing cream. */
  cream: "#F5F5DC",
  /** Existing body text. */
  creamMuted: "#E5D4B8",
  /** Existing gold. */
  gold: "#D4AF37",
  /** Existing unselected option. */
  button: "#5A6447",
  /** Blaze orange. Not a theme color; the highlight has to read in low light. */
  highlight: "#FF6A00",
} as const;

/** Tall enough for the longest legs. Every level uses this box, so scale stays fixed. */
export const VIEWBOX = { width: 420, height: 330 } as const;

/** Neutral leg length. Lean is scaled against this so the stance angle stays put. */
const NEUTRAL_LEG = 72;

/**
 * Level shown before the hunter taps. The middle option of each trait.
 * Face has two options; 2 is the ordinary adult face, not the yearling.
 */
export const NEUTRAL_LEVEL: Record<TraitId, ScoreValue> = {
  neck: 3,
  chest: 3,
  backline: 2,
  belly: 3,
  legs: 3,
  face: 2,
  build: 3,
};

/**
 * Fixed head landmarks. Nose and eye center never move, on the face trait or
 * any other. Jaw depth is a separate parameter.
 */
export const HEAD = {
  nose: [34, 108] as [number, number],
  noseTop: [46, 98] as [number, number],
  bridge: [72, 86] as [number, number],
  forehead: [104, 70] as [number, number],
  poll: [128, 62] as [number, number],
  /** Tip of the ear. Part of the outline, so it cannot turn into a separate loop. */
  earTip: [156, 30] as [number, number],
  earBack: [146, 78] as [number, number],
  nape: [138, 90] as [number, number],
  eye: [108, 90] as [number, number],
};

export const SNOUT = { nose: HEAD.nose, eye: HEAD.eye };

/** Moderate rack, rooted at the poll. The same path is drawn on every level. */
export const ANTLER_PATH = [
  "M 126,58",
  "C 118,42 106,30 92,24",
  "M 112,44",
  "C 98,42 84,46 72,54",
  "M 102,32",
  "C 92,22 84,12 80,6",
  "M 94,26",
  "C 88,16 90,8 98,4",
  "M 134,56",
  "C 146,40 160,28 156,16",
  "M 148,42",
  "C 162,38 174,42 182,50",
  "M 156,28",
  "C 166,18 174,10 168,4",
].join(" ");

type Pt = [number, number];

export type HighlightRegion = "neck" | "chest" | "back" | "belly" | "legs" | "face" | "build";

/**
 * Every number that can change between levels. Units are viewBox pixels
 * except the 0–1 blends (shoulderBreak, brisketJoin).
 */
export type BuckShape = {
  /** Thickness of the neck column. About 12 is a thin yearling neck. About 50 merges into the brisket. */
  neckGirth: number;
  /** 1 draws a clean break where the neck meets the shoulder. 0 leaves no line. */
  shoulderBreak: number;
  /** 0 keeps the brisket separate. 1 makes the neck and brisket one mass. */
  brisketJoin: number;
  /** Depth of the chest below the withers. */
  chestDrop: number;
  /** Belly relative to the chest bottom. Negative tucks up. Positive hangs below. */
  bellyDrop: number;
  /** Extra lift of the flank just in front of the hind leg. */
  flankLift: number;
  /** Sag of the topline behind the shoulders. 0 is straight. */
  backSag: number;
  /** Extra drop of the hips, so the shoulders look taller. */
  hipDrop: number;
  /** Distance from the body to the hooves. */
  legLength: number;
  legWidth: number;
  /** Added depth of the jaw. Does not move the nose or the eye. */
  jawDepth: number;
  /** Added depth under the muzzle. Does not move the nose tip. */
  cheekDepth: number;
  eyeRadius: number;
  highlight: HighlightRegion;
  /** Legs option "Skip": lower legs are not drawn and are not highlighted. */
  hideLowerLegs: boolean;
};

const NEUTRAL_SHAPE: BuckShape = {
  neckGirth: 26,
  shoulderBreak: 0.7,
  brisketJoin: 0,
  chestDrop: 62,
  bellyDrop: -16,
  flankLift: 6,
  backSag: 0,
  hipDrop: 0,
  legLength: NEUTRAL_LEG,
  legWidth: 11,
  jawDepth: 2,
  cheekDepth: 2,
  eyeRadius: 3.3,
  highlight: "build",
  hideLowerLegs: false,
};

type ShapePatch = Partial<Omit<BuckShape, "highlight" | "hideLowerLegs">> & { hideLowerLegs?: boolean };

/**
 * One patch per option value. Unlisted fields stay at NEUTRAL_SHAPE, so a neck
 * level does not also change the belly, the legs, or the rack.
 */
export const TRAIT_LEVELS: Record<TraitId, Record<string, ShapePatch>> = {
  neck: {
    // 1.5 thin, no swelling. Clean break at the shoulder.
    "1": { neckGirth: 10, shoulderBreak: 1, brisketJoin: 0 },
    // 2.5 slight swelling, still clearly separate.
    "2": { neckGirth: 20, shoulderBreak: 0.92, brisketJoin: 0 },
    // 3.5 swollen, junction still visible.
    "3": { neckGirth: 32, shoulderBreak: 0.78, brisketJoin: 0 },
    // 4.5 blends into the shoulders. No line.
    "4": { neckGirth: 44, shoulderBreak: 0, brisketJoin: 0.18 },
    // 5.5+ neck and brisket are one mass.
    "5": { neckGirth: 52, shoulderBreak: 0, brisketJoin: 1 },
  },
  chest: {
    // 1.5 slim, doe-like, little muscle. Belly stays up so the slim chest does not read as a pot belly.
    "1": { chestDrop: 28, bellyDrop: -4, flankLift: 2 },
    // 2.5 shoulders filling out, chest still slim.
    "2": { chestDrop: 42, bellyDrop: -8, flankLift: 4 },
    // 3.5 deep chest, lean waist.
    "3": { chestDrop: 74, bellyDrop: -34, flankLift: 8 },
    // 4.5 waist as deep as the chest.
    "4": { chestDrop: 66, bellyDrop: 0, flankLift: 0 },
    // 5.5+ front half is one large mass.
    "5": { chestDrop: 78, bellyDrop: 4, flankLift: 0, neckGirth: 46, shoulderBreak: 0, brisketJoin: 1 },
  },
  backline: {
    // Through 4.5: straight and taut.
    "1": { backSag: 0, hipDrop: 0 },
    // 5.5+ sagging behind the shoulders.
    "2": { backSag: 26, hipDrop: 10 },
    // 6.5+ swayed. Shoulders look taller than the hips.
    "3": { backSag: 46, hipDrop: 24 },
  },
  belly: {
    // 1.5 belly tucked up, high flank.
    "1": { bellyDrop: -40, flankLift: 18, chestDrop: 56 },
    // 2.5 waist still thin in front of the hind legs.
    "2": { bellyDrop: -26, flankLift: 14, chestDrop: 58 },
    // 3.5 lean waist, chest deeper than the belly.
    "3": { bellyDrop: -14, flankLift: 5, chestDrop: 72 },
    // 4.5 full, level with the chest, not sagging.
    "4": { bellyDrop: 0, flankLift: 0, chestDrop: 64 },
    // 5.5+ hangs below the chest line.
    "5": { bellyDrop: 28, flankLift: -6, chestDrop: 58 },
  },
  legs: {
    // Body stays the neutral torso. Only length and thickness change.
    "1": { legLength: 108, legWidth: 7 },
    "2": { legLength: 92, legWidth: 9 },
    "3": { legLength: 72, legWidth: 11 },
    "4": { legLength: 56, legWidth: 15 },
    "5": { legLength: 40, legWidth: 20 },
    // Lower legs hidden. Same neutral length, cut off, no highlight.
    skip: { legLength: 72, legWidth: 11, hideLowerLegs: true },
  },
  face: {
    // 1.5 dainty. Larger eye, finer jaw. Snout length is unchanged.
    "1": { jawDepth: -5, cheekDepth: -5, eyeRadius: 5.6 },
    // Anything else. Heavier jaw, same nose and same eye center.
    "2": { jawDepth: 16, cheekDepth: 8, eyeRadius: 2.8 },
  },
  build: {
    // 1.5 doe with antlers. Slim, dainty, little muscle.
    "1": {
      neckGirth: 12,
      shoulderBreak: 1,
      brisketJoin: 0,
      chestDrop: 30,
      bellyDrop: -24,
      flankLift: 14,
      backSag: 0,
      hipDrop: 0,
      legLength: 104,
      legWidth: 7,
    },
    // 2.5 sleek and lanky. Bigger than a yearling, not filled out.
    "2": {
      neckGirth: 18,
      shoulderBreak: 0.88,
      brisketJoin: 0,
      chestDrop: 44,
      bellyDrop: -18,
      flankLift: 10,
      backSag: 0,
      hipDrop: 0,
      legLength: 90,
      legWidth: 9,
    },
    // 3.5 racehorse. Deep chest, lean waist.
    "3": {
      neckGirth: 30,
      shoulderBreak: 0.7,
      brisketJoin: 0,
      chestDrop: 76,
      bellyDrop: -36,
      flankLift: 8,
      backSag: 0,
      hipDrop: 0,
      legLength: 72,
      legWidth: 11,
    },
    // 4.5 full-bodied. Lost the racehorse look.
    "4": {
      neckGirth: 40,
      shoulderBreak: 0,
      brisketJoin: 0.25,
      chestDrop: 66,
      bellyDrop: 0,
      flankLift: 0,
      backSag: 4,
      hipDrop: 2,
      legLength: 58,
      legWidth: 14,
    },
    // 5.5+ rounded, heavy, the "small cow" look.
    "5": {
      neckGirth: 48,
      shoulderBreak: 0,
      brisketJoin: 1,
      chestDrop: 74,
      bellyDrop: 32,
      flankLift: -8,
      backSag: 20,
      hipDrop: 12,
      legLength: 46,
      legWidth: 18,
    },
  },
};

const HIGHLIGHT_FOR: Record<TraitId, HighlightRegion> = {
  neck: "neck",
  chest: "chest",
  backline: "back",
  belly: "belly",
  legs: "legs",
  face: "face",
  build: "build",
};

export function drawingLevels(traitId: TraitId): ScoreValue[] {
  return Object.keys(TRAIT_LEVELS[traitId]).map((key) => (key === "skip" ? "skip" : Number(key)));
}

export function shapeFor(traitId: TraitId, value: ScoreValue | undefined): BuckShape {
  const level: ScoreValue = value == null ? NEUTRAL_LEVEL[traitId] : value;
  const patch = TRAIT_LEVELS[traitId][String(level)];
  if (!patch) {
    throw new Error(`No drawing for ${traitId} ${String(level)}`);
  }
  return {
    ...NEUTRAL_SHAPE,
    ...patch,
    highlight: HIGHLIGHT_FOR[traitId],
    hideLowerLegs: patch.hideLowerLegs ?? false,
  };
}

export type BuckPoints = {
  outline: Pt[];
  nose: Pt;
  eye: Pt;
  nape: Pt;
  crest: Pt;
  shoulderNotch: Pt;
  withers: Pt;
  midBack: Pt;
  hip: Pt;
  rump: Pt;
  ham: Pt;
  groin: Pt;
  belly: Pt;
  chest: Pt;
  brisket: Pt;
  throat: Pt;
  jaw: Pt;
  chin: Pt;
  frontX: number;
  hindX: number;
  frontTop: number;
  hindTop: number;
  hoofY: number;
  /** Hoof offset of the near front leg. Divided by leg length, this is the stance angle. */
  frontLean: number;
  seam: number;
};

const FRONT_NEAR = { x: 180, lean: -6 };
const HIND_NEAR = { x: 304, lean: 8 };

const WITHERS_Y = 104;
const WITHERS_X = 210;

export function buckPoints(shape: BuckShape): BuckPoints {
  const chestY = 150 + shape.chestDrop;
  const bellyY = chestY + shape.bellyDrop;
  const rearDrop = shape.hipDrop * 0.65 + shape.backSag * 0.12;
  const groinY = bellyY - shape.flankLift + rearDrop * 0.25;
  const midBackY = WITHERS_Y + shape.backSag;
  const hipY = WITHERS_Y + 8 + shape.hipDrop + shape.backSag * 0.18;
  const rumpY = hipY + 26;
  const hamY = Math.max(hipY + 44, groinY + 4);
  const seam = shape.shoulderBreak * (1 - shape.brisketJoin);
  const crestY = WITHERS_Y - Math.max(0, shape.neckGirth - 14) * 0.55;
  const throatY0 = WITHERS_Y + shape.neckGirth * 1.25;
  const throatY = throatY0 + shape.brisketJoin * (chestY - 8 - throatY0) * 0.78;

  const nose: Pt = [HEAD.nose[0], HEAD.nose[1]];
  const eye: Pt = [HEAD.eye[0], HEAD.eye[1]];
  const nape: Pt = [HEAD.nape[0], HEAD.nape[1]];
  const crest: Pt = [174, round(crestY)];
  const shoulderNotch: Pt = [196, round(WITHERS_Y + seam * 14)];
  const withers: Pt = [WITHERS_X, WITHERS_Y];
  const midBack: Pt = [264, round(midBackY)];
  const hip: Pt = [320, round(hipY)];
  const rump: Pt = [358, round(rumpY)];
  const ham: Pt = [342, round(hamY)];
  const groin: Pt = [298, round(groinY)];
  const belly: Pt = [244, round(bellyY)];
  const chest: Pt = [190, round(chestY)];
  const brisket: Pt = [round(166 - shape.brisketJoin * 14), round(chestY - 16 + shape.brisketJoin * 12)];
  const throat: Pt = [round(156 - shape.neckGirth * 0.2 - shape.brisketJoin * 8), round(throatY)];
  const jaw: Pt = [116, round(126 + shape.jawDepth + shape.cheekDepth * 0.2)];
  const chin: Pt = [72, round(120 + shape.cheekDepth)];

  const outline: Pt[] = [
    nose,
    [HEAD.noseTop[0], HEAD.noseTop[1]],
    [HEAD.bridge[0], HEAD.bridge[1]],
    [HEAD.forehead[0], HEAD.forehead[1]],
    [HEAD.poll[0], HEAD.poll[1]],
    [HEAD.earTip[0], HEAD.earTip[1]],
    [HEAD.earBack[0], HEAD.earBack[1]],
    nape,
    crest,
    shoulderNotch,
    withers,
    midBack,
    hip,
    rump,
    ham,
    groin,
    belly,
    chest,
    brisket,
    throat,
    jaw,
    chin,
  ];
  if (seam > 0.75) outline.splice(9, 0, shoulderNotch);

  const frontTop = chest[1] - 4;
  const hindTop = groin[1] - 2;
  const hoofY = Math.max(frontTop, hindTop) + shape.legLength;
  const frontLean = FRONT_NEAR.lean * (shape.legLength / NEUTRAL_LEG);

  return {
    outline,
    nose,
    eye,
    nape,
    crest,
    shoulderNotch,
    withers,
    midBack,
    hip,
    rump,
    ham,
    groin,
    belly,
    chest,
    brisket,
    throat,
    jaw,
    chin,
    frontX: FRONT_NEAR.x,
    hindX: HIND_NEAR.x,
    frontTop,
    hindTop,
    hoofY,
    frontLean,
    seam,
  };
}

export function snoutLength(): number {
  const dx = SNOUT.nose[0] - SNOUT.eye[0];
  const dy = SNOUT.nose[1] - SNOUT.eye[1];
  return Math.hypot(dx, dy);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Lower tension keeps the outline on the points instead of ballooning between them. */
const TENSION = 0.14;

function closedCurve(points: Pt[]): string {
  const n = points.length;
  const at = (index: number) => points[(index + n) % n];
  let d = `M ${num(points[0][0])} ${num(points[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const b1x = p1[0] + (p2[0] - p0[0]) * TENSION;
    const b1y = p1[1] + (p2[1] - p0[1]) * TENSION;
    const b2x = p2[0] - (p3[0] - p1[0]) * TENSION;
    const b2y = p2[1] - (p3[1] - p1[1]) * TENSION;
    d += ` C ${num(b1x)} ${num(b1y)} ${num(b2x)} ${num(b2y)} ${num(p2[0])} ${num(p2[1])}`;
  }
  return `${d} Z`;
}

function openCurve(points: Pt[]): string {
  if (points.length < 2) return "";
  const padded = [points[0], ...points, points[points.length - 1]];
  let d = `M ${num(points[0][0])} ${num(points[0][1])}`;
  for (let i = 1; i < padded.length - 2; i += 1) {
    const p0 = padded[i - 1];
    const p1 = padded[i];
    const p2 = padded[i + 1];
    const p3 = padded[i + 2];
    const b1x = p1[0] + (p2[0] - p0[0]) * TENSION;
    const b1y = p1[1] + (p2[1] - p0[1]) * TENSION;
    const b2x = p2[0] - (p3[0] - p1[0]) * TENSION;
    const b2y = p2[1] - (p3[1] - p1[1]) * TENSION;
    d += ` C ${num(b1x)} ${num(b1y)} ${num(b2x)} ${num(b2y)} ${num(p2[0])} ${num(p2[1])}`;
  }
  return d;
}

function num(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

type Mark = { kind: "fill"; d: string } | { kind: "band"; d: string; width: number };

function highlightMark(shape: BuckShape, pts: BuckPoints): Mark | null {
  if (shape.hideLowerLegs) return null;
  const {
    nape,
    crest,
    shoulderNotch,
    withers,
    midBack,
    hip,
    rump,
    ham,
    groin,
    belly,
    chest,
    brisket,
    throat,
    jaw,
    chin,
    nose,
  } = pts;
  if (shape.highlight === "neck") {
    const mass = shape.brisketJoin > 0.55 ? [brisket, chest] : [];
    return { kind: "fill", d: closedCurve([nape, crest, shoulderNotch, withers, ...mass, throat]) };
  }
  if (shape.highlight === "chest") {
    const upper = shape.brisketJoin > 0.55 ? [nape, crest, shoulderNotch, withers] : [shoulderNotch, withers];
    return { kind: "fill", d: closedCurve([...upper, chest, belly, brisket, throat]) };
  }
  if (shape.highlight === "back") {
    return { kind: "band", d: openCurve([crest, shoulderNotch, withers, midBack, hip, rump]), width: 28 };
  }
  if (shape.highlight === "belly") {
    const lift = (point: Pt, dy: number): Pt => [point[0], point[1] - dy];
    return { kind: "fill", d: closedCurve([groin, belly, chest, lift(chest, 18), lift(belly, 20), lift(groin, 12)]) };
  }
  if (shape.highlight === "face") {
    return {
      kind: "fill",
      d: closedCurve([
        nose,
        [HEAD.noseTop[0], HEAD.noseTop[1]],
        [HEAD.bridge[0], HEAD.bridge[1]],
        [HEAD.forehead[0], HEAD.forehead[1]],
        [HEAD.poll[0], HEAD.poll[1]],
        nape,
        jaw,
        chin,
      ]),
    };
  }
  if (shape.highlight === "build") {
    return {
      kind: "fill",
      d: closedCurve([
        nape,
        crest,
        shoulderNotch,
        withers,
        midBack,
        hip,
        rump,
        ham,
        groin,
        belly,
        chest,
        brisket,
        throat,
      ]),
    };
  }
  return null;
}

const FAR_LEGS = [
  { x: 198, lean: 8 },
  { x: 286, lean: -5 },
];
const NEAR_LEGS = [FRONT_NEAR, HIND_NEAR];

/** Pointed top, so the body line meets the leg instead of cutting across it. */
function legPath(x: number, top: number, hoof: number, width: number, lean: number, partial: boolean): string {
  const span = Math.max(hoof - top, 1);
  const endY = partial ? top + span * 0.4 : hoof;
  const endLean = lean * ((endY - top) / span);
  const kneeY = top + (endY - top) * 0.55;
  const kneeX = x + endLean * 0.18;
  const endX = x + endLean;
  const w = width * 0.42;
  if (partial) {
    return [
      `M ${num(x)} ${num(top)}`,
      `Q ${num(kneeX - w)} ${num(kneeY)} ${num(endX - w * 0.75)} ${num(endY)}`,
      `L ${num(endX + w * 0.75)} ${num(endY)}`,
      `Q ${num(kneeX + w)} ${num(kneeY)} ${num(x)} ${num(top)} Z`,
    ].join(" ");
  }
  const hoofBack = endY - Math.min(8, span * 0.1);
  const hoofW = width * 0.62;
  return [
    `M ${num(x)} ${num(top)}`,
    `Q ${num(kneeX - w)} ${num(kneeY)} ${num(endX - w * 0.65)} ${num(hoofBack)}`,
    `L ${num(endX - hoofW)} ${num(endY)}`,
    `L ${num(endX + hoofW)} ${num(endY)}`,
    `L ${num(endX + w * 0.65)} ${num(hoofBack)}`,
    `Q ${num(kneeX + w)} ${num(kneeY)} ${num(x)} ${num(top)} Z`,
  ].join(" ");
}

function tailPath(rump: Pt): string {
  const [x, y] = rump;
  return `M ${num(x - 4)} ${num(y + 4)} C ${num(x + 14)} ${num(y - 10)} ${num(x + 18)} ${num(y + 12)} ${num(x)} ${num(y + 20)}`;
}

function seamPath(pts: BuckPoints): string | null {
  if (pts.seam <= 0.45) return null;
  const [x, y] = pts.shoulderNotch;
  const x2 = x - pts.seam * 4;
  const y2 = y + 16 + pts.seam * 12;
  return `M ${num(x + 2)} ${num(y + 2)} L ${num(x2)} ${num(y2)}`;
}

export function buckSvg(traitId: TraitId, value: ScoreValue | undefined, layer = "a"): string {
  const { body } = renderBuck(traitId, value, layer);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}">${body}</svg>`;
}

export function renderBuck(
  traitId: TraitId,
  value: ScoreValue | undefined,
  layer = "a",
): { body: string; viewBox: string } {
  const shape = shapeFor(traitId, value);
  const pts = buckPoints(shape);
  const level = String(value == null ? NEUTRAL_LEVEL[traitId] : value);
  const clip = `buck-${traitId}-${level}-${layer}`;
  const torso = closedCurve(pts.outline);
  const cream = GUIDE_PALETTE.cream;
  const orange = GUIDE_PALETTE.highlight;
  const picture = GUIDE_PALETTE.picture;
  const parts: string[] = [];
  parts.push(`<rect width="${VIEWBOX.width}" height="${VIEWBOX.height}" fill="${picture}"/>`);
  parts.push(`<defs><clipPath id="${clip}"><path d="${torso}"/></clipPath></defs>`);

  const mark = highlightMark(shape, pts);
  if (mark) {
    const painted =
      mark.kind === "fill"
        ? `<path d="${mark.d}" fill="${orange}"/>`
        : `<path d="${mark.d}" fill="none" stroke="${orange}" stroke-width="${mark.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    parts.push(`<g clip-path="url(#${clip})">${painted}</g>`);
  }

  const legs = [
    ...FAR_LEGS.map((leg) => ({ ...leg, width: shape.legWidth * 0.78 })),
    ...NEAR_LEGS.map((leg) => ({ ...leg, width: shape.legWidth })),
  ];
  for (const leg of legs) {
    const top = leg.x < 240 ? pts.frontTop : pts.hindTop;
    const lean = leg.lean * (shape.legLength / NEUTRAL_LEG);
    const d = legPath(leg.x, top, pts.hoofY, leg.width, lean, shape.hideLowerLegs);
    const fill = shape.highlight === "legs" && !shape.hideLowerLegs ? orange : "none";
    const dash = shape.hideLowerLegs ? ` stroke-dasharray="5 4"` : "";
    parts.push(`<path d="${d}" fill="${fill}" stroke="${cream}" stroke-width="2.2" stroke-linejoin="round"${dash}/>`);
  }

  parts.push(
    `<path d="${torso}" fill="none" stroke="${cream}" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round"/>`,
  );
  const seam = seamPath(pts);
  if (seam) {
    parts.push(
      `<path id="shoulder-seam" d="${seam}" fill="none" stroke="${cream}" stroke-width="3" stroke-linecap="round"/>`,
    );
  }
  parts.push(
    `<path d="${tailPath(pts.rump)}" fill="none" stroke="${cream}" stroke-width="2.5" stroke-linecap="round"/>`,
  );
  parts.push(
    `<circle cx="${num(pts.eye[0])}" cy="${num(pts.eye[1])}" r="${num(shape.eyeRadius)}" fill="${picture}" stroke="${cream}" stroke-width="1.8"/>`,
  );
  parts.push(
    `<ellipse cx="${num(HEAD.nose[0] + 6)}" cy="${num(HEAD.nose[1] - 4)}" rx="2.6" ry="1.6" fill="${picture}" stroke="${cream}" stroke-width="1.2"/>`,
  );
  parts.push(
    `<path d="${ANTLER_PATH}" fill="none" stroke="${cream}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  return { body: parts.join(""), viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}` };
}
