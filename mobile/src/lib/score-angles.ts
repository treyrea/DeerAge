/**
 * Extra stills for one rack. The pending score is read once when the scan starts.
 */

import type { AngleShot } from "../../../shared/score-angles";

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
