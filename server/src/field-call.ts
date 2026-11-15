/**
 * Lease call. Compared with the hunter's minimum shooter age, not a fixed 4.5.
 * Old clients ignore these fields. decision and shooterPassLabel stay as they were.
 */

export type FieldCall = "SHOOTER" | "LET WALK" | "BORDERLINE";

export interface CueBullet {
  area: string;
  text: string;
}

export interface FieldRead {
  fieldCall: FieldCall;
  fieldCallNote: string;
  ageClass: string;
  leaseMinimum: number;
  cueBullets: CueBullet[];
}

const STEPS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];

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

export function classStep(years: number): number {
  let picked = STEPS[0];
  for (const step of STEPS) {
    if (years + 0.001 >= step) picked = step;
  }
  return picked;
}

export function classLabel(step: number): string {
  return step >= 6.5 ? "6.5+" : step.toFixed(1);
}

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

export function fieldRead(ageYears: number, _confidence: number, minimum = 4.5, _spread = 0): Omit<FieldRead, "cueBullets"> {
  return finalCall({ mainYears: ageYears, bodyYears: null, minimum, confirmed: true });
}

/** Point estimate against the lease minimum. A 1.5 or 2.5 body vetoes a SHOOTER. */
export function finalCall(input: {
  mainYears: number | null;
  bodyYears: number | null;
  minimum: number;
  confirmed: boolean;
}): Omit<FieldRead, "cueBullets"> {
  const leaseMinimum = classStep(input.minimum);
  const minimumLabel = classLabel(leaseMinimum);
  if (!input.confirmed || input.mainYears == null) {
    return {
      fieldCall: "BORDERLINE",
      ageClass: input.bodyYears == null ? "" : classLabel(classStep(input.bodyYears)),
      leaseMinimum,
      fieldCallNote: `Couldn't confirm this buck, and your minimum is ${minimumLabel}. Don't risk the fine.`,
    };
  }
  const estimate = classStep(input.mainYears);
  const ageClass = classLabel(estimate);
  const body = input.bodyYears == null ? null : classStep(input.bodyYears);
  if (estimate >= leaseMinimum && body != null && body <= 2.5) {
    return {
      fieldCall: "BORDERLINE",
      ageClass,
      leaseMinimum,
      fieldCallNote: `Big rack, young body. The body reads ${classLabel(body)}, and your minimum is ${minimumLabel}.`,
    };
  }
  if (estimate >= leaseMinimum) {
    return {
      fieldCall: "SHOOTER",
      ageClass,
      leaseMinimum,
      fieldCallNote: `Reads ${ageClass}, at or above your lease minimum of ${minimumLabel}. This is a field read from the photo, not a jawbone age.`,
    };
  }
  return {
    fieldCall: "LET WALK",
    ageClass,
    leaseMinimum,
    fieldCallNote: `Reads ${ageClass}, under your lease minimum of ${minimumLabel}. Let him walk. This is a field read from the photo, not a jawbone age.`,
  };
}

export function fieldBundle(
  ageYears: number,
  confidence: number,
  rawCues: unknown,
  topCues: unknown,
  minimum = 4.5,
  spread = 0,
): FieldRead {
  return { ...fieldRead(ageYears, confidence, minimum, spread), cueBullets: cueBulletsFrom(rawCues, topCues) };
}
