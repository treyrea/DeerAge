// Copy of shared/score-angles.ts. Vercel's server bundle cannot import named
// exports from ../../shared at runtime (FUNCTION_INVOCATION_FAILED on the PR #54
// preview). Keep in sync with shared/score-angles.ts.
/** Distinct rack angles. A burst is still one angle. The server accepts at most 4 images. */

export const MAX_SCORE_IMAGES = 4;

export const FIRST_ANGLE = "First angle";

export const EXTRA_ANGLES = [
  "Other side",
  "Front (facing you)",
  "Three-quarter view",
] as const;

export const ANGLE_HINTS: Record<(typeof EXTRA_ANGLES)[number], string> = {
  "Other side": "Walk around to the far side of the rack.",
  "Front (facing you)": "Face the deer so both sides show.",
  "Three-quarter view": "Stand a little past the side so the depth shows.",
};

const DEFAULTS = [FIRST_ANGLE, ...EXTRA_ANGLES];

export function cleanAngleName(value: unknown, index: number): string {
  const fallback = DEFAULTS[index] ?? `Angle ${index + 1}`;
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return cleaned || fallback;
}

/**
 * Named angles only when the hunter sent 2 or more labels with 2 or more photos.
 * A one-angle burst sends several frames and no labels, so this stays null.
 */
export function angleNamesFor(imageCount: number, provided: unknown): string[] | null {
  if (imageCount <= 1 || !Array.isArray(provided) || provided.length < 2) return null;
  const count = Math.min(imageCount, MAX_SCORE_IMAGES);
  return Array.from({ length: count }, (_, index) => cleanAngleName(provided[index], index));
}

export function distinctAngleCount(labels: ReadonlyArray<string | null | undefined> | null | undefined): number {
  if (!labels || labels.length === 0) return 1;
  const named = new Set(labels.map((label) => (typeof label === "string" ? label.trim() : "")).filter((label) => label.length > 0));
  return named.size > 0 ? named.size : 1;
}

export interface AngleShot {
  imageUri: string;
  angleLabel: string;
}

/** One photo per angle. A burst with no labels collapses to the first frame. */
export function scoreSetFromFrames(frames: ReadonlyArray<{ imageUri?: string | null; angleLabel?: string | null }>): AngleShot[] {
  const usable = frames.filter((frame): frame is { imageUri: string; angleLabel?: string | null } => typeof frame.imageUri === "string" && frame.imageUri.length > 0);
  const labeled = usable.filter((frame) => typeof frame.angleLabel === "string" && frame.angleLabel.trim().length > 0);
  if (labeled.length > 0) {
    const seen = new Set<string>();
    const shots: AngleShot[] = [];
    for (const frame of labeled) {
      const angleLabel = frame.angleLabel?.trim() ?? "";
      if (!angleLabel || seen.has(angleLabel)) continue;
      seen.add(angleLabel);
      shots.push({ imageUri: frame.imageUri, angleLabel });
      if (shots.length >= MAX_SCORE_IMAGES) break;
    }
    return shots;
  }
  const first = usable[0];
  return first ? [{ imageUri: first.imageUri, angleLabel: FIRST_ANGLE }] : [];
}

export function withExtraAngle(current: ReadonlyArray<AngleShot>, imageUri: string, angleLabel: string): AngleShot[] {
  if (!imageUri) return [...current];
  const next = current.filter((shot) => shot.angleLabel !== angleLabel);
  if (next.length >= MAX_SCORE_IMAGES) return [...current];
  next.push({ imageUri, angleLabel });
  return next;
}

/** The next guided still that is not already in the set. Null when 4 angles are filled or none remain. */
export function nextExtraAngle(labels: ReadonlyArray<string>): string | null {
  if (labels.length >= MAX_SCORE_IMAGES) return null;
  const have = new Set(labels.map((label) => label.trim()));
  return EXTRA_ANGLES.find((label) => !have.has(label)) ?? null;
}

const BLOCKED_STOPS = new Set(["no_antlers", "not_live", "harvested", "not_deer", "no_deer", "doe"]);

/**
 * A finished age can offer a rack score. Does, no-antler deer, mounts, and other
 * not-live stops cannot. A missing antler flag still offers it: those stops never
 * return an age.
 */
export function offerRackScore(input?: { antlers?: string | null; stop?: string | null } | null): boolean {
  if (!input) return false;
  const stop = (input.stop ?? "").trim().toLowerCase();
  if (BLOCKED_STOPS.has(stop)) return false;
  const antlers = (input.antlers ?? "").trim().toUpperCase();
  if (antlers === "NO") return false;
  return true;
}
