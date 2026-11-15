export interface TineSide {
  g1?: number;
  g2?: number;
  g3?: number;
  g4?: number;
  g5?: number;
  g6?: number;
}

export interface MassSide {
  h1?: number;
  h2?: number;
  h3?: number;
  h4?: number;
}

export interface RackEstimate {
  isValidDeer: boolean;
  invalidReason?: string;
  beams: { left: number; right: number };
  tines: { left: TineSide; right: TineSide };
  mass: { left: MassSide; right: MassSide };
  abnormal: Array<{ side: "left" | "right"; length: number }>;
  insideSpread: number;
  pointEnumeration: string;
  confidence: "Low" | "Med" | "High";
  ageYears: number;
  topCues: string[];
  scale: ScaleEstimate;
  grossScore: number;
  netScore: number;
  category: "Typical" | "Non-Typical";
}

export interface ScaleEstimate {
  pixelsPerInch: number;
  noseToEyeInches: number | null;
  earSpreadInches: number | null;
  method: "skull-landmark" | "ear-spread" | "hybrid" | "unknown";
  confidence: "Low" | "Med" | "High";
  note: string;
}

const TINE_KEYS = ["g1", "g2", "g3", "g4", "g5", "g6"] as const;
const MASS_KEYS = ["h1", "h2", "h3", "h4"] as const;

export function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 8) / 8;
}

function side(value: unknown, keys: readonly string[]): Record<string, number> {
  const source = (value ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of keys) {
    const n = num(source[key]);
    if (n > 0) out[key] = n;
  }
  return out;
}

export function sumSide(sideValues: Record<string, number>, keys: readonly string[]): number {
  return keys.reduce((total, key) => total + (sideValues[key] ?? 0), 0);
}

export function scoreRack(raw: Record<string, unknown>): RackEstimate {
  const beams = {
    left: num((raw.beams as Record<string, unknown> | undefined)?.left),
    right: num((raw.beams as Record<string, unknown> | undefined)?.right),
  };
  const tines = {
    left: side((raw.tines as Record<string, unknown> | undefined)?.left, TINE_KEYS) as TineSide,
    right: side((raw.tines as Record<string, unknown> | undefined)?.right, TINE_KEYS) as TineSide,
  };
  const mass = {
    left: side((raw.mass as Record<string, unknown> | undefined)?.left, MASS_KEYS) as MassSide,
    right: side((raw.mass as Record<string, unknown> | undefined)?.right, MASS_KEYS) as MassSide,
  };
  const abnormalRaw = Array.isArray(raw.abnormal) ? raw.abnormal : [];
  const abnormal = abnormalRaw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const length = num(row.length);
      const which = row.side === "right" ? "right" : "left";
      return { side: which as "left" | "right", length };
    })
    .filter((item) => item.length > 0);

  const insideSpread = num(raw.insideSpread);
  const longestBeam = Math.max(beams.left, beams.right);
  const spreadCredit = longestBeam > 0 ? Math.min(insideSpread, longestBeam) : insideSpread;
  const tineTotal =
    sumSide(tines.left as Record<string, number>, TINE_KEYS) +
    sumSide(tines.right as Record<string, number>, TINE_KEYS);
  const massTotal =
    sumSide(mass.left as Record<string, number>, MASS_KEYS) +
    sumSide(mass.right as Record<string, number>, MASS_KEYS);
  const grossTypical = num(beams.left + beams.right + tineTotal + massTotal + spreadCredit);
  const abnormalTotal = abnormal.reduce((total, point) => total + point.length, 0);
  const paired = (left: number, right: number) => Math.abs(left - right);
  let symmetry = paired(beams.left, beams.right);
  for (const key of TINE_KEYS) {
    symmetry += paired((tines.left as Record<string, number>)[key] ?? 0, (tines.right as Record<string, number>)[key] ?? 0);
  }
  for (const key of MASS_KEYS) {
    symmetry += paired((mass.left as Record<string, number>)[key] ?? 0, (mass.right as Record<string, number>)[key] ?? 0);
  }
  const category = abnormalTotal > 10 ? "Non-Typical" : "Typical";
  const grossRaw = num(category === "Non-Typical" ? grossTypical + abnormalTotal : grossTypical);
  const netRaw = num(Math.max(0, grossRaw - symmetry));
  const grossScore = calibrateInches(grossRaw);
  const netScore = calibrateInches(netRaw);
  const confidence = raw.confidence === "High" || raw.confidence === "Low" ? raw.confidence : "Med";

  return {
    isValidDeer: raw.isValidDeer !== false,
    invalidReason: typeof raw.invalidReason === "string" ? raw.invalidReason : undefined,
    beams,
    tines,
    mass,
    abnormal,
    insideSpread,
    pointEnumeration: typeof raw.pointEnumeration === "string" ? raw.pointEnumeration : "",
    confidence,
    ageYears: num(raw.ageYears),
    topCues: Array.isArray(raw.topCues) ? raw.topCues.filter((cue): cue is string => typeof cue === "string").slice(0, 3) : [],
    scale: readScale(raw.scale),
    grossScore,
    netScore,
    category,
  };
}

/**
 * Optional inches multiplier. Default is 1.
 * The public eval set is not a fitting sample; leave this at 1 unless a separate check justifies a change.
 */
export function calibrateInches(inches: number): number {
  const factor = Number(process.env.SCORE_CALIBRATION);
  const scale = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return num(inches * scale);
}

export function rackIsUnmeasurable(rack: RackEstimate): boolean {
  const tineLengths = [rack.tines.left, rack.tines.right].flatMap((side) => Object.values(side));
  return rack.beams.left <= 0 && rack.beams.right <= 0 && rack.insideSpread <= 0 && tineLengths.every((length) => length <= 0);
}

export function readScale(value: unknown): ScaleEstimate {
  const source = (value ?? {}) as Record<string, unknown>;
  const method =
    source.method === "skull-landmark" || source.method === "ear-spread" || source.method === "hybrid"
      ? source.method
      : "unknown";
  const confidence = source.confidence === "High" || source.confidence === "Low" ? source.confidence : "Med";
  return {
    pixelsPerInch: num(source.pixelsPerInch),
    noseToEyeInches: source.noseToEyeInches == null ? null : num(source.noseToEyeInches),
    earSpreadInches: source.earSpreadInches == null ? null : num(source.earSpreadInches),
    method,
    confidence,
    note: typeof source.note === "string" ? source.note : "",
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function medianSide(sides: Record<string, number>[], keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const values = sides.map((sideValues) => sideValues[key] ?? 0).filter((value) => value > 0);
    if (values.length > 0) out[key] = num(median(values));
  }
  return out;
}

export function consensusRack(frames: RackEstimate[]): RackEstimate {
  const valid = frames.filter((frame) => frame.isValidDeer && (frame.beams.left > 0 || frame.beams.right > 0 || frame.insideSpread > 0));
  const source = valid.length > 0 ? valid : frames;
  const merged = scoreRack({
    isValidDeer: source.some((frame) => frame.isValidDeer),
    invalidReason: source.find((frame) => frame.invalidReason)?.invalidReason,
    beams: {
      left: median(source.map((frame) => frame.beams.left).filter((value) => value > 0)),
      right: median(source.map((frame) => frame.beams.right).filter((value) => value > 0)),
    },
    tines: {
      left: medianSide(source.map((frame) => frame.tines.left as Record<string, number>), TINE_KEYS),
      right: medianSide(source.map((frame) => frame.tines.right as Record<string, number>), TINE_KEYS),
    },
    mass: {
      left: medianSide(source.map((frame) => frame.mass.left as Record<string, number>), MASS_KEYS),
      right: medianSide(source.map((frame) => frame.mass.right as Record<string, number>), MASS_KEYS),
    },
    abnormal: source[0]?.abnormal ?? [],
    insideSpread: median(source.map((frame) => frame.insideSpread).filter((value) => value > 0)),
    pointEnumeration: source.find((frame) => frame.pointEnumeration)?.pointEnumeration ?? "",
    confidence: source[0]?.confidence ?? "Med",
    ageYears: roundHalf(median(source.map((frame) => frame.ageYears).filter((value) => value > 0))),
    topCues: source[0]?.topCues ?? [],
    scale: source.find((frame) => frame.scale.pixelsPerInch > 0)?.scale ?? source[0]?.scale,
  });
  return merged;
}
