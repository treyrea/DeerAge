/**
 * A score job can return a gross with no tine lengths.
 * The local calculator would turn that into 0. Keep the server gross instead.
 */

const TINE_KEYS = ["g1", "g2", "g3", "g4", "g5", "g6"] as const;

export function serverGrossForMissingTines(
  leftTines: Record<string, number>,
  rightTines: Record<string, number>,
  abnormalCount: number,
  grossScore: unknown,
): number | null {
  const hasTine = TINE_KEYS.some((key) => (leftTines[key] ?? 0) > 0 || (rightTines[key] ?? 0) > 0);
  if (hasTine || abnormalCount > 0) return null;
  const gross = typeof grossScore === "number"
    ? grossScore
    : typeof grossScore === "string"
      ? Number.parseFloat(grossScore)
      : 0;
  return Number.isFinite(gross) && gross > 0 ? gross : null;
}
