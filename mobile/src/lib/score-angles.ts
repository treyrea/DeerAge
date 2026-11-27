/**
 * Extra stills for one rack. The pending score is read once when the scan starts.
 */

import { MAX_SCORE_IMAGES, type AngleShot } from "../../../shared/score-angles";

export type { AngleShot } from "../../../shared/score-angles";

export {
  ANGLE_HINTS,
  EXTRA_ANGLES,
  FIRST_ANGLE,
  MAX_SCORE_IMAGES,
  distinctAngleCount,
  nextExtraAngle,
  offerRackScore,
  scoreSetFromFrames,
  withExtraAngle,
} from "../../../shared/score-angles";

/** Off until a later phone update turns extra angles back on. Server support stays in place. */
export const MULTI_ANGLE_ENABLED = false;

/** The Add more angles entry on a score result. */
export function canAddMoreAngles(input?: { angleCount?: number | null; imageUri?: string | null } | null): boolean {
  if (!MULTI_ANGLE_ENABLED) return false;
  if (!input?.imageUri) return false;
  return (input.angleCount ?? 1) < MAX_SCORE_IMAGES;
}

export interface PendingAngleScore {
  rescoreOf: string | null;
  shots: AngleShot[];
}

let pending: PendingAngleScore | null = null;

export function angleScoreMatches(
  queued: PendingAngleScore | null,
  frames: readonly { imageUri?: string | null }[],
): queued is PendingAngleScore {
  return Boolean(
    queued
    && queued.shots.length > 0
    && queued.shots.length === frames.length
    && queued.shots.every((shot, index) => frames[index]?.imageUri === shot.imageUri),
  );
}

export function peekAngleScore(): PendingAngleScore | null {
  return pending;
}

export function beginAngleScore(next: PendingAngleScore): void {
  pending = next;
}

export function consumeAngleScore(): PendingAngleScore | null {
  const next = pending;
  pending = null;
  return next;
}
