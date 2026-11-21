/**
 * 1.0.10 cross-check parse and decision rules. The model only reports facts.
 * Port of parse_cc and apply_rules. Unknown labels become CANT_TELL.
 */

export const RETAKE_CONFLICT_OLD =
  "The body looks like an older buck, but the rack is narrow and light, inside the ears, like a young buck's. A rut-swollen neck can make a young buck look older. Try a side-on photo of the whole deer with the head up.";

export const RETAKE_CONFLICT_YOUNG =
  "The body looks young, but the rack is wide, heavy and long-tined like an older buck's. Try a side-on photo of the whole deer with the head up.";

const ALLOWED: Record<string, ReadonlySet<string>> = {
  legs_vs_chest: new Set(["LEGS_LONGER", "ABOUT_EQUAL", "LEGS_SHORTER", "CANT_TELL"]),
  belly_line: new Set(["TUCK_UP", "STRAIGHT", "SAG", "CANT_TELL"]),
  back_line: new Set(["LEVEL", "SWAYED", "CANT_TELL"]),
  front_vs_rear: new Set(["FRONT_MUCH_HEAVIER", "SIMILAR", "CANT_TELL"]),
  brisket: new Set(["YES", "NO", "CANT_TELL"]),
  face_to_camera: new Set(["YES", "NO", "CANT_TELL"]),
  object_in_front: new Set(["YES", "NO", "CANT_TELL"]),
  object_on_head_neck: new Set(["YES", "NO", "CANT_TELL"]),
  spread_vs_ears: new Set(["INSIDE", "EVEN", "OUTSIDE", "CANT_TELL"]),
  beam_mass: new Set(["THIN", "MEDIUM", "HEAVY", "CANT_TELL"]),
  tines_vs_ears: new Set(["YES", "NO", "CANT_TELL"]),
};

const FACT_KEYS = Object.keys(ALLOWED);

export interface CrossCheck {
  legs_vs_chest: string;
  belly_line: string;
  back_line: string;
  front_vs_rear: string;
  brisket: string;
  face_to_camera: string;
  object_in_front: string;
  object_on_head_neck: string;
  spread_vs_ears: string;
  beam_mass: string;
  tines_vs_ears: string;
  points_one_side: number | null;
  object_in_front_part: string;
}

export interface RuleDecision {
  kind: "age" | "retake";
  lo: number;
  hi: number;
  rule: string;
  reason: string;
}

export function parseCc(text: string | null | undefined): CrossCheck | null {
  let t = (text ?? "").trim();
  t = t.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(t.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  const out: Record<string, string | number | null> = {};
  for (const key of FACT_KEYS) {
    const value = String(row[key] ?? "").trim().toUpperCase();
    out[key] = ALLOWED[key].has(value) ? value : "CANT_TELL";
  }
  const points = String(row.points_one_side ?? "").trim();
  out.points_one_side = /^\d+$/.test(points) ? Number.parseInt(points, 10) : null;
  const part = row.object_in_front_part;
  out.object_in_front_part = part == null || part === "" ? "" : String(part);
  return out as unknown as CrossCheck;
}

export function strongRackCount(cc: CrossCheck): number {
  const points = cc.points_one_side;
  return [
    cc.spread_vs_ears === "OUTSIDE",
    Boolean(points && points >= 5),
    cc.beam_mass === "HEAVY",
    cc.tines_vs_ears === "YES",
  ].filter(Boolean).length;
}

export function nonBabySigns(cc: CrossCheck): string[] {
  const points = cc.points_one_side;
  const signs: string[] = [];
  if (cc.belly_line === "STRAIGHT" || cc.belly_line === "SAG") signs.push("belly not tucked");
  if (points && points >= 4) signs.push(`${points} points on one side`);
  if (cc.spread_vs_ears === "OUTSIDE") signs.push("spread outside the ears");
  if (cc.beam_mass === "MEDIUM" || cc.beam_mass === "HEAVY") signs.push(`antler mass ${cc.beam_mass.toLowerCase()}`);
  return signs;
}

/**
 * Rules run in this order: R4a, R1, R3, R5, R4b.
 * A null cross-check leaves the walk age unchanged.
 */
export function applyRules(lo: number, hi: number, cc: CrossCheck | null, viaBabyGate = false): RuleDecision {
  if (cc == null) {
    return { kind: "age", lo, hi, rule: "none_no_crosscheck", reason: "" };
  }
  const youngRack = cc.spread_vs_ears === "INSIDE" && (cc.beam_mass === "THIN" || cc.tines_vs_ears === "NO");
  if (viaBabyGate) {
    const signs = nonBabySigns(cc);
    if (signs.length > 0) {
      return {
        kind: "age",
        lo: 1.5,
        hi: 2.5,
        rule: "R4a_baby_needs_agreement",
        reason: `Baby check said yearling, but: ${signs.join(", ")}`,
      };
    }
    return { kind: "age", lo: 1.5, hi: 1.5, rule: "none", reason: "" };
  }
  if (lo >= 4.5 && youngRack) {
    return { kind: "retake", lo, hi, rule: "R1_old_call_young_rack", reason: RETAKE_CONFLICT_OLD };
  }
  if (lo === 4.5 && hi === 4.5 && cc.spread_vs_ears === "OUTSIDE" && (cc.points_one_side ?? 0) >= 4) {
    return {
      kind: "age",
      lo: 4.5,
      hi: 5.5,
      rule: "R3_single45_wide_rack",
      reason: "wide rack; 4.5 vs 5.5+ not separable from body",
    };
  }
  if (hi <= 3.5 && strongRackCount(cc) >= 3) {
    if (lo === hi) {
      return { kind: "age", lo, hi: lo + 1, rule: "R5_young_call_strong_rack", reason: "strong rack widens up one class" };
    }
    return { kind: "retake", lo, hi, rule: "R5_young_range_strong_rack", reason: RETAKE_CONFLICT_YOUNG };
  }
  if (lo === 2.5 && hi === 2.5 && cc.spread_vs_ears === "INSIDE" && cc.beam_mass === "THIN") {
    return { kind: "age", lo: 1.5, hi: 2.5, rule: "R4b_single25_yearling_rack", reason: "narrow thin rack; 1.5 vs 2.5 not separable" };
  }
  return { kind: "age", lo, hi, rule: "none", reason: "" };
}
