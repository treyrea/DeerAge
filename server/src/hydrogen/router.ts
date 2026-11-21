/**
 * Plain-first router C4nr. Pure function: no I/O and no model calls.
 *
 * plain is the plain model's first-stated age, [lo, hi], or null.
 * ours is the 1.0.10 answer: ["age", lo, hi], ["retake"], or null.
 * 5.5 means 5.5+. The result is one class or a 1-year range, unless both inputs are unusable.
 */

export const CLASSES = [1.5, 2.5, 3.5, 4.5, 5.5] as const;

export type Ours = ["age", number, number] | ["retake"] | null;
export type PlainAge = [number | null, number | null] | null;

export interface RouteResult {
  lo: number | null;
  hi: number | null;
  is_range: boolean;
  label: string;
  branch: string;
  source: "plain" | "ours" | "both" | "retake" | "none";
}

export function cls(age: number | null | undefined): number | null {
  if (age == null || Number.isNaN(age)) return null;
  if (age < 1.5) return 0.5;
  if (age >= 5.5) return 5.5;
  return age % 1 !== 0.5 ? Math.trunc(age) + 0.5 : age;
}

export function classIndex(age: number | null): number | null {
  if (age == null) return null;
  const index = CLASSES.indexOf(age as (typeof CLASSES)[number]);
  return index === -1 ? null : index;
}

function side(age: number): string {
  return age >= 5.5 ? "5.5+" : String(age);
}

export function formatAgeLabel(lo: number, hi: number): string {
  return lo === hi ? side(lo) : `${side(lo)}\u2013${side(hi)}`;
}

function out(lo: number, hi: number, branch: string, source: RouteResult["source"]): RouteResult {
  return { lo, hi, is_range: lo !== hi, label: formatAgeLabel(lo, hi), branch, source };
}

/** A 1-year range in the model's own wording stays a range. Anything else shows its first class. Under 1.5 is shown as 1.5. */
function showPlain(plain: [number | null, number | null], branch: string): RouteResult {
  const left = cls(plain[0]);
  const right = cls(plain[1]);
  const leftIndex = classIndex(left);
  const rightIndex = classIndex(right);
  if (left != null && right != null && left !== right && leftIndex != null && rightIndex != null && rightIndex - leftIndex === 1) {
    return out(left, right, branch, "plain");
  }
  const shown = Math.max(left ?? 1.5, 1.5);
  return out(shown, shown, branch, "plain");
}

export function route(plain: PlainAge, ours: Ours): RouteResult {
  const plainOk = plain != null && plain[0] != null;
  const oursRetake = ours != null && ours[0] === "retake";
  const oursOk = ours != null && ours[0] === "age";
  if (!plainOk && !oursOk) {
    if (oursRetake) {
      return { lo: null, hi: null, is_range: false, label: "RETAKE", branch: "F0_retake_plain_failed", source: "retake" };
    }
    return { lo: null, hi: null, is_range: false, label: "", branch: "F0_no_answer", source: "none" };
  }
  if (oursRetake) return showPlain(plain as [number | null, number | null], "R1_ours_retake_use_plain");
  if (!plainOk) return out(cls(ours![1]) as number, cls(ours![2]) as number, "F1_plain_failed_use_ours", "ours");
  if (!oursOk) return showPlain(plain as [number | null, number | null], "F2_ours_failed_use_plain");

  const oursLo = cls(ours![1]) as number;
  const oursHi = cls(ours![2]) as number;
  const first = cls(plain![0]) as number;
  const oursMature = oursHi >= 4.5;
  const plainYoung = first <= 3.5;

  if (oursMature && plainYoung) return out(oursLo, oursHi, "M1_ours_mature_plain_young", "ours");
  if (oursMature && first >= 4.5) return out(oursLo, oursHi, "M2_both_mature", "ours");
  if (oursLo <= first && first <= oursHi) {
    if (cls(plain![0]) === cls(plain![1])) return out(first, first, "A1_plain_inside_ours", "plain");
    return showPlain(plain as [number | null, number | null], "A1_plain_inside_ours");
  }
  const near = first < oursLo ? oursLo : oursHi;
  const firstIndex = classIndex(first);
  const nearIndex = classIndex(near);
  if (first >= 1.5 && firstIndex != null && nearIndex != null && Math.abs(firstIndex - nearIndex) === 1) {
    return out(Math.min(first, near), Math.max(first, near), "D1_one_class_apart_range", "both");
  }
  return out(oursLo, oursHi, "D2_far_apart_use_ours", "ours");
}

export function isSingleOrOneYear(result: RouteResult): boolean {
  if (result.lo == null || result.hi == null) return result.label === "RETAKE" || result.label === "";
  const low = classIndex(result.lo);
  const high = classIndex(result.hi);
  return low != null && high != null && (high === low || high === low + 1);
}
