/**
 * Size a photo frame so the whole photo shows (no cover crop).
 * The frame takes the photo's own shape, capped at maxHeight; anything
 * taller is letterboxed by the caller with contain.
 */
export function fittedPhotoHeight(
  frameWidth: number,
  photoAspect: number | null,
  maxHeight: number,
  fallbackHeight: number,
): number {
  if (!(frameWidth > 0) || !photoAspect || !(photoAspect > 0) || !Number.isFinite(photoAspect)) {
    return fallbackHeight;
  }
  return Math.round(Math.min(maxHeight, frameWidth / photoAspect));
}

/** Side of the square counting box: as wide as the space allows, never over maxSize. */
export function countingBoxSize(rowWidth: number, maxSize: number): number {
  if (!(rowWidth > 0)) return maxSize;
  return Math.floor(Math.min(rowWidth, maxSize));
}
