/**
 * Field call shown ahead of the age class and the score.
 * Old clients ignore these fields. decision and shooterPassLabel stay as they were.
 */

export type FieldCall = "Shooter" | "Pass" | "Borderline";
export type Maturity = "young" | "mature";

export interface CueBullet {
  area: string;
  text: string;
}

export interface FieldRead {
  maturity: Maturity;
  fieldCall: FieldCall;
  fieldCallNote: string;
  cueBullets: CueBullet[];
}

const AREA_FOR: Record<string, string> = {
  neck_thickness: "Neck",
  neck: "Neck",
  chest_depth: "Chest",
  brisket: "Chest",
  chest: "Chest",
  backline: "Body",
  body: "Body",
  belly: "Belly",
  leg_proportion: "Legs",
  legs: "Legs",
  face_shape: "Face",
  face: "Face",
  rump_ham: "Body",
  waist_tuck: "Belly",
  muscle_definition: "Body",
  rack: "Rack",
  antler: "Rack",
};

function areaOf(name: unknown, fallback = "Body"): string {
  if (typeof name !== "string") return fallback;
  const key = name.trim().toLowerCase().replace(/\s+/g, "_");
  return AREA_FOR[key] ?? (name.length <= 16 ? name.trim() : fallback);
}

export function cueBulletsFrom(rawCues: unknown, topCues: unknown): CueBullet[] {
  const bullets: CueBullet[] = [];
  if (Array.isArray(rawCues)) {
    for (const row of rawCues) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const text = typeof item.text === "string"
        ? item.text
        : typeof item.pattern === "string"
          ? item.pattern
          : "";
      const trimmed = text.trim();
      if (!trimmed) continue;
      bullets.push({ area: areaOf(item.area ?? item.name ?? item.displayName), text: trimmed.slice(0, 90) });
    }
  }
  if (bullets.length === 0 && Array.isArray(topCues)) {
    for (const cue of topCues) {
      if (typeof cue !== "string" || !cue.trim()) continue;
      bullets.push({ area: "Body", text: cue.trim().slice(0, 90) });
    }
  }
  return bullets.slice(0, 6);
}

export function fieldRead(ageYears: number, confidence: number, spread = 0): Omit<FieldRead, "cueBullets"> {
  const mature = ageYears >= 4.5;
  const straddles = ageYears >= 3.5 && ageYears < 4.5;
  const uncertain = confidence < 55 || spread >= 1.5 || straddles;
  const maturity: Maturity = mature ? "mature" : "young";
  if (uncertain) {
    return {
      maturity,
      fieldCall: "Borderline",
      fieldCallNote: "Borderline, take a closer look. The photo does not settle whether this buck is 4.5 or older. This is a field read, not a known age.",
    };
  }
  if (mature) {
    return {
      maturity,
      fieldCall: "Shooter",
      fieldCallNote: "The body reads mature, likely 4.5 or older. This is a field read from the photo, not a known age.",
    };
  }
  return {
    maturity,
    fieldCall: "Pass",
    fieldCallNote: "The body reads young, likely under 4.5. This is a field read from the photo, not a known age.",
  };
}

export function fieldBundle(ageYears: number, confidence: number, rawCues: unknown, topCues: unknown, spread = 0): FieldRead {
  return { ...fieldRead(ageYears, confidence, spread), cueBullets: cueBulletsFrom(rawCues, topCues) };
}
