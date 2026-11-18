export type FieldCall = "SHOOTER" | "LET WALK" | "BORDERLINE";

export interface CueBullet {
  area: string;
  text: string;
}

const STEPS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];

const AREA_FOR: Record<string, string> = {
  neck_thickness: "Neck",
  chest_depth: "Chest",
  brisket: "Chest",
  backline: "Body",
  belly: "Belly",
  leg_proportion: "Legs",
  face_shape: "Face",
  rump_ham: "Body",
  waist_tuck: "Belly",
  muscle_definition: "Body",
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

function shiftStep(years: number, delta: number): number {
  const index = STEPS.indexOf(classStep(years));
  const next = Math.max(0, Math.min(STEPS.length - 1, index + delta));
  return STEPS[next];
}

function windowSteps(_confidence: number): number {
  return 0;
}

export function fieldRead(ageYears: number, confidence: number, minimum = 4.5): {
  fieldCall: FieldCall;
  fieldCallNote: string;
  ageClass: string;
  leaseMinimum: number;
} {
  const leaseMinimum = classStep(minimum);
  const estimate = classStep(ageYears);
  const steps = windowSteps(confidence);
  const low = shiftStep(ageYears, -steps);
  const high = shiftStep(ageYears, steps);
  const ageClass = classLabel(estimate);
  const minimumLabel = classLabel(leaseMinimum);
  if (low >= leaseMinimum) {
    return {
      fieldCall: "SHOOTER",
      ageClass,
      leaseMinimum,
      fieldCallNote: `Reads ${ageClass}, at or above your lease minimum of ${minimumLabel}. This is a field read from the photo, not a jawbone age.`,
    };
  }
  if (high < leaseMinimum) {
    return {
      fieldCall: "LET WALK",
      ageClass,
      leaseMinimum,
      fieldCallNote: `Reads ${ageClass}, under your lease minimum of ${minimumLabel}. Let him walk. This is a field read from the photo, not a jawbone age.`,
    };
  }
  const below = classLabel(Math.min(estimate, shiftStep(leaseMinimum, -1)));
  const above = classLabel(Math.max(estimate, leaseMinimum));
  return {
    fieldCall: "BORDERLINE",
    ageClass,
    leaseMinimum,
    fieldCallNote: `Could be ${below} or ${above}, and your minimum is ${minimumLabel}. Don't risk the fine.`,
  };
}

export function normalizeFieldCall(value: unknown): FieldCall | undefined {
  if (value === "SHOOTER" || value === "Shooter") return "SHOOTER";
  if (value === "LET WALK" || value === "Pass") return "LET WALK";
  if (value === "BORDERLINE" || value === "Borderline") return "BORDERLINE";
  return undefined;
}

export function bulletsFrom(raw: unknown, fallback: string[]): CueBullet[] {
  if (Array.isArray(raw)) {
    const bullets = raw.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as { area?: unknown; text?: unknown; name?: unknown; pattern?: unknown; displayName?: unknown };
      const text = typeof item.text === "string" ? item.text : typeof item.pattern === "string" ? item.pattern : "";
      if (!text.trim()) return [];
      const named = typeof item.area === "string" ? item.area : AREA_FOR[String(item.name)] ?? (typeof item.displayName === "string" ? item.displayName : "Body");
      return [{ area: named, text: text.trim() }];
    });
    if (bullets.length > 0) return bullets.slice(0, 6);
  }
  return fallback.filter((line) => line.trim()).slice(0, 4).map((text) => ({ area: "Body", text }));
}

/** A confirmed age agrees with the call only when the call was firm. */
export function confirmedAgeMatchesCall(fieldCall: string, confirmedAge: string, minimum: number): boolean {
  if (fieldCall !== "SHOOTER" && fieldCall !== "LET WALK") return false;
  const years = Number.parseFloat(confirmedAge);
  if (!Number.isFinite(years)) return false;
  const meets = classStep(years) >= classStep(minimum);
  return fieldCall === "SHOOTER" ? meets : !meets;
}

export function harvestComparedToMinimum(confirmedAge: string, minimum: number): string | null {
  const years = Number.parseFloat(confirmedAge);
  if (!Number.isFinite(years)) return null;
  const confirmed = classLabel(classStep(years));
  const lease = classLabel(classStep(minimum));
  if (classStep(years) >= classStep(minimum)) {
    return `Confirmed ${confirmed}. That meets your lease minimum of ${lease}.`;
  }
  return `Confirmed ${confirmed}. That is under your lease minimum of ${lease}.`;
}
