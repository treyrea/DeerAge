export type FieldCall = "Shooter" | "Pass" | "Borderline";
export type Maturity = "young" | "mature";

export interface CueBullet {
  area: string;
  text: string;
}

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

export function fieldRead(ageYears: number, confidence: number): { maturity: Maturity; fieldCall: FieldCall; fieldCallNote: string } {
  const mature = ageYears >= 4.5;
  const straddles = ageYears >= 3.5 && ageYears < 4.5;
  const uncertain = confidence < 55 || straddles;
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
